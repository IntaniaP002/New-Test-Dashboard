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
} from 'lucide-react';
import { OperationalInput } from '../types';
import { scanRecordsForAnomalies } from '../utils/anomalyValidation';
import { AnomalyWarningModal } from './AnomalyWarningModal';
import {
  autoNormalizeDiamondData,
} from '../utils/dataNormalizer';
import { isTimeInRange19to21 } from '../utils/calculations';

interface DatasetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportData: (records: OperationalInput[]) => void;
}

export const DatasetImportModal: React.FC<DatasetImportModalProps> = ({
  isOpen,
  onClose,
  onImportData,
}) => {
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<OperationalInput[]>([]);
  const [filter19to21Only, setFilter19to21Only] = useState(false);
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

  // Summary counts of parameters detected in rows
  const parameterPresence = useMemo(() => {
    if (previewRows.length === 0) return { hasT17: false, hasNHSpeed: false };
    const hasT17 = previewRows.some((r) => r.T1_7 !== undefined && r.T1_7 !== null && !isNaN(r.T1_7));
    const hasNHSpeed = previewRows.some((r) => r.nhSpeed !== undefined && r.nhSpeed !== null && !isNaN(r.nhSpeed));
    return { hasT17, hasNHSpeed };
  }, [previewRows]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset file input and preview state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setUploadedFileName(null);
      setParseError(null);
      setPreviewRows([]);
      setFilter19to21Only(false);
      setShowAnomalyModal(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parseCsvContent = (text: string, fileName?: string | null) => {
    setParseError(null);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setParseError(null);

    // Reset input value so operator can re-select the same file or choose another file anytime
    e.target.value = '';

    const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(new Uint8Array(buffer), {
            type: 'array',
          });

          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            setParseError('Berkas Excel tidak memiliki sheet yang valid.');
            return;
          }

          // Smart Sheet Selection: Find the sheet that contains turbine operational data
          let chosenSheetName = workbook.SheetNames[0];
          let bestScore = -1;

          for (const sName of workbook.SheetNames) {
            const ws = workbook.Sheets[sName];
            if (!ws || !ws['!ref']) continue;
            try {
              const sampleCsv = XLSX.utils.sheet_to_csv(ws).slice(0, 4000).toLowerCase();
              let score = 0;
              if (sampleCsv.includes('p1.7') || sampleCsv.includes('p17') || sampleCsv.includes('pt006') || sampleCsv.includes('pt-006') || sampleCsv.includes('inlet')) score += 500;
              if (sampleCsv.includes('p3.0') || sampleCsv.includes('p30') || sampleCsv.includes('pt007') || sampleCsv.includes('pt-007') || sampleCsv.includes('discharge')) score += 500;
              if (sampleCsv.includes('date') || sampleCsv.includes('tanggal') || sampleCsv.includes('tgl')) score += 300;
              if (sampleCsv.includes('beban') || sampleCsv.includes('power') || sampleCsv.includes('mw') || sampleCsv.includes('realpower')) score += 300;
              if (sampleCsv.includes('nh') || sampleCsv.includes('speed') || sampleCsv.includes('rpm')) score += 200;

              if (score > bestScore) {
                bestScore = score;
                chosenSheetName = sName;
              }
            } catch {
              // skip unreadable sheet
            }
          }

          const worksheet = workbook.Sheets[chosenSheetName];
          if (!worksheet) {
            setParseError('Sheet data tidak ditemukan pada berkas Excel.');
            return;
          }

          // Convert sheet into CSV text for uniform parsing
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          parseCsvContent(csv, file.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error reading Excel file';
          setParseError(`Gagal membaca berkas Excel: ${msg}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCsvContent(text, file.name);
      };
      reader.readAsText(file);
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
    if (displayedRows.length > 0) {
      onImportData(displayedRows);
      onClose();
    }
  };

  const executeImportExcludingAnomalies = () => {
    if (displayedRows.length === 0) return;
    const anomalousIndices = new Set(detectedAnomalies.map((a) => a.recordIndex));
    const cleanRows = displayedRows.filter((_, idx) => !anomalousIndices.has(idx + 1));
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
          {/* File Selector & Template Link */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Pilih File Excel (.xlsx) / CSV</span>
                {uploadedFileName && (
                  <span className="text-sky-700 font-bold">({uploadedFileName})</span>
                )}
              </label>
              <button
                type="button"
                onClick={handleDownloadExcelTemplate}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline"
                title="Download template Excel dengan format kolom standar"
              >
                <Download className="w-3 h-3" />
                <span>Download Template Excel</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,.xlsb,.txt,.tsv"
              onChange={handleFileUpload}
              className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
            />
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

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-1.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                            {r.date}
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
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {displayedRows.length > 0
              ? `${displayedRows.length} baris data siap diimpor`
              : 'Pilih file Excel atau CSV untuk memulai'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={displayedRows.length === 0}
              onClick={handleConfirmImport}
              className="px-4 py-2 text-xs font-bold text-white bg-sky-700 rounded hover:bg-sky-800 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
            >
              Impor {displayedRows.length} Data Operasional
            </button>
          </div>
        </div>
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
