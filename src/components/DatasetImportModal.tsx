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
  ClipboardPaste,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Loader2,
  TableProperties,
} from 'lucide-react';
import { OperationalInput, OperationalRecord } from '../types';
import { scanRecordsForAnomalies } from '../utils/anomalyValidation';
import { AnomalyWarningModal } from './AnomalyWarningModal';
import {
  classifyImportRows,
  ImportClassification,
} from '../utils/duplicateValidation';
import {
  FIELD_PATTERNS,
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

interface ColumnIndices {
  dateIdx: number;
  timeIdx: number;
  P3_0Idx: number;
  P1_7Idx: number;
  prIdx: number;
  realPowerIdx: number;
  nhSpeedIdx: number;
  T1_7Idx: number;
  pbSynthesisIdx: number;
  wwIdx: number;
}

interface UnmappedSheetState {
  sheetName: string;
  headers: string[];
  headerRowIdx: number;
  rawRows: any[][];
  fmtRows: any[][];
}

const MAX_PREVIEW_ROWS = 100;

export const DatasetImportModal: React.FC<DatasetImportModalProps> = ({
  isOpen,
  onClose,
  onImportData,
  existingRecords = [],
}) => {
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [selectedFileInfo, setSelectedFileInfo] = useState<{ name: string; sizeKb: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<OperationalInput[]>([]);
  const [filter19to21Only, setFilter19to21Only] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showAnomalyModal, setShowAnomalyModal] = useState<boolean>(false);
  const [unmappedSheet, setUnmappedSheet] = useState<UnmappedSheetState | null>(null);
  const [manualMapping, setManualMapping] = useState<ColumnIndices>({
    dateIdx: -1,
    timeIdx: -1,
    P3_0Idx: -1,
    P1_7Idx: -1,
    prIdx: -1,
    realPowerIdx: -1,
    nhSpeedIdx: -1,
    T1_7Idx: -1,
    pbSynthesisIdx: -1,
    wwIdx: -1,
  });

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

  const duplicateIndices = useMemo(() => {
    return new Set<number>(importClassification.identicalRows.map((item) => item.index));
  }, [importClassification]);

  const updatedIndices = useMemo(() => {
    return new Set<number>(importClassification.updatedRows.map((item) => item.index));
  }, [importClassification]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset file input and preview state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setInputMode('file');
      setPasteText('');
      setUploadedFileName(null);
      setSelectedFileInfo(null);
      setParseError(null);
      setIsLoadingFile(false);
      setIsDragOver(false);
      setPreviewRows([]);
      setFilter19to21Only(false);
      setSkipDuplicates(true);
      setShowAnomalyModal(false);
      setUnmappedSheet(null);
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
            : 'Tidak ada baris data valid yang dapat diekstrak. Pastikan parameter turbin (P1.7, P3.0, Beban) tersedia pada file.'
        );
        return;
      }

      setPreviewRows(result.extractedRecords);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal memproses file.';
      setParseError(`Parse error: ${errMsg}`);
    }
  };

  const extractRecordsFromGrid = (
    rawRows: any[][],
    fmtRows: any[][],
    headerRowIdx: number,
    cols: ColumnIndices
  ): OperationalInput[] => {
    const {
      dateIdx,
      timeIdx,
      P3_0Idx: p3Idx,
      P1_7Idx: p1Idx,
      prIdx,
      realPowerIdx: powerIdx,
      nhSpeedIdx: nhIdx,
      T1_7Idx: t17Idx,
      pbSynthesisIdx: pbIdx,
      wwIdx,
    } = cols;

    if (p3Idx === -1 && !(prIdx >= 0 && p1Idx >= 0)) return [];

    const getNum = (rawCell: any, fmtCell: any): number | null => {
      if (typeof rawCell === 'number' && !isNaN(rawCell) && isFinite(rawCell)) {
        return rawCell;
      }
      const fromRaw = cleanNumericValue(rawCell !== undefined && rawCell !== null ? String(rawCell) : '');
      if (fromRaw !== null) return fromRaw;
      return cleanNumericValue(fmtCell !== undefined && fmtCell !== null ? String(fmtCell) : '');
    };

    const records: OperationalInput[] = [];
    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r] || [];
      const fmtRow = fmtRows[r] || [];
      if (!Array.isArray(row) || row.length === 0) continue;

      const p1Raw = p1Idx >= 0 ? getNum(row[p1Idx], fmtRow[p1Idx]) : null;
      let p3Raw = p3Idx >= 0 ? getNum(row[p3Idx], fmtRow[p3Idx]) : null;
      if (p3Raw === null && prIdx >= 0 && p1Raw !== null) {
        const prRaw = getNum(row[prIdx], fmtRow[prIdx]);
        if (prRaw !== null) {
          p3Raw = Number((prRaw * p1Raw).toFixed(4));
        }
      }
      if (p3Raw === null) continue;

      const powerRaw = powerIdx >= 0 ? getNum(row[powerIdx], fmtRow[powerIdx]) : null;
      const nhRaw = nhIdx >= 0 ? getNum(row[nhIdx], fmtRow[nhIdx]) ?? undefined : undefined;
      const t17Raw = t17Idx >= 0 ? getNum(row[t17Idx], fmtRow[t17Idx]) ?? undefined : undefined;
      const pbRaw = pbIdx >= 0 ? getNum(row[pbIdx], fmtRow[pbIdx]) ?? undefined : undefined;

      const rawDateCell = dateIdx >= 0 ? row[dateIdx] : '';
      const fmtDateCell = dateIdx >= 0 ? fmtRow[dateIdx] : '';
      const rawTimeCell = timeIdx >= 0 ? row[timeIdx] : '';
      const fmtTimeCell = timeIdx >= 0 ? fmtRow[timeIdx] : '';

      const dateSource =
        typeof rawDateCell === 'number' && rawDateCell >= 35000
          ? rawDateCell
          : (fmtDateCell !== '' && fmtDateCell !== undefined ? String(fmtDateCell) : String(rawDateCell ?? ''));

      let dateStr = dateIdx >= 0 && dateSource !== '' ? standardizeDate(dateSource) : new Date().toISOString().slice(0, 10);

      let timeStr = '20:00';
      if (timeIdx >= 0 && (rawTimeCell !== '' || fmtTimeCell !== '')) {
        if (typeof rawTimeCell === 'number' && rawTimeCell >= 0) {
          timeStr = standardizeTime(rawTimeCell);
        } else {
          const tStr = String(fmtTimeCell || rawTimeCell || '');
          timeStr = standardizeTime(tStr);
        }
      } else if (dateIdx >= 0) {
        if (typeof rawDateCell === 'number' && rawDateCell >= 35000 && rawDateCell % 1 > 0) {
          timeStr = standardizeTime(rawDateCell);
        } else {
          const dtStr = String(fmtDateCell || rawDateCell || '').trim();
          if (dtStr.includes(' ') || dtStr.includes('T')) {
            const parts = dtStr.replace('T', ' ').split(/\s+/);
            dateStr = standardizeDate(parts[0]);
            if (parts[1]) timeStr = standardizeTime(parts.slice(1).join(' '));
          }
        }
      }

      let isWW = false;
      if (wwIdx >= 0 && (row[wwIdx] !== '' || fmtRow[wwIdx] !== '')) {
        const v = String(fmtRow[wwIdx] ?? row[wwIdx] ?? '').toLowerCase().trim();
        isWW = v === 'yes' || v === 'y' || v === '1' || v === 'true';
      }

      records.push({
        date: dateStr,
        time: timeStr,
        P1_7: p1Raw !== null ? p1Raw : 14.65,
        P3_0: p3Raw,
        realPower: powerRaw !== null ? powerRaw : 20.0,
        nhSpeed: nhRaw,
        T1_7: t17Raw,
        pbSynthesis: pbRaw,
        isWaterWashEvent: isWW,
        notes: isWW ? 'Water Wash Event' : undefined,
      });
    }

    return records;
  };

  // Direct worksheet parser: avoids sheet_to_csv multiline header splitting & preserves raw Excel serials
  const parseWorksheetDirectly = (
    worksheet: XLSX.WorkSheet,
    sheetName: string
  ): {
    records: OperationalInput[];
    sheetInfo?: UnmappedSheetState;
    detectedCols?: ColumnIndices;
  } => {
    if (!worksheet || !worksheet['!ref']) return { records: [] };
    try {
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
      const fmtRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      if (rawRows.length < 2) return { records: [] };

      const normalizeHeaderCell = (val: any) =>
        String(val ?? '')
          .replace(/[\r\n]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      const isCandidateHeaderCell = (cellStr: string, patterns: string[]): boolean => {
        if (!cellStr || cellStr.length < 2) return false;
        if (!isNaN(Number(cellStr.replace(/,/g, '.')))) return false;
        if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(cellStr)) return false;
        if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(cellStr)) return false;
        if (/^\d{1,2}[:.]\d{2}/.test(cellStr)) return false;
        return patterns.some((p) => {
          if (cellStr === p) return true;
          if (p.length >= 2 && cellStr.includes(p)) return true;
          if (cellStr.length >= 3 && p.includes(cellStr)) return true;
          return false;
        });
      };

      let headerRowIdx = 0;
      let maxScore = -1;
      const scanLimit = Math.min(50, rawRows.length);

      for (let r = 0; r < scanLimit; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row) || row.length < 2) continue;
        const normalizedCells = row.map(normalizeHeaderCell);
        let score = 0;
        for (const patterns of Object.values(FIELD_PATTERNS)) {
          if (normalizedCells.some((c) => isCandidateHeaderCell(c, patterns))) {
            score++;
          }
        }
        if (score > maxScore) {
          maxScore = score;
          headerRowIdx = r;
        }
      }

      // If no header row matched any known pattern, default to first non-empty row with >= 2 cells
      if (maxScore <= 0) {
        const firstNonEmpty = rawRows.findIndex(
          (row) => Array.isArray(row) && row.filter((c) => String(c ?? '').trim() !== '').length >= 2
        );
        if (firstNonEmpty >= 0) headerRowIdx = firstNonEmpty;
      }

      const rawHeaderRow = rawRows[headerRowIdx] || [];
      const fmtHeaderRow = fmtRows[headerRowIdx] || [];
      const maxCols = Math.max(rawHeaderRow.length, fmtHeaderRow.length);
      const headers: string[] = [];
      const displayHeaders: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        const h1 = normalizeHeaderCell(rawHeaderRow[c]);
        const h2 = normalizeHeaderCell(fmtHeaderRow[c]);
        headers.push(h1 || h2);
        const rawDisplay = String(fmtHeaderRow[c] || rawHeaderRow[c] || '').replace(/[\r\n]+/g, ' ').trim();
        displayHeaders.push(rawDisplay || `Kolom ${XLSX.utils.encode_col(c)}`);
      }

      const findColIdx = (patterns: string[]): number => {
        for (let i = 0; i < headers.length; i++) {
          if (headers[i] && patterns.includes(headers[i])) return i;
        }
        for (let i = 0; i < headers.length; i++) {
          const h = headers[i];
          if (!h || h.length < 2) continue;
          if (patterns.some((p) => (p.length >= 2 && h.includes(p)) || (h.length >= 3 && p.includes(h)))) {
            return i;
          }
        }
        return -1;
      };

      const dateIdx = findColIdx(FIELD_PATTERNS.date);
      const rawTimeIdx = findColIdx(FIELD_PATTERNS.time);
      const cols: ColumnIndices = {
        dateIdx,
        timeIdx: rawTimeIdx === dateIdx ? -1 : rawTimeIdx,
        T1_7Idx: findColIdx(FIELD_PATTERNS.T1_7),
        P1_7Idx: findColIdx(FIELD_PATTERNS.P1_7),
        P3_0Idx: findColIdx(FIELD_PATTERNS.P3_0),
        prIdx: findColIdx(FIELD_PATTERNS.PR),
        realPowerIdx: findColIdx(FIELD_PATTERNS.realPower),
        nhSpeedIdx: findColIdx(FIELD_PATTERNS.nhSpeed),
        pbSynthesisIdx: findColIdx(FIELD_PATTERNS.pbSynthesis),
        wwIdx: findColIdx(FIELD_PATTERNS.isWaterWashEvent),
      };

      const records = extractRecordsFromGrid(rawRows, fmtRows, headerRowIdx, cols);
      return {
        records,
        sheetInfo: {
          sheetName,
          headers: displayHeaders,
          headerRowIdx,
          rawRows,
          fmtRows,
        },
        detectedCols: cols,
      };
    } catch {
      return { records: [] };
    }
  };

  const handleApplyManualMapping = () => {
    if (!unmappedSheet) return;
    if (manualMapping.P3_0Idx === -1 && !(manualMapping.prIdx >= 0 && manualMapping.P1_7Idx >= 0)) {
      setParseError('Pilih kolom untuk P3.0 / PT007 terlebih dahulu agar data turbin dapat dihitung.');
      return;
    }
    const extracted = extractRecordsFromGrid(
      unmappedSheet.rawRows,
      unmappedSheet.fmtRows,
      unmappedSheet.headerRowIdx,
      manualMapping
    );
    if (extracted.length === 0) {
      setParseError('Kolom yang dipilih tidak memiliki nilai angka valid. Periksa kembali baris header atau pilihan kolom.');
      return;
    }
    setParseError(null);
    setUnmappedSheet(null);
    setPreviewRows(extracted);
  };

  const handleParsePastedText = (textOverride?: string) => {
    const content = textOverride !== undefined ? textOverride : pasteText;
    setUploadedFileName('Tempelan Clipboard Excel');
    setSelectedFileInfo(null);
    setUnmappedSheet(null);
    parseCsvContent(content, 'Excel Clipboard');
  };

  const processSelectedFile = async (file: File) => {
    if (!file) return;
    setUploadedFileName(file.name);
    setSelectedFileInfo({
      name: file.name,
      sizeKb: (file.size / 1024).toFixed(1),
    });
    setParseError(null);
    setPreviewRows([]);
    setUnmappedSheet(null);
    setIsLoadingFile(true);

    try {
      let buffer: ArrayBuffer;
      if (typeof file.arrayBuffer === 'function') {
        buffer = await file.arrayBuffer();
      } else {
        buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
          reader.readAsArrayBuffer(file);
        });
      }

      if (!buffer || buffer.byteLength === 0) {
        setParseError('Berkas kosong atau tidak dapat diakses.');
        return;
      }

      const bytes = new Uint8Array(buffer);
      const hasZipMagic = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b; // .xlsx / .xlsm
      const hasOleMagic = bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0; // .xls
      const isExcel =
        /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name) ||
        hasZipMagic ||
        hasOleMagic ||
        file.type.includes('spreadsheet') ||
        file.type.includes('excel');

      if (isExcel) {
        const workbook = XLSX.read(bytes, {
          type: 'array',
          cellDates: false,
        });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          setParseError('Berkas Excel tidak memiliki sheet yang valid.');
          return;
        }

        let bestRecords: OperationalInput[] = [];
        let fallbackSheet: UnmappedSheetState | null = null;
        let fallbackCols: ColumnIndices | null = null;

        for (const sName of workbook.SheetNames) {
          const ws = workbook.Sheets[sName];
          if (!ws || !ws['!ref']) continue;

          // Attempt 1: Direct worksheet extraction (safe for multiline headers & Excel serials)
          const parsedDirect = parseWorksheetDirectly(ws, sName);
          if (parsedDirect.records.length > bestRecords.length) {
            bestRecords = parsedDirect.records;
          }
          if (
            parsedDirect.sheetInfo &&
            (!fallbackSheet || parsedDirect.sheetInfo.rawRows.length > fallbackSheet.rawRows.length)
          ) {
            fallbackSheet = parsedDirect.sheetInfo;
            fallbackCols = parsedDirect.detectedCols || null;
          }

          // Attempt 2: CSV normalization fallback
          try {
            const csv = XLSX.utils.sheet_to_csv(ws);
            const res = autoNormalizeDiamondData(csv, file.name);
            if (res.extractedRecords.length > bestRecords.length) {
              bestRecords = res.extractedRecords;
            }
          } catch {
            // ignore fallback error
          }

          if (bestRecords.length > 0) break;
        }

        if (bestRecords.length === 0) {
          if (fallbackSheet && fallbackSheet.headers.length > 0) {
            setUnmappedSheet(fallbackSheet);
            if (fallbackCols) {
              setManualMapping(fallbackCols);
            }
            setParseError(
              `File "${file.name}" terbaca (${fallbackSheet.rawRows.length} baris pada sheet "${fallbackSheet.sheetName}"), tetapi nama kolom belum cocok otomatis. Silakan pilih kolom pada Pemetaan Manual di bawah ini.`
            );
          } else {
            setParseError(
              `Tidak ada baris data valid yang dapat diekstrak dari "${file.name}". Pastikan file berisi tabel data operasional atau gunakan tab "Paste dari Excel".`
            );
          }
          return;
        }

        setPreviewRows(bestRecords);
      } else {
        // Plain CSV / Text file
        const text = new TextDecoder('utf-8').decode(bytes);
        parseCsvContent(text, file.name);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kesalahan saat memproses berkas.';
      setParseError(`Gagal membaca berkas: ${msg}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
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
      void processSelectedFile(file);
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
    if (displayedRows.length === 0) return;
    let targetRows = displayedRows;
    if (skipDuplicates && duplicateIndices.size > 0) {
      targetRows = displayedRows.filter((_, idx) => !duplicateIndices.has(idx));
    }
    // Always pass displayedRows if all rows were identical so smartMerge reports the sync status & closes cleanly
    onImportData(targetRows.length > 0 ? targetRows : displayedRows);
    onClose();
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
    }
    setShowAnomalyModal(false);
    onClose();
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
      },
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-25',
        'Waktu (HH:MM)': '19:00',
        'Beban (MW)': 18.90,
        'NH Speed (RPM)': 11399,
        'T1.7 (°F)': 84.8,
        'P1.7': 14.64,
        'P3.0': 265.00,
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
          {/* Input Mode Switcher Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setInputMode('file');
                  setParseError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  inputMode === 'file'
                    ? 'bg-white text-sky-800 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Upload File (.xlsx / .csv)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode('paste');
                  setParseError(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  inputMode === 'paste'
                    ? 'bg-white text-sky-800 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste dari Excel (Copy-Paste)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadExcelTemplate}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded border border-emerald-300 transition-colors cursor-pointer"
              title="Download template Excel dengan format kolom standar"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template Excel</span>
            </button>
          </div>

          {inputMode === 'file' ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-4 rounded-lg transition-all duration-150 border-2 space-y-3 ${
                isDragOver
                  ? 'border-dashed border-sky-500 bg-sky-50/90 shadow-md ring-2 ring-sky-300'
                  : 'border-dashed border-slate-300 bg-slate-50/70 hover:border-sky-400'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">
                    Pilih File Excel (.xlsx / .xls) atau CSV langsung, atau tarik &amp; lepas ke kotak ini
                  </span>
                </div>
                {selectedFileInfo && (
                  <span className="text-xs font-semibold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full border border-sky-200">
                    {selectedFileInfo.name} ({selectedFileInfo.sizeKb} KB)
                  </span>
                )}
              </div>

              {/* Fully visible, full-opacity native file input without restrictive MIME accept lock */}
              <div className="bg-white p-3 rounded-md border border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  ref={fileInputRef}
                  id="dataset-file-upload"
                  type="file"
                  onClick={(e) => {
                    e.currentTarget.value = '';
                  }}
                  onChange={handleFileUpload}
                  disabled={isLoadingFile}
                  aria-label="Pilih File Excel atau CSV"
                  className="block w-full text-xs text-slate-700 cursor-pointer file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-sky-700 file:text-white hover:file:bg-sky-800 file:cursor-pointer disabled:opacity-50"
                />
                <span className="text-[11px] text-slate-500 font-mono shrink-0">
                  Mendukung .xlsx, .xls, .csv
                </span>
              </div>

              {isLoadingFile && (
                <div className="flex items-center gap-2.5 text-xs font-medium text-sky-800 bg-sky-50 py-2.5 px-3 rounded-md border border-sky-200 animate-pulse">
                  <Loader2 className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
                  <span>Sedang membaca dan memetakan data Excel... Mohon tunggu sebentar.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-slate-300 bg-slate-50 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ClipboardPaste className="w-4 h-4 text-sky-700" />
                  <span>Salin tabel dari Excel (Ctrl+C) lalu tempel (Ctrl+V) di bawah ini</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleParsePastedText()}
                  disabled={!pasteText.trim()}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-sky-700 hover:bg-sky-800 rounded disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Proses Data Tempelan
                </button>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted && (pasted.includes('\t') || pasted.includes('\n'))) {
                    setPasteText(pasted);
                    setTimeout(() => handleParsePastedText(pasted), 0);
                  }
                }}
                rows={5}
                placeholder={'Contoh header & data dari Excel:\nTanggal\tWaktu\tBeban (MW)\tNH Speed\tT1.7\tP1.7\tP3.0\n2026-11-12\t19:00\t21.60\t11670\t85.5\t14.60\t265.79'}
                className="w-full p-2.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
              />
            </div>
          )}

          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Fallback Manual Column Mapper when Excel sheet loaded but header names weren't matched automatically */}
          {unmappedSheet && previewRows.length === 0 && (
            <div className="p-4 bg-amber-50/70 border border-amber-300 rounded-lg space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                  <TableProperties className="w-4 h-4 text-amber-700" />
                  <span>Pemetaan Kolom Manual — Sheet "{unmappedSheet.sheetName}"</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-amber-900 font-semibold">Baris Header:</label>
                  <select
                    value={unmappedSheet.headerRowIdx}
                    onChange={(e) => {
                      const nextIdx = Number(e.target.value);
                      const rowHeaders = (unmappedSheet.fmtRows[nextIdx] || unmappedSheet.rawRows[nextIdx] || []).map(
                        (c: any, idx: number) =>
                          String(c ?? '').replace(/[\r\n]+/g, ' ').trim() || `Kolom ${XLSX.utils.encode_col(idx)}`
                      );
                      setUnmappedSheet({
                        ...unmappedSheet,
                        headerRowIdx: nextIdx,
                        headers: rowHeaders,
                      });
                    }}
                    className="px-2 py-1 rounded border border-amber-300 bg-white text-xs text-slate-800"
                  >
                    {unmappedSheet.rawRows.slice(0, 15).map((_, rIdx) => (
                      <option key={rIdx} value={rIdx}>
                        Baris {rIdx + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                {(
                  [
                    { key: 'P3_0Idx', label: 'P3.0 / PT007 (Wajib*)' },
                    { key: 'P1_7Idx', label: 'P1.7 / PT006' },
                    { key: 'realPowerIdx', label: 'Beban / Load (MW)' },
                    { key: 'nhSpeedIdx', label: 'NH Speed (RPM)' },
                    { key: 'T1_7Idx', label: 'T1.7 / T Inlet (°F)' },
                    { key: 'dateIdx', label: 'Tanggal (Date)' },
                    { key: 'timeIdx', label: 'Waktu (Time)' },
                    { key: 'prIdx', label: 'PR (Jika tanpa PT007)' },
                  ] as const
                ).map((field) => (
                  <label key={field.key} className="block space-y-1">
                    <span className="font-semibold text-slate-700 block">{field.label}</span>
                    <select
                      value={manualMapping[field.key]}
                      onChange={(e) =>
                        setManualMapping((prev) => ({
                          ...prev,
                          [field.key]: Number(e.target.value),
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white text-xs text-slate-800"
                    >
                      <option value={-1}>-- Tidak Ada / Default --</option>
                      {unmappedSheet.headers.map((h, idx) => (
                        <option key={idx} value={idx}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyManualMapping}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded transition-colors cursor-pointer"
                >
                  Terapkan Pemetaan Kolom
                </button>
              </div>
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

              {/* Export Links & Row Cap Notice */}
              <div className="flex items-center justify-between gap-2 text-xs px-1 flex-wrap">
                {displayedRows.length > MAX_PREVIEW_ROWS ? (
                  <span className="text-[11px] text-slate-600 font-medium">
                    Menampilkan <strong>{MAX_PREVIEW_ROWS}</strong> baris pertama di pratinjau agar tetap cepat. Seluruh <strong>{displayedRows.length}</strong> baris akan diimpor.
                  </span>
                ) : (
                  <span />
                )}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {displayedRows.slice(0, MAX_PREVIEW_ROWS).map((r, idx) => {
                      const pr = r.P1_7 > 0 ? (r.P3_0 / r.P1_7).toFixed(4) : '—';
                      const hasT = r.T1_7 !== undefined && r.T1_7 !== null && !isNaN(r.T1_7);
                      const hasNH = r.nhSpeed !== undefined && r.nhSpeed !== null && !isNaN(r.nhSpeed);
                      const isIdentical = duplicateIndices.has(idx);
                      const isUpdate = updatedIndices.has(idx);

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
