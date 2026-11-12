import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Upload,
  X,
  Download,
  Filter,
  CheckCheck,
  FileSpreadsheet,
  Copy,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { OperationalInput, OperationalRecord } from '../types';
import { scanRecordsForAnomalies } from '../utils/anomalyValidation';
import { AnomalyWarningModal } from './AnomalyWarningModal';
import {
  findExactDuplicate,
  classifyImportRows,
  ImportClassification,
} from '../utils/duplicateValidation';
import {
  autoNormalizeDiamondData,
  cleanNumericValue,
  standardizeDate,
  standardizeTime,
} from '../utils/dataNormalizer';
import { isTimeInRange19to21 } from '../utils/calculations';

interface DatasetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportData: (records: OperationalInput[]) => void;
  existingRecords?: OperationalRecord[];
}

export const DatasetImportModal: React.FC<DatasetImportModalProps> = ({
  isOpen,
  onClose,
  onImportData,
  existingRecords = [],
}) => {
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<OperationalInput[]>([]);
  const [filter19to21Only, setFilter19to21Only] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showAnomalyModal, setShowAnomalyModal] = useState<boolean>(false);

  // Filter rows if user chooses representative operating window (range 19:00 - 21:00)
  const displayedRows = useMemo(() => {
    return filter19to21Only
      ? previewRows.filter((r) => isTimeInRange19to21(r.time) || r.realPower >= 21.0)
      : previewRows;
  }, [filter19to21Only, previewRows]);

  // Scan displayed rows for anomalies
  const detectedAnomalies = useMemo(() => {
    return scanRecordsForAnomalies(displayedRows);
  }, [displayedRows]);

  // Classify rows into New, Updated, and Identical relative to existing system records
  const importClassification = useMemo<ImportClassification>(() => {
    if (!existingRecords || existingRecords.length === 0 || displayedRows.length === 0) {
      return {
        newRows: displayedRows.map((row, index) => ({ row, index })),
        updatedRows: [],
        identicalRows: [],
      };
    }
    return classifyImportRows(displayedRows, existingRecords);
  }, [displayedRows, existingRecords]);

  // Summary counts of parameters detected in rows
  const parameterPresence = useMemo(() => {
    if (previewRows.length === 0) return { hasT17: false, hasNHSpeed: false };
    const hasT17 = previewRows.some((r) => r.T1_7 !== undefined && r.T1_7 !== null && !isNaN(r.T1_7));
    const hasNHSpeed = previewRows.some((r) => r.nhSpeed !== undefined && r.nhSpeed !== null && !isNaN(r.nhSpeed));
    return { hasT17, hasNHSpeed };
  }, [previewRows]);

  // Detect exact duplicate rows against existing records in system (kept for backward compatibility & indicators)
  const duplicateIndices = useMemo(() => {
    return new Set<number>(importClassification.identicalRows.map((item) => item.index));
  }, [importClassification]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset file input and preview state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setUploadedFileName(null);
      setParseError(null);
      setIsLoadingFile(false);
      setIsDragOver(false);
      setPreviewRows([]);
      setFilter19to21Only(false);
      setSkipDuplicates(true);
      setShowAnomalyModal(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parseCsvContent = (text: string, fileName?: string | null) => {
    setParseError(null);
    setIsLoadingFile(false);
    if (!text.trim()) {
      setParseError('Silakan pilih file Excel (.xlsx) atau CSV terlebih dahulu.');
      return;
    }

    try {
      const result = autoNormalizeDiamondData(text, fileName || undefined);

      if (result.extractedRecords.length === 0) {
        setParseError(
          result.warnings.length > 0
            ? result.warnings.join(' ')
            : 'Tidak ada baris data valid yang dapat diekstrak. Pastikan parameter turbin (P1.7, P3.0, Beban, NPHR) tersedia pada file.'
        );
        return;
      }

      setPreviewRows(result.extractedRecords);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal memproses file.';
      setParseError(`Parse error: ${errMsg}`);
    }
  };

  // Direct worksheet parser as fallback if CSV string conversion loses cell formats
  const parseWorksheetDirectly = (worksheet: XLSX.WorkSheet): OperationalInput[] => {
    if (!worksheet || !worksheet['!ref']) return [];
    try {
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
      if (rows.length < 2) return [];

      let headerRowIdx = -1;
      let maxScore = -1;

      // Scan first 25 rows to identify the true header row
      for (let r = 0; r < Math.min(25, rows.length); r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        let score = 0;
        for (const cell of row) {
          const s = String(cell || '').toLowerCase().trim();
          if (s.includes('pt007') || s.includes('p3.0') || s.includes('discharge') || s.includes('pt-007') || s.includes('pb aktual')) score += 5;
          if (s.includes('pt006') || s.includes('p1.7') || s.includes('inlet') || s.includes('pt-006')) score += 5;
          if (s.includes('tanggal') || s.includes('date') || s.includes('tgl') || s.includes('waktu')) score += 3;
          if (s.includes('beban') || s.includes('power') || s.includes('mw') || s.includes('load')) score += 3;
          if (s.includes('nh') || s.includes('speed') || s.includes('rpm')) score += 2;
          if (s.includes('t1.7') || s.includes('t17') || s.includes('temp') || s.includes('suhu')) score += 2;
        }
        if (score > maxScore) {
          maxScore = score;
          headerRowIdx = r;
        }
      }

      if (headerRowIdx === -1 || maxScore < 3) headerRowIdx = 0;
      const headers = (rows[headerRowIdx] || []).map((h: any) => String(h || '').toLowerCase().trim());

      const findIdx = (patterns: string[]) => {
        return headers.findIndex((h) => patterns.some((p) => h.includes(p)));
      };

      const dateIdx = findIdx(['tanggal', 'date', 'tgl', 'waktu & tanggal', 'tanggal & waktu']);
      const timeIdx = findIdx(['waktu', 'time', 'jam', 'pukul']);
      const p3Idx = findIdx(['pt007', 'p3.0', 'p30', 'discharge', 'pt-007', 'pb aktual', 'pb testing', '★ pt007']);
      const p1Idx = findIdx(['pt006', 'p1.7', 'p17', 'inlet', 'pt-006']);
      const powerIdx = findIdx(['beban', 'power', 'mw', 'load', 'turbin']);
      const nhIdx = findIdx(['nh speed', 'nh', 'speed', 'rpm']);
      const t17Idx = findIdx(['t1.7', 't17', 'temp', 'suhu']);
      const nphrIdx = findIdx(['nphr', 'heat rate', 'hr']);

      const records: OperationalInput[] = [];
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        const p3Raw = p3Idx >= 0 ? cleanNumericValue(String(row[p3Idx] ?? '')) : null;
        if (p3Raw === null) continue; // Row must contain discharge pressure

        const p1Raw = p1Idx >= 0 ? cleanNumericValue(String(row[p1Idx] ?? '')) : null;
        const powerRaw = powerIdx >= 0 ? cleanNumericValue(String(row[powerIdx] ?? '')) : null;
        const nhRaw = nhIdx >= 0 ? cleanNumericValue(String(row[nhIdx] ?? '')) : undefined;
        const t17Raw = t17Idx >= 0 ? cleanNumericValue(String(row[t17Idx] ?? '')) : undefined;
        const nphrRaw = nphrIdx >= 0 ? cleanNumericValue(String(row[nphrIdx] ?? '')) : null;

        let dateStr = dateIdx >= 0 && row[dateIdx] !== undefined ? standardizeDate(String(row[dateIdx])) : new Date().toISOString().slice(0, 10);
        let timeStr = timeIdx >= 0 && row[timeIdx] !== undefined ? standardizeTime(String(row[timeIdx])) : '20:00';

        if (dateIdx >= 0 && (timeIdx === -1 || !row[timeIdx])) {
          const dtStr = String(row[dateIdx] || '');
          if (dtStr.includes(' ') || dtStr.includes('T')) {
            const parts = dtStr.replace('T', ' ').trim().split(/\s+/);
            dateStr = standardizeDate(parts[0]);
            if (parts[1]) timeStr = standardizeTime(parts[1]);
          }
        }

        records.push({
          date: dateStr,
          time: timeStr,
          P1_7: p1Raw !== null ? p1Raw : 14.65,
          P3_0: p3Raw,
          realPower: powerRaw !== null ? powerRaw : 20.0,
          nphr: nphrRaw !== null ? nphrRaw : 2450,
          nhSpeed: nhRaw ?? undefined,
          T1_7: t17Raw ?? undefined,
          isWaterWashEvent: false,
        });
      }

      return records;
    } catch {
      return [];
    }
  };

  const processSelectedFile = async (file: File) => {
    if (!file) return;
    setUploadedFileName(file.name);
    setParseError(null);
    setIsLoadingFile(true);

    const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name);

    try {
      if (isExcel) {
        let buffer: ArrayBuffer;
        if (typeof file.arrayBuffer === 'function') {
          buffer = await file.arrayBuffer();
        } else {
          buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error('Gagal membaca berkas Excel.'));
            reader.readAsArrayBuffer(file);
          });
        }

        if (!buffer || buffer.byteLength === 0) {
          setIsLoadingFile(false);
          setParseError('Berkas Excel kosong atau tidak dapat diakses.');
          return;
        }

        const workbook = XLSX.read(new Uint8Array(buffer), {
          type: 'array',
          cellDates: true,
        });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          setIsLoadingFile(false);
          setParseError('Berkas Excel tidak memiliki sheet yang valid.');
          return;
        }

        // Try extracting records across sheets
        let bestRecords: OperationalInput[] = [];

        for (const sName of workbook.SheetNames) {
          const ws = workbook.Sheets[sName];
          if (!ws || !ws['!ref']) continue;

          // Attempt 1: via sheet_to_csv and autoNormalizeDiamondData
          try {
            const csv = XLSX.utils.sheet_to_csv(ws);
            const res = autoNormalizeDiamondData(csv, file.name);
            if (res.extractedRecords.length > bestRecords.length) {
              bestRecords = res.extractedRecords;
            }
          } catch {
            // fallback to direct parsing
          }

          // Attempt 2: direct worksheet extraction
          if (bestRecords.length === 0) {
            const direct = parseWorksheetDirectly(ws);
            if (direct.length > bestRecords.length) {
              bestRecords = direct;
            }
          }

          if (bestRecords.length > 0) break;
        }

        setIsLoadingFile(false);

        if (bestRecords.length === 0) {
          setParseError(
            'Tidak ada baris data valid yang dapat diekstrak dari berkas Excel. Pastikan terdapat kolom PT007/P3.0, Beban, Tanggal, dan Waktu.'
          );
          return;
        }

        setPreviewRows(bestRecords);
      } else {
        // Plain CSV / Text file
        let text: string;
        if (typeof file.text === 'function') {
          text = await file.text();
        } else {
          text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Gagal membaca berkas CSV.'));
            reader.readAsText(file);
          });
        }
        parseCsvContent(text, file.name);
      }
    } catch (err: unknown) {
      setIsLoadingFile(false);
      const msg = err instanceof Error ? err.message : 'Kesalahan saat memproses berkas.';
      setParseError(`Gagal membaca berkas: ${msg}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
      // Safely reset input value in a timeout so subsequent uploads of the same file still trigger onChange
      setTimeout(() => {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 800);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleConfirmImport = () => {
    if (displayedRows.length === 0) return;

    if (detectedAnomalies.length > 0) {
      setShowAnomalyModal(true);
      return;
    }

    executeImport();
  };

  const executeImport = () => {
    let targetRows = displayedRows;
    if (skipDuplicates && duplicateIndices.size > 0) {
      targetRows = displayedRows.filter((_, idx) => !duplicateIndices.has(idx));
    }
    if (targetRows.length > 0) {
      onImportData(targetRows);
      onClose();
    }
  };

  const executeImportExcludingAnomalies = () => {
    if (displayedRows.length === 0) return;
    const anomalousIndices = new Set(detectedAnomalies.map((a) => a.recordIndex));
    let cleanRows = displayedRows.filter((_, idx) => !anomalousIndices.has(idx + 1));
    if (skipDuplicates && duplicateIndices.size > 0) {
      cleanRows = cleanRows.filter((_, idx) => !duplicateIndices.has(idx));
    }
    if (cleanRows.length > 0) {
      onImportData(cleanRows);
      setShowAnomalyModal(false);
      onClose();
    }
  };

  const handleDownloadStandardizedExcel = () => {
    if (displayedRows.length === 0) return;
    const rows = displayedRows.map((r) => ({
      'Tanggal (YYYY-MM-DD)': r.date,
      'Waktu (HH:MM)': r.time,
      'Beban (MW)': r.realPower,
      'NH Speed (RPM)': r.nhSpeed ?? null,
      'T1.7 (°F)': r.T1_7 ?? null,
      'P1.7 / PT006 (PSIA)': r.P1_7,
      'P3.0 / PT007 (PSIA)': r.P3_0,
      'PR (Calc)': r.P1_7 > 0 ? Number((r.P3_0 / r.P1_7).toFixed(4)) : null,
      'NPHR (kcal/kWh)': r.nphr,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Standardized Data');
    XLSX.writeFile(wb, `standardized_operational_data_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadExcelTemplate = () => {
    const templateRows = [
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-24',
        'Waktu (HH:MM)': '19:00',
        'Beban (MW)': 21.60,
        'NH Speed (RPM)': 11670,
        'T1.7 (°F)': 85.5,
        'P1.7': 14.60,
        'P3.0': 265.79,
        'NPHR': 2435,
      },
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-25',
        'Waktu (HH:MM)': '19:00',
        'Beban (MW)': 18.90,
        'NH Speed (RPM)': 11399,
        'T1.7 (°F)': 84.8,
        'P1.7': 14.64,
        'P3.0': 265.00,
        'NPHR': 2450,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Operasional');
    XLSX.writeFile(wb, 'Template_Upload_Operasional.xlsx');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xl max-w-5xl w-full p-6 space-y-4 max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-700" />
              <h3 className="text-base font-bold text-slate-900">Import Operational Dataset</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCheck className="w-3 h-3" /> Auto-Format Enabled
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload file Excel (.xlsx) atau CSV. Kolom otomatis dipetakan (termasuk <strong>T1.7</strong> & <strong>NH Speed</strong>) dan distandardisasi.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Area */}
        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
          {/* File Selector & Drag/Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-5 rounded-lg transition-all duration-150 border-2 ${
              isDragOver
                ? 'border-dashed border-sky-500 bg-sky-50/90 shadow-md ring-2 ring-sky-300'
                : 'border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-100/80 hover:border-sky-400'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">
                  Unggah Berkas Operasional (.xlsx / .csv)
                </span>
                {uploadedFileName && (
                  <span className="text-xs font-semibold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full border border-sky-200">
                    {uploadedFileName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadExcelTemplate();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded border border-emerald-300 transition-colors"
                title="Download template Excel dengan format kolom standar"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Template Excel</span>
              </button>
            </div>

            {/* Clickable Area with Big Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-md border border-slate-200">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isLoadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold rounded shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  <span>{uploadedFileName ? 'Ganti File Excel / CSV' : 'Pilih File dari Komputer'}</span>
                </button>
                <span className="text-xs text-slate-500 hidden sm:inline">
                  atau tarik &amp; lepas file ke kotak ini
                </span>
              </div>

              <span className="text-[11px] text-slate-400 font-mono">
                Format didukung: .xlsx, .xls, .csv
              </span>
            </div>

            {/* Hidden native input for clean, standard file selection without browser interference */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.txt,.tsv"
              onChange={handleFileUpload}
              disabled={isLoadingFile}
              className="hidden"
            />

            {isLoadingFile && (
              <div className="mt-3 flex items-center gap-2.5 text-xs font-medium text-sky-800 bg-sky-50 py-2.5 px-3 rounded-md border border-sky-200 animate-pulse">
                <Loader2 className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
                <span>Sedang membaca dan memetakan data Excel... Mohon tunggu sebentar.</span>
              </div>
            )}
          </div>




          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Preview Table & Controls */}
          {previewRows.length > 0 && (
            <div className="space-y-3 border border-slate-200 rounded-md p-3.5 bg-slate-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-xs text-slate-900">
                    Preview Data: {displayedRows.length} dari {previewRows.length} baris siap diimpor
                  </span>
                  {parameterPresence.hasT17 && (
                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      T1.7 Aktif ({previewRows.filter(r => r.T1_7 !== undefined && r.T1_7 !== null).length} baris)
                    </span>
                  )}
                  {parameterPresence.hasNHSpeed && (
                    <span className="text-[11px] font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      NH Speed Aktif ({previewRows.filter(r => r.nhSpeed !== undefined && r.nhSpeed !== null).length} baris)
                    </span>
                  )}
                </div>

                {/* Filter option */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilter19to21Only(!filter19to21Only)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                      filter19to21Only
                        ? 'bg-amber-600 text-white border-amber-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                    title="Filter data hanya jam 19:00-21:00 atau beban 20-24 MW"
                  >
                    <Filter className="w-3 h-3" />
                    <span>{filter19to21Only ? 'Menampilkan 19-21h / 20-24MW Saja' : 'Filter 19-21h / 20-24MW'}</span>
                  </button>
                </div>
              </div>

              {/* Smart Sync & Deduplication Breakdown Cards */}
              {existingRecords && existingRecords.length > 0 && (
                <div className="p-3.5 bg-gradient-to-r from-sky-50/60 via-slate-50 to-emerald-50/60 border border-slate-200 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                      <span>Analisis Sinkronisasi Excel Otomatis (Anti-Duplikasi &amp; Update)</span>
                    </span>
                    <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer select-none text-[11px] bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-3.5 w-3.5"
                      />
                      <span>Cegah Data Ganda (Lewati Data Identik)</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    {/* New Data */}
                    <div className="p-2.5 bg-white rounded-md border border-emerald-300 flex items-center gap-2.5 shadow-2xs">
                      <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md shrink-0">
                        <PlusCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">
                          Data Baru
                        </span>
                        <strong className="text-xs sm:text-sm text-emerald-950 font-black">
                          {importClassification.newRows.length} Baris
                        </strong>
                        <span className="text-[10px] text-slate-500 block">Akan ditambahkan ke sistem</span>
                      </div>
                    </div>

                    {/* Updated Data */}
                    <div className="p-2.5 bg-white rounded-md border border-sky-300 flex items-center gap-2.5 shadow-2xs">
                      <div className="p-1.5 bg-sky-100 text-sky-700 rounded-md shrink-0">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-sky-800 font-bold uppercase tracking-wider block">
                          Data Diperbarui (Revisi)
                        </span>
                        <strong className="text-xs sm:text-sm text-sky-950 font-black">
                          {importClassification.updatedRows.length} Baris
                        </strong>
                        <span className="text-[10px] text-slate-500 block">Nilai diedit, akan diperbarui</span>
                      </div>
                    </div>

                    {/* Identical Data */}
                    <div className="p-2.5 bg-white rounded-md border border-slate-200 flex items-center gap-2.5 shadow-2xs">
                      <div className="p-1.5 bg-slate-100 text-slate-600 rounded-md shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider block">
                          Data Identik (Anti-Ganda)
                        </span>
                        <strong className="text-xs sm:text-sm text-slate-800 font-black">
                          {importClassification.identicalRows.length} Baris
                        </strong>
                        <span className="text-[10px] text-slate-500 block">Dilewati tanpa membuat ganda</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Anomaly Detection Banner */}
              {detectedAnomalies.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Terdeteksi <strong>{detectedAnomalies.length}</strong> data dengan potensi anomali/nilai di luar rentang wajar operasional.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAnomalyModal(true)}
                    className="text-amber-800 underline font-bold hover:text-amber-950 whitespace-nowrap cursor-pointer"
                  >
                    Lihat Data
                  </button>
                </div>
              )}

              {/* Export Links */}
              <div className="flex items-center justify-end text-xs px-1">
                <button
                  type="button"
                  onClick={handleDownloadStandardizedExcel}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
                  title="Download Excel (.xlsx) standardized"
                >
                  <Download className="w-3 h-3" />
                  <span>Download Excel (.xlsx)</span>
                </button>
              </div>

              {/* Standardized Table Preview with ALL Parameters Explicitly Displayed */}
              <div className="overflow-x-auto max-h-64 border border-slate-200 rounded bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2 px-3 whitespace-nowrap">Tanggal</th>
                      <th className="py-2 px-3 whitespace-nowrap">Waktu</th>
                      <th className="py-2 px-3 whitespace-nowrap">Beban (MW)</th>
                      <th className="py-2 px-3 whitespace-nowrap bg-sky-50 text-sky-900 border-x border-sky-100">
                        NH Speed (RPM)
                      </th>
                      <th className="py-2 px-3 whitespace-nowrap bg-amber-50 text-amber-950 border-r border-amber-100">
                        T1.7 (°F)
                      </th>
                      <th className="py-2 px-3 whitespace-nowrap">P1.7 / PT006 (PSIA)</th>
                      <th className="py-2 px-3 whitespace-nowrap">P3.0 / PT007 (PSIA)</th>
                      <th className="py-2 px-3 whitespace-nowrap">PR (Calc)</th>
                      <th className="py-2 px-3 whitespace-nowrap">NPHR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {displayedRows.map((r, idx) => {
                      const pr = r.P1_7 > 0 ? (r.P3_0 / r.P1_7).toFixed(4) : '—';
                      const hasT = r.T1_7 !== undefined && r.T1_7 !== null && !isNaN(r.T1_7);
                      const hasNH = r.nhSpeed !== undefined && r.nhSpeed !== null && !isNaN(r.nhSpeed);
                      const isIdentical = duplicateIndices.has(idx);
                      const isUpdate = importClassification.updatedRows.some((u) => u.index === idx);

                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 transition-colors ${
                            isIdentical
                              ? (skipDuplicates ? 'bg-slate-50/80 text-slate-400' : 'bg-slate-100/50')
                              : isUpdate
                              ? 'bg-sky-50/50'
                              : 'bg-emerald-50/20'
                          }`}
                        >
                          <td className="py-1.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{r.date}</span>
                              {isIdentical ? (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300 shrink-0"
                                  title="Data sudah ada persis di sistem (tidak akan digandakan)"
                                >
                                  <CheckCircle2 className="w-2.5 h-2.5 text-slate-600" />
                                  Sudah Ada
                                </span>
                              ) : isUpdate ? (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300 shrink-0"
                                  title="Data memiliki nilai baru/revisi di Excel (akan diperbarui)"
                                >
                                  <RefreshCw className="w-2.5 h-2.5 text-sky-700" />
                                  Update
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0"
                                  title="Data baru yang belum ada di sistem (akan ditambahkan)"
                                >
                                  <PlusCircle className="w-2.5 h-2.5 text-emerald-600" />
                                  Baru
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-slate-600 whitespace-nowrap">
                            {r.time}
                          </td>
                          <td className="py-1.5 px-3 text-slate-800 font-semibold">
                            {r.realPower.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-3 font-mono font-medium text-sky-900 bg-sky-50/40 border-x border-sky-100 whitespace-nowrap">
                            {hasNH ? r.nhSpeed!.toLocaleString() : '—'}
                          </td>
                          <td className="py-1.5 px-3 font-mono font-bold text-amber-900 bg-amber-50/40 border-r border-amber-100 whitespace-nowrap">
                            {hasT ? `${Number(r.T1_7).toFixed(2)}°F` : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-slate-800">
                            {r.P1_7.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-3 text-slate-800">
                            {r.P3_0.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-3 font-mono font-medium text-slate-700">
                            {pr}
                          </td>
                          <td className="py-1.5 px-3 text-slate-800">
                            {r.nphr.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        {(() => {
          const newCount = importClassification.newRows.length;
          const updateCount = importClassification.updatedRows.length;
          const actionableCount = newCount + updateCount;

          return (
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {displayedRows.length > 0 ? (
                  <>
                    <span><strong>{displayedRows.length}</strong> baris dibaca dari file</span>
                    <span className="ml-1.5 text-slate-700 font-medium">
                      (<strong>{newCount}</strong> baru, <strong>{updateCount}</strong> update, <strong>{importClassification.identicalRows.length}</strong> identik)
                    </span>
                  </>
                ) : (
                  'Pilih file Excel atau CSV untuk memulai'
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={displayedRows.length === 0}
                  onClick={handleConfirmImport}
                  className="px-4 py-2 text-xs font-bold text-white bg-sky-700 rounded hover:bg-sky-800 disabled:opacity-50 shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {actionableCount === 0 && importClassification.identicalRows.length > 0
                      ? 'Sinkronkan Data (Semua Sudah Ada)'
                      : `Sinkronkan & Impor Data (${actionableCount} Data Aktif)`}
                  </span>
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Anomaly Confirmation Modal */}
      <AnomalyWarningModal
        isOpen={showAnomalyModal}
        onClose={() => setShowAnomalyModal(false)}
        onConfirmSubmitAnyway={() => {
          setShowAnomalyModal(false);
          executeImport();
        }}
        onExcludeAnomaliesAndContinue={executeImportExcludingAnomalies}
        reports={detectedAnomalies}
        mode="bulk"
        title="Peringatan Anomali Data Unggahan (Import Data)"
        submitAnywayLabel="Tetap Simpan Semua"
      />
    </div>
  );
};
