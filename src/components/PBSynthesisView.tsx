import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  Filter,
  Download,
  Upload,
  ArrowDownUp,
  Gauge,
  Sliders,
  ChevronDown,
  ChevronUp,
  Trash2,
  Table,
  Zap,
  Target,
  Sparkles,
  Thermometer,
  FileSpreadsheet,
  PlusCircle,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  OperationalRecord,
  PBOperationCurvePoint,
  PBOperationZone,
  PBOperationEvaluation,
  PBOperationInputRecord,
} from '../types';
import {
  DEFAULT_SPEEDRONIC_CURVE_POINTS,
  DEFAULT_PB_OPERATION_CURVE_POINTS,
  evaluatePBOperationPoint,
  calculateNHCorrection,
  getExpectedCurveAtBeban,
  parseNHSpeed,
} from '../utils/calculations';
import { standardizeDate } from '../utils/dataNormalizer';

interface PBSynthesisViewProps {
  records: OperationalRecord[];
  inputHistoryRecords?: OperationalRecord[];
  onNavigateToInput: () => void;
  onUpdateRecordPBSynthesis?: (...args: any[]) => void;
  onUpdateDatePBSynthesis?: (...args: any[]) => void;
  onSetPbBaselineRecord?: (recordId: string) => void;
  onDeleteRecord?: (recordId: string) => void;
  selectedRecordId?: string | null;
  onSelectRecord?: (recordId: string | null) => void;
  onOpenImport?: () => void;
}

const STORAGE_KEY_PB_OP_EXTRA = 'pb_synthesis_uploaded_records_v6';

export const PBSynthesisView: React.FC<PBSynthesisViewProps> = ({
  records,
  inputHistoryRecords,
  onNavigateToInput,
  onDeleteRecord,
  selectedRecordId: propSelectedRecordId,
  onSelectRecord,
  onOpenImport,
}) => {
  // Extra uploaded/imported records stored locally if user uploads directly on this page
  const [extraUploadedRecords, setExtraUploadedRecords] = useState<PBOperationInputRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PB_OP_EXTRA);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((r) => r && r.id)
            .map((r) => ({
              ...r,
              date: standardizeDate(r.date),
            }));
        }
      }
    } catch {
      /* fallback */
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PB_OP_EXTRA, JSON.stringify(extraUploadedRecords));
    } catch {
      /* ignore storage errors */
    }
  }, [extraUploadedRecords]);

  // Hidden file input for Excel / CSV upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Table filters & UI toggles
  const [filterZone, setFilterZone] = useState<string>('ALL');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [zoomMode, setZoomMode] = useState<'AUTO_DATA' | 'FOCUS_PT007' | 'FULL'>('AUTO_DATA');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);

  // Dedicated filters for the PB Synthesis Operation Curve Chart
  const [chartDateFilter, setChartDateFilter] = useState<string>('ALL');
  const [chartStartDateFilter, setChartStartDateFilter] = useState<string>('');
  const [chartEndDateFilter, setChartEndDateFilter] = useState<string>('');
  const [chartZoneFilter, setChartZoneFilter] = useState<string>('ALL');
  const [chartShowOnlySelected, setChartShowOnlySelected] = useState<boolean>(false);
  const [showPointLabels, setShowPointLabels] = useState<boolean>(true);

  // Combine records from Input Data page and any extra uploaded records into standard evaluated format
  // Note: Uses individual raw records (un-averaged) so each data entry/time reading appears on the PB Synthesis chart
  const allMonitoredRecords = useMemo<PBOperationInputRecord[]>(() => {
    const list: PBOperationInputRecord[] = [];
    const sourceRecords = records && records.length > 0 ? records : (inputHistoryRecords || []);

    // 1. Process operational records from Input Data page
    for (const r of sourceRecords) {
      const beban = r.realPower;
      const nhSpeed = r.nhSpeed || 11670;
      const t1_7 = r.T1_7 !== undefined && r.T1_7 !== null ? r.T1_7 : 85.5;
      const pt006 = r.P1_7 || 14.65;
      const pt007 = r.P3_0 || 265.79;

      if (beban > 0 && nhSpeed > 0 && pt006 > 0 && pt007 > 0) {
        const evalRes = evaluatePBOperationPoint(beban, nhSpeed, t1_7, pt006, pt007);
        if (evalRes) {
          list.push({
            id: r.id,
            date: r.date,
            time: r.time || '19:00',
            beban: evalRes.beban,
            nhSpeed: evalRes.nhSpeed,
            t1_7: evalRes.t1_7,
            theta: evalRes.theta,
            sqrtTheta: evalRes.sqrtTheta,
            nhSpeedCorrected: evalRes.nhSpeedCorrected,
            pt006: evalRes.pt006,
            pt007: evalRes.pt007,
            fNH: evalRes.fNH,
            pbSynthesis: evalRes.pbSynthesis,
            earlyUpper: evalRes.earlyUpper,
            earlyLower: evalRes.earlyLower,
            upperThreshold: evalRes.upperThreshold,
            lowerThreshold: evalRes.lowerThreshold,
            zone: evalRes.zone,
            isRecommendWaterWash: evalRes.isRecommendWaterWash,
            timestamp: r.timestamp || Date.now(),
          });
        }
      }
    }

    // 2. Add extra uploaded records if not duplicate id
    for (const extra of extraUploadedRecords) {
      if (!list.some((existing) => existing.id === extra.id)) {
        list.push(extra);
      }
    }

    return list;
  }, [records, inputHistoryRecords, extraUploadedRecords]);

  // Selected record for active inspection (defaulting to prop if passed, or latest recorded data)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(propSelectedRecordId || null);

  // Sync state when prop changes externally
  useEffect(() => {
    if (propSelectedRecordId !== undefined && propSelectedRecordId !== null) {
      setSelectedRecordId(propSelectedRecordId);
    }
  }, [propSelectedRecordId]);

  const handleSelectRecord = (id: string | null) => {
    setSelectedRecordId(id);
    if (onSelectRecord) {
      onSelectRecord(id);
    }
  };

  // Unique chronological dates for chart filtering
  const uniqueDates = useMemo<string[]>(() => {
    const dates: string[] = Array.from(new Set(allMonitoredRecords.map((r) => r.date)));
    return dates.sort((a, b) => b.localeCompare(a));
  }, [allMonitoredRecords]);

  // Filtered operational points displayed on the Operation Curve SVG Chart
  const chartFilteredRecords = useMemo(() => {
    let list = [...allMonitoredRecords];

    // If user opts to only inspect the active point
    if (chartShowOnlySelected && selectedRecordId) {
      const match = list.filter((r) => r.id === selectedRecordId);
      if (match.length > 0) return match;
    }

    // Filter by single specific date
    if (chartDateFilter !== 'ALL') {
      list = list.filter((r) => r.date === chartDateFilter);
    }

    // Filter by date range
    if (chartStartDateFilter) {
      list = list.filter((r) => r.date >= chartStartDateFilter);
    }
    if (chartEndDateFilter) {
      list = list.filter((r) => r.date <= chartEndDateFilter);
    }

    // Filter by zone
    if (chartZoneFilter === 'NORMAL') {
      list = list.filter((r) => r.zone === 'NORMAL');
    } else if (chartZoneFilter === 'CAUTION') {
      list = list.filter((r) => r.zone === 'EARLY_UPPER' || r.zone === 'EARLY_LOWER');
    } else if (chartZoneFilter === 'ALARM') {
      list = list.filter((r) => r.zone === 'MELEWATI_BATAS_ATAS' || r.zone === 'MELEWATI_BATAS_BAWAH');
    }

    return list;
  }, [
    allMonitoredRecords,
    chartDateFilter,
    chartStartDateFilter,
    chartEndDateFilter,
    chartZoneFilter,
    chartShowOnlySelected,
    selectedRecordId,
  ]);

  // Set default selection to latest record when records change if none selected
  useEffect(() => {
    if (allMonitoredRecords.length > 0) {
      if (!selectedRecordId || !allMonitoredRecords.some((r) => r.id === selectedRecordId)) {
        handleSelectRecord(allMonitoredRecords[allMonitoredRecords.length - 1].id);
      }
    } else {
      handleSelectRecord(null);
    }
  }, [allMonitoredRecords, selectedRecordId]);

  // Active Monitored Record
  const activeRecord = useMemo<PBOperationInputRecord | null>(() => {
    if (!selectedRecordId) {
      return allMonitoredRecords.length > 0 ? allMonitoredRecords[allMonitoredRecords.length - 1] : null;
    }
    return allMonitoredRecords.find((r) => r.id === selectedRecordId) || null;
  }, [selectedRecordId, allMonitoredRecords]);

  // Evaluation of the active monitored record
  const activeEvaluation = useMemo<PBOperationEvaluation | null>(() => {
    if (!activeRecord) return null;
    return evaluatePBOperationPoint(
      activeRecord.beban,
      activeRecord.nhSpeed,
      activeRecord.t1_7,
      activeRecord.pt006,
      activeRecord.pt007
    );
  }, [activeRecord]);

  // Batch upload Excel / CSV handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFeedback(null);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Normalize any date cells into explicit YYYY-MM-DD strings so date parsing is 100% unambiguous
        if (worksheet && worksheet['!ref']) {
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
              const cell = worksheet[cellRef];
              if (!cell) continue;

              if (cell.t === 'd' && cell.v instanceof Date) {
                const y = cell.v.getUTCFullYear();
                const m = String(cell.v.getUTCMonth() + 1).padStart(2, '0');
                const d = String(cell.v.getUTCDate()).padStart(2, '0');
                cell.t = 's';
                cell.v = `${y}-${m}-${d}`;
                cell.w = cell.v;
              } else if (cell.t === 'n' && cell.v >= 35000 && cell.v <= 65000) {
                const dc = XLSX.SSF.parse_date_code(cell.v);
                if (dc && dc.y && dc.m && dc.d) {
                  cell.t = 's';
                  cell.v = `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}`;
                  cell.w = cell.v;
                }
              }
            }
          }
        }

        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length < 2) {
          setUploadFeedback({
            type: 'error',
            text: 'Berkas kosong atau tidak memiliki baris data.',
          });
          return;
        }

        const headerRow = (rows[0] || []).map((h) => String(h).trim().toLowerCase());
        const findColIdx = (patterns: string[]) => {
          return headerRow.findIndex((col) =>
            patterns.some((p) => col.includes(p.toLowerCase()))
          );
        };

        const dateIdx = findColIdx(['tanggal', 'date', 'tgl']);
        const timeIdx = findColIdx(['waktu', 'time', 'jam']);
        const bebanIdx = findColIdx(['beban', 'power', 'mw', 'real power']);
        const nhIdx = findColIdx(['nh speed', 'nh', 'speed', 'rpm']);
        const t17Idx = findColIdx(['t1.7', 't17', 'temp', 'suhu']);
        const pt006Idx = findColIdx(['pt006', 'pt-006', 'p1.7', 'p17', 'inlet']);
        const pt007Idx = findColIdx(['pt007', 'pt-007', 'p3.0', 'p30', 'discharge', 'pb aktual']);

        const parsedRecords: PBOperationInputRecord[] = [];
        let successCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawDate = dateIdx >= 0 && row[dateIdx] !== undefined ? row[dateIdx] : undefined;
          const dateVal = standardizeDate(rawDate);
          const timeVal = timeIdx >= 0 && row[timeIdx] ? String(row[timeIdx]).trim() : '19:00';
          const bebanVal = bebanIdx >= 0 ? parseFloat(String(row[bebanIdx]).replace(',', '.')) : NaN;
          const nhVal = nhIdx >= 0 ? parseNHSpeed(row[nhIdx]) : NaN;
          let t17Val = t17Idx >= 0 ? parseFloat(String(row[t17Idx]).replace(',', '.')) : 85.5;
          if (!isNaN(t17Val) && t17Val > 0 && t17Val < 55) {
            t17Val = Number((t17Val * 1.8 + 32).toFixed(1));
          }
          const pt006Val = pt006Idx >= 0 ? parseFloat(String(row[pt006Idx]).replace(',', '.')) : NaN;
          const pt007Val = pt007Idx >= 0 ? parseFloat(String(row[pt007Idx]).replace(',', '.')) : NaN;

          if (
            !isNaN(bebanVal) && bebanVal > 0 &&
            !isNaN(nhVal) && nhVal > 0 &&
            !isNaN(t17Val) &&
            !isNaN(pt006Val) && pt006Val > 0 &&
            !isNaN(pt007Val) && pt007Val > 0
          ) {
            const evalRes = evaluatePBOperationPoint(bebanVal, nhVal, t17Val, pt006Val, pt007Val);
            if (evalRes) {
              parsedRecords.push({
                id: `op-upload-${Date.now()}-${i}`,
                date: dateVal,
                time: timeVal,
                beban: evalRes.beban,
                nhSpeed: evalRes.nhSpeed,
                t1_7: evalRes.t1_7,
                theta: evalRes.theta,
                sqrtTheta: evalRes.sqrtTheta,
                nhSpeedCorrected: evalRes.nhSpeedCorrected,
                pt006: evalRes.pt006,
                pt007: evalRes.pt007,
                fNH: evalRes.fNH,
                pbSynthesis: evalRes.pbSynthesis,
                earlyUpper: evalRes.earlyUpper,
                earlyLower: evalRes.earlyLower,
                upperThreshold: evalRes.upperThreshold,
                lowerThreshold: evalRes.lowerThreshold,
                zone: evalRes.zone,
                isRecommendWaterWash: evalRes.isRecommendWaterWash,
                timestamp: Date.now() + i,
              });
              successCount++;
            }
          }
        }

        if (parsedRecords.length > 0) {
          setExtraUploadedRecords((prev) => [...parsedRecords, ...prev]);
          setSelectedRecordId(parsedRecords[0].id);
          setUploadFeedback({
            type: 'success',
            text: `Berhasil mengimpor ${successCount} baris data operasi dari ${file.name}!`,
          });
        } else {
          setUploadFeedback({
            type: 'error',
            text: 'Tidak ada baris data valid. Pastikan format kolom mencakup Tanggal, Waktu, Beban, NH Speed, T1.7, PT006, dan PT007.',
          });
        }
      } catch (err: any) {
        setUploadFeedback({
          type: 'error',
          text: `Gagal membaca file: ${err?.message || 'Format tidak didukung'}`,
        });
      }
    };
    reader.readAsArrayBuffer(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Download template Excel for batch upload
  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-23',
        'Waktu (HH:MM)': '19:00',
        'Beban (MW)': 21.60,
        'NH Speed (RPM)': 11670,
        'T1.7 (°F)': 85.5,
        'PT006 (PSIA)': 14.60,
        'PT007 (PSIA)': 265.79,
      },
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-22',
        'Waktu (HH:MM)': '19:00',
        'Beban (MW)': 18.90,
        'NH Speed (RPM)': 11399,
        'T1.7 (°F)': 84.8,
        'PT006 (PSIA)': 14.64,
        'PT007 (PSIA)': 265.00,
      },
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-21',
        'Waktu (HH:MM)': '19:00',
        'Beban (MW)': 10.50,
        'NH Speed (RPM)': 10645,
        'T1.7 (°F)': 86.0,
        'PT006 (PSIA)': 14.65,
        'PT007 (PSIA)': 210.00,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_PB_Synthesis');
    XLSX.writeFile(wb, 'Template_Upload_PB_Synthesis.xlsx');
  };

  // Filtered & sorted records for table
  const filteredRecords = useMemo(() => {
    let list = [...allMonitoredRecords];
    if (filterZone !== 'ALL') {
      list = list.filter((r) => r.zone === filterZone);
    }
    list.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [allMonitoredRecords, filterZone, sortDirection]);

  // Export to Excel
  const handleExportExcel = () => {
    if (allMonitoredRecords.length === 0) return;
    const rows = allMonitoredRecords.map((r) => ({
      Tanggal: r.date,
      Waktu: r.time,
      'Beban (MW)': r.beban,
      'NH Speed Raw': r.nhSpeed,
      'T1.7 (°F)': r.t1_7,
      'NH Speed Koreksi': r.nhSpeedCorrected,
      'PT006 (PSIA)': r.pt006,
      'PT007 (Testing PSIA)': r.pt007,
      'Y = f(NH)': r.fNH,
      'PB Synthesis (NH)': r.pbSynthesis,
      'Batas Atas (1.18x)': r.upperThreshold,
      'Mendekati Batas Atas (-4.0 PSIA)': r.earlyUpper,
      'Batas Bawah (0.82x)': r.lowerThreshold,
      'Mendekati Batas Bawah (+4.0 PSIA)': r.earlyLower,
      'Zona Operasi': r.zone,
      'Rekomendasi Water Wash': r.isRecommendWaterWash ? 'YA' : 'TIDAK',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluasi_PB_Synthesis');
    XLSX.writeFile(wb, `Evaluasi_PB_Synthesis_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP MONITORING CONTROLLER BAR */}
      <section className="bg-white rounded-xl border border-violet-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-violet-600 text-white rounded-md shadow-2xs">
                <Target className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Monitoring Evaluasi PB Synthesis &amp; Batas Operasi PT007
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Evaluasi langsung titik data operasional (PT007 testing terhadap 4 garis batas: 0.82x, 0.829x, 1.171x, 1.18x). Semua input data dimasukkan di halaman <strong>Input Data</strong>.
            </p>
          </div>

          {onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded transition-colors shadow-2xs cursor-pointer self-start md:self-auto shrink-0"
              title="Upload & impor dataset Excel (.xlsx) atau CSV"
            >
              <Upload className="w-3.5 h-3.5 text-sky-600" />
              <span>Import Dataset (.xlsx)</span>
            </button>
          )}
        </div>

        {/* Record Selector Dropdown / Bar */}
        {allMonitoredRecords.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-violet-50/40 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-violet-700 shrink-0" />
              <label htmlFor="select-monitored-record" className="text-xs font-bold text-violet-950">
                Pilih Titik Data Operasi untuk Dimonitor:
              </label>
            </div>
            <div className="flex items-center gap-2">
              <select
                id="select-monitored-record"
                value={selectedRecordId || ''}
                onChange={(e) => handleSelectRecord(e.target.value)}
                className="w-full sm:w-80 px-3 py-1.5 text-xs border border-violet-300 rounded bg-white font-mono font-bold text-slate-900 shadow-2xs focus:ring-1 focus:ring-violet-500"
              >
                {[...allMonitoredRecords].reverse().map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.date} {r.time} • Beban: {r.beban.toFixed(2)} MW • PT007: {r.pt007.toFixed(2)} PSIA ({r.zone === 'NORMAL' ? 'Normal' : 'Warning/Crossing'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleSelectRecord(allMonitoredRecords[allMonitoredRecords.length - 1].id)}
                className="px-2.5 py-1.5 text-xs font-bold text-violet-700 bg-white border border-violet-200 rounded hover:bg-violet-100 transition-colors shrink-0 shadow-2xs cursor-pointer"
                title="Pilih data rekaman paling baru"
              >
                Terkini
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. DIRECT MONITORING RESULT SECTION */}
      {activeEvaluation ? (
        <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
          {/* Header info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Hasil Evaluasi PT007 Aktual terhadap 4 Batas Operasi
              </h3>
            </div>
            {activeRecord && (
              <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
                Data: {activeRecord.date} {activeRecord.time} • Beban: {activeRecord.beban.toFixed(2)} MW
              </span>
            )}
          </div>

          {/* PROMINENT HIGHLIGHTED STATUS BANNER */}
          {activeEvaluation.zone === 'NORMAL' ? (
            <div className="p-4 sm:p-5 bg-emerald-500/10 border-2 border-emerald-400 rounded-xl text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-lg sm:text-xl font-black text-emerald-900 uppercase tracking-wide block">
                    STATUS NORMAL
                  </span>
                  <p className="text-xs sm:text-sm text-emerald-800 font-semibold mt-1">
                    PT007 di dalam rentang normal (aman di antara Batas Bawah 0.82x dan Batas Atas 1.18x)
                  </p>
                </div>
              </div>
            </div>
          ) : activeEvaluation.zone === 'EARLY_UPPER' || activeEvaluation.zone === 'EARLY_LOWER' ? (
            <div className="p-4 sm:p-5 bg-amber-500/10 border-2 border-amber-400 rounded-xl text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg sm:text-xl font-black text-amber-900 uppercase tracking-wide">
                      {activeEvaluation.zone === 'EARLY_LOWER' ? 'MENDEKATI BATAS BAWAH' : 'MENDEKATI BATAS ATAS'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-900 font-bold mt-1">
                    {activeEvaluation.statusDescription}
                  </p>
                </div>
              </div>
              <div className="sm:text-right shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 text-white font-black text-xs uppercase tracking-wider shadow-2xs">
                  {activeEvaluation.zone === 'EARLY_LOWER' ? 'MENDEKATI BATAS BAWAH' : 'MENDEKATI BATAS ATAS'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 bg-rose-500/10 border-2 border-rose-500 rounded-xl text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-pulse">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-rose-600 text-white rounded-xl shadow-xs shrink-0">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg sm:text-xl font-black text-rose-950 uppercase tracking-wide">
                      RECOMMEND WATER WASHING
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-rose-900 font-bold mt-1">
                    {activeEvaluation.statusDescription}
                  </p>
                </div>
              </div>
              <div className="sm:text-right shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-black text-xs uppercase tracking-wider shadow-2xs">
                  RECOMMEND WATER WASHING
                </span>
              </div>
            </div>
          )}

          {/* PRIMARY HERO SPOTLIGHT: PT007 TESTING DATA (LARGER & HIGHLY STANDOUT) + 5 BENCHMARK CARDS */}
          {(() => {
            const isExceedAtas = activeEvaluation
              ? activeEvaluation.pt007 > activeEvaluation.upperThreshold
              : false;
            const deltaAtasStr = activeEvaluation
              ? isExceedAtas
                ? `+${(activeEvaluation.pt007 - activeEvaluation.upperThreshold).toFixed(2)}`
                : `${(activeEvaluation.upperThreshold - activeEvaluation.pt007).toFixed(2)}`
              : '0.00';

            const isExceedBawah = activeEvaluation
              ? activeEvaluation.pt007 < activeEvaluation.lowerThreshold
              : false;
            const deltaBawahStr = activeEvaluation
              ? isExceedBawah
                ? `-${(activeEvaluation.lowerThreshold - activeEvaluation.pt007).toFixed(2)}`
                : `${(activeEvaluation.pt007 - activeEvaluation.lowerThreshold).toFixed(2)}`
              : '0.00';

            return (
              <div className="space-y-3">
                {/* PROMINENT PT007 SPOTLIGHT CARD - HARMONIOUS LIGHT PALETTE */}
                <div className="p-4 sm:p-5 bg-purple-50/90 border-2 border-purple-300 rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-xs sm:text-sm uppercase font-extrabold tracking-wider text-purple-900">
                      Tekanan PT007:
                    </span>
                    <span className="text-3xl sm:text-4xl font-mono font-black text-purple-950 tracking-tight">
                      {activeEvaluation.pt007.toFixed(2)}
                    </span>
                    <span className="text-base sm:text-lg font-bold text-purple-700 font-sans">
                      PSIA
                    </span>
                  </div>

                  {/* Boundary Differences: (-) when below lower limit, (+) when above upper limit */}
                  <div className="flex items-center gap-2 sm:gap-4 flex-wrap bg-white/90 p-3 rounded-lg border border-purple-200 shrink-0 shadow-2xs">
                    <div className="text-left">
                      <span className="text-[10px] text-purple-800 font-semibold block uppercase tracking-wide">
                        Selisih thd Batas Bawah
                      </span>
                      <span className="text-base sm:text-lg font-mono font-bold text-slate-900">
                        {deltaBawahStr} <span className="text-[10px] text-slate-500 font-sans font-normal">PSIA</span>
                      </span>
                    </div>
                    <div className="w-px h-8 bg-purple-200 hidden sm:block" />
                    <div className="text-left">
                      <span className="text-[10px] text-purple-800 font-semibold block uppercase tracking-wide">
                        Selisih thd Batas Atas
                      </span>
                      <span className="text-base sm:text-lg font-mono font-bold text-slate-900">
                        {deltaAtasStr} <span className="text-[10px] text-slate-500 font-sans font-normal">PSIA</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 BENCHMARK COMPARISON THRESHOLD CARDS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-stretch">
                  {/* Card 1: PB SYNTHESIS (NH) */}
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg flex flex-col justify-between shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider block">PB Synthesis (NH)</span>
                    <span className="text-lg font-mono font-black text-blue-950 my-1">
                      {activeEvaluation.pbSynthesis.toFixed(2)} PSIA
                    </span>
                    <p className="text-[10px] text-blue-700 font-sans truncate">
                      Y × PT006 ({activeEvaluation.fNH} × {activeEvaluation.pt006})
                    </p>
                  </div>

                  {/* Card 2: Batas Bawah (0.82x) */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg flex flex-col justify-between shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-rose-800 tracking-wider block">Batas Bawah (0.82x)</span>
                    <span className="text-lg font-mono font-black text-rose-950 my-1">
                      {activeEvaluation.lowerThreshold.toFixed(2)} PSIA
                    </span>
                    <p className="text-[10px] text-rose-700 font-sans font-semibold">
                      Selisih: {deltaBawahStr} PSIA
                    </p>
                  </div>

                  {/* Card 3: Mendekati Batas Bawah (+4.0 PSIA) */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col justify-between shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">Mendekati Batas Bawah (+4.0 PSIA)</span>
                    <span className="text-lg font-mono font-black text-amber-950 my-1">
                      {activeEvaluation.earlyLower.toFixed(2)} PSIA
                    </span>
                    <p className="text-[10px] text-amber-700 font-sans">
                      Rentang: {activeEvaluation.lowerThreshold.toFixed(2)} – {activeEvaluation.earlyLower.toFixed(2)} PSIA
                    </p>
                  </div>

                  {/* Card 4: Mendekati Batas Atas (-4.0 PSIA) */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col justify-between shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">Mendekati Batas Atas (-4.0 PSIA)</span>
                    <span className="text-lg font-mono font-black text-amber-950 my-1">
                      {activeEvaluation.earlyUpper.toFixed(2)} PSIA
                    </span>
                    <p className="text-[10px] text-amber-700 font-sans">
                      Rentang: {activeEvaluation.earlyUpper.toFixed(2)} – {activeEvaluation.upperThreshold.toFixed(2)} PSIA
                    </p>
                  </div>

                  {/* Card 5: Batas Atas (1.18x) */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg flex flex-col justify-between shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-rose-800 tracking-wider block">Batas Atas (1.18x)</span>
                    <span className="text-lg font-mono font-black text-rose-950 my-1">
                      {activeEvaluation.upperThreshold.toFixed(2)} PSIA
                    </span>
                    <p className="text-[10px] text-rose-700 font-sans font-semibold">
                      Selisih: {deltaAtasStr} PSIA
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
          <Target className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Belum Ada Data Operasi untuk Dievaluasi</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Masukkan data operasional di halaman <strong>Input Data</strong> (atau upload berkas Excel/CSV) untuk memonitor titik operasi aktual terhadap batas PB Synthesis.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onNavigateToInput}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Buka Halaman Input Data</span>
            </button>
          </div>
        </section>
      )}

      {/* 3. SUPERVISOR BENCHMARK CURVE CHART: BEBAN (X-AXIS) vs TEKANAN PT007 (Y-AXIS) */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span>Grafik Kurva Operasi PB Synthesis (Standar Benchmark Excel)</span>
            </h3>
          </div>

          {/* Interactive Zoom Controls & Auto-Fit Buttons */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Zoom Presets */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 shadow-2xs">
              <button
                type="button"
                onClick={() => { setZoomMode('AUTO_DATA'); setZoomLevel(1.0); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  zoomMode === 'AUTO_DATA' ? 'bg-white text-violet-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Sesuaikan sumbu Y dengan nilai batas bawah dan batas atas data yang tercatat"
              >
                Auto-Fit Data
              </button>
              <button
                type="button"
                onClick={() => { setZoomMode('FOCUS_PT007'); setZoomLevel(1.0); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  zoomMode === 'FOCUS_PT007' ? 'bg-white text-violet-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Perbesar fokus sumbu Y langsung pada titik sebaran PT007"
              >
                Fokus PT007
              </button>
              <button
                type="button"
                onClick={() => { setZoomMode('FULL'); setZoomLevel(1.0); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  zoomMode === 'FULL' ? 'bg-white text-violet-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilkan rentang penuh standar Speedronic (85 - 325 PSIA)"
              >
                Skala Penuh
              </button>
            </div>

            {/* Zoom In / Out Buttons */}
            <div className="inline-flex items-center gap-1 border border-slate-200 rounded-lg bg-white px-1.5 py-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer transition-colors"
                title="Perbesar visual titik (Zoom In)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-600 px-1">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer transition-colors"
                title="Perkecil visual titik (Zoom Out)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              {zoomLevel !== 1.0 && (
                <button
                  type="button"
                  onClick={() => setZoomLevel(1.0)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 cursor-pointer transition-colors ml-0.5"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chart Interactive Filter Toolbar */}
        <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 mr-1">
              <Filter className="w-3.5 h-3.5 text-violet-600" />
              <span>Filter Titik Grafik:</span>
            </div>

            {/* Filter Tanggal Dropdown */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={chartDateFilter}
                onChange={(e) => setChartDateFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent border-0 focus:outline-none cursor-pointer"
                title="Filter titik grafik berdasarkan tanggal operasi"
              >
                <option value="ALL">Semua Tanggal ({allMonitoredRecords.length} titik)</option>
                {uniqueDates.map((d) => {
                  const count = allMonitoredRecords.filter((r) => r.date === d).length;
                  return (
                    <option key={d} value={d}>
                      Tanggal {d} ({count} titik)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="hidden lg:flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-0.5 shadow-2xs text-[11px] text-slate-600">
              <span className="text-slate-400">Rentang:</span>
              <input
                type="date"
                value={chartStartDateFilter}
                onChange={(e) => {
                  setChartStartDateFilter(e.target.value);
                  setChartDateFilter('ALL');
                }}
                className="px-1 py-0.5 text-[11px] border border-slate-200 rounded font-mono"
                title="Dari Tanggal"
              />
              <span className="text-slate-400">s/d</span>
              <input
                type="date"
                value={chartEndDateFilter}
                onChange={(e) => {
                  setChartEndDateFilter(e.target.value);
                  setChartDateFilter('ALL');
                }}
                className="px-1 py-0.5 text-[11px] border border-slate-200 rounded font-mono"
                title="Sampai Tanggal"
              />
            </div>

            {/* Filter Status / Zona Operasi */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1 shadow-2xs">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={chartZoneFilter}
                onChange={(e) => setChartZoneFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent border-0 focus:outline-none cursor-pointer"
                title="Filter berdasarkan status zona titik"
              >
                <option value="ALL">Semua Zona</option>
                <option value="NORMAL">Normal ({allMonitoredRecords.filter((r) => r.zone === 'NORMAL').length})</option>
                <option value="CAUTION">Caution ({allMonitoredRecords.filter((r) => r.zone === 'EARLY_UPPER' || r.zone === 'EARLY_LOWER').length})</option>
                <option value="ALARM">Recommend Water Washing ({allMonitoredRecords.filter((r) => r.zone === 'MELEWATI_BATAS_ATAS' || r.zone === 'MELEWATI_BATAS_BAWAH').length})</option>
              </select>
            </div>

            {/* Tampilan Titik: Semua vs Hanya Titik Aktif */}
            <div className="inline-flex rounded border border-slate-300 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setChartShowOnlySelected(false)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  !chartShowOnlySelected ? 'bg-violet-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Titik
              </button>
              <button
                type="button"
                onClick={() => setChartShowOnlySelected(true)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  chartShowOnlySelected ? 'bg-violet-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Hanya tampilkan titik aktif yang sedang diinspeksi"
              >
                Hanya Titik Aktif
              </button>
            </div>

            {/* Toggle Label Angka */}
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-slate-700 select-none ml-1">
              <input
                type="checkbox"
                checked={showPointLabels}
                onChange={(e) => setShowPointLabels(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Label Angka</span>
            </label>

            {/* Reset Filter Button */}
            {(chartDateFilter !== 'ALL' || chartStartDateFilter || chartEndDateFilter || chartZoneFilter !== 'ALL' || chartShowOnlySelected) && (
              <button
                type="button"
                onClick={() => {
                  setChartDateFilter('ALL');
                  setChartStartDateFilter('');
                  setChartEndDateFilter('');
                  setChartZoneFilter('ALL');
                  setChartShowOnlySelected(false);
                }}
                className="px-2 py-0.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded shadow-2xs cursor-pointer transition-colors"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* Filter Summary Count */}
          <div className="flex items-center gap-1.5 self-start md:self-auto shrink-0 text-slate-500 text-[11px]">
            <span>Titik Ditampilkan:</span>
            <span className="font-bold text-violet-900 bg-violet-100 px-2 py-0.5 rounded border border-violet-200">
              {chartFilteredRecords.length} / {allMonitoredRecords.length} Titik
            </span>
          </div>
        </div>

        {/* High-Precision Interactive SVG Chart with X = Beban 1-23, Y = Tekanan disesuaikan data */}
        {(() => {
          // X domain: Beban Turbin (1.00 to 23.00 MW per user request)
          const minBeban = 1.0;
          const maxBeban = 23.0;

          // The curve represents the turbine's operational envelope from the complete monitored dataset
          const allValidRecords = allMonitoredRecords.filter(
            (r) => r.beban >= 0.5 && r.beban <= 25 && r.lowerThreshold > 0 && r.upperThreshold > 0
          );

          // Extract empirical anchor points across load range from actual recorded turbine data
          const empiricalAnchors: {
            beban: number;
            batasBawah: number;
            batasAtas: number;
          }[] = [];

          if (allValidRecords.length > 0) {
            for (let b = 1.0; b <= 23.5; b += 0.5) {
              const inBin = allValidRecords.filter((r) => Math.abs(r.beban - b) <= 0.75);
              if (inBin.length > 0) {
                const avgLower = inBin.reduce((acc, c) => acc + c.lowerThreshold, 0) / inBin.length;
                const avgUpper = inBin.reduce((acc, c) => acc + c.upperThreshold, 0) / inBin.length;
                empiricalAnchors.push({
                  beban: Number(b.toFixed(2)),
                  batasBawah: Number(avgLower.toFixed(2)),
                  batasAtas: Number(avgUpper.toFixed(2)),
                });
              }
            }
          }

          // If an active point is selected, strictly anchor the curve at activeEvaluation.beban
          // so the curve at the active point's load EXACTLY matches activeEvaluation's real operating boundaries
          if (activeEvaluation) {
            const actBeban = Number(activeEvaluation.beban.toFixed(2));
            const actLower = Number(activeEvaluation.lowerThreshold.toFixed(2));
            const actUpper = Number(activeEvaluation.upperThreshold.toFixed(2));
            const existingIdx = empiricalAnchors.findIndex((a) => Math.abs(a.beban - actBeban) <= 0.4);
            if (existingIdx >= 0) {
              empiricalAnchors[existingIdx] = {
                beban: actBeban,
                batasBawah: actLower,
                batasAtas: actUpper,
              };
            } else {
              empiricalAnchors.push({
                beban: actBeban,
                batasBawah: actLower,
                batasAtas: actUpper,
              });
              empiricalAnchors.sort((a, b) => a.beban - b.beban);
            }
          }

          // Continuous sample points along Beban 1.0 to 23.0 MW
          const samples: {
            beban: number;
            alarmBawah: number;
            batasBawah: number;
            earlyBawah: number;
            earlyAtas: number;
            batasAtas: number;
            alarmAtas: number;
          }[] = [];

          for (let b = 1.0; b <= 23.001; b += 0.2) {
            const curB = Number(b.toFixed(2));
            if (empiricalAnchors.length >= 2) {
              let lower = 0;
              let upper = 0;
              if (curB <= empiricalAnchors[0].beban) {
                const slopeL = (empiricalAnchors[1].batasBawah - empiricalAnchors[0].batasBawah) / (empiricalAnchors[1].beban - empiricalAnchors[0].beban);
                const slopeU = (empiricalAnchors[1].batasAtas - empiricalAnchors[0].batasAtas) / (empiricalAnchors[1].beban - empiricalAnchors[0].beban);
                lower = empiricalAnchors[0].batasBawah + slopeL * (curB - empiricalAnchors[0].beban);
                upper = empiricalAnchors[0].batasAtas + slopeU * (curB - empiricalAnchors[0].beban);
              } else if (curB >= empiricalAnchors[empiricalAnchors.length - 1].beban) {
                const last = empiricalAnchors.length - 1;
                const slopeL = (empiricalAnchors[last].batasBawah - empiricalAnchors[last - 1].batasBawah) / (empiricalAnchors[last].beban - empiricalAnchors[last - 1].beban);
                const slopeU = (empiricalAnchors[last].batasAtas - empiricalAnchors[last - 1].batasAtas) / (empiricalAnchors[last].beban - empiricalAnchors[last - 1].beban);
                lower = empiricalAnchors[last].batasBawah + slopeL * (curB - empiricalAnchors[last].beban);
                upper = empiricalAnchors[last].batasAtas + slopeU * (curB - empiricalAnchors[last].beban);
              } else {
                for (let i = 0; i < empiricalAnchors.length - 1; i++) {
                  if (curB >= empiricalAnchors[i].beban && curB <= empiricalAnchors[i + 1].beban) {
                    const span = empiricalAnchors[i + 1].beban - empiricalAnchors[i].beban;
                    const frac = span > 0 ? (curB - empiricalAnchors[i].beban) / span : 0;
                    lower = empiricalAnchors[i].batasBawah + frac * (empiricalAnchors[i + 1].batasBawah - empiricalAnchors[i].batasBawah);
                    upper = empiricalAnchors[i].batasAtas + frac * (empiricalAnchors[i + 1].batasAtas - empiricalAnchors[i].batasAtas);
                    break;
                  }
                }
              }
              const bBawah = Number(lower.toFixed(2));
              const bAtas = Number(upper.toFixed(2));
              samples.push({
                beban: curB,
                alarmBawah: Number((bBawah - 4.0).toFixed(2)),
                batasBawah: bBawah,
                earlyBawah: Number((bBawah + 4.0).toFixed(2)),
                earlyAtas: Number((bAtas - 4.0).toFixed(2)),
                batasAtas: bAtas,
                alarmAtas: Number((bAtas + 4.0).toFixed(2)),
              });
            } else {
              const exp = getExpectedCurveAtBeban(curB);
              samples.push({
                beban: curB,
                alarmBawah: Number((exp.lowerThreshold - 4.0).toFixed(2)),
                batasBawah: exp.lowerThreshold,
                earlyBawah: exp.earlyLower,
                earlyAtas: exp.earlyUpper,
                batasAtas: exp.upperThreshold,
                alarmAtas: Number((exp.upperThreshold + 4.0).toFixed(2)),
              });
            }
          }

          let rawMinY = 90;
          let rawMaxY = 320;

          const pointsForScale = (chartFilteredRecords.length > 0 ? chartFilteredRecords : allMonitoredRecords);
          if (zoomMode === 'AUTO_DATA' && pointsForScale.length > 0) {
            const recMin = Math.min(...pointsForScale.map((r) => Math.min(r.lowerThreshold, r.pt007)));
            const recMax = Math.max(...pointsForScale.map((r) => Math.max(r.upperThreshold, r.pt007)));
            rawMinY = Math.max(40, Math.floor((recMin - 15) / 5) * 5);
            rawMaxY = Math.min(380, Math.ceil((recMax + 15) / 5) * 5);
          } else if (zoomMode === 'FOCUS_PT007' && pointsForScale.length > 0) {
            const recMinPT = Math.min(...pointsForScale.map((r) => r.pt007));
            const recMaxPT = Math.max(...pointsForScale.map((r) => r.pt007));
            rawMinY = Math.max(40, Math.floor((recMinPT - 15) / 5) * 5);
            rawMaxY = Math.min(380, Math.ceil((recMaxPT + 15) / 5) * 5);
          } else {
            rawMinY = 80;
            rawMaxY = 330;
          }

          // Apply interactive zoom level around center
          const yCenter = (rawMinY + rawMaxY) / 2;
          const ySpan = ((rawMaxY - rawMinY) / 2) / zoomLevel;
          const minP = Math.max(40, Math.floor((yCenter - ySpan) / 5) * 5);
          const maxP = Math.min(400, Math.ceil((yCenter + ySpan) / 5) * 5);

          // Dimensions & Scales
          const svgW = 1080;
          const svgH = 580;
          const padL = 65;
          const padR = 135;
          const padT = 30;
          const padB = 60;
          const plotW = svgW - padL - padR;
          const plotH = svgH - padT - padB;

          const toX = (b: number) => padL + ((Math.max(minBeban, Math.min(maxBeban, b)) - minBeban) / (maxBeban - minBeban)) * plotW;
          const toY = (p: number) => padT + plotH - ((Math.max(minP, Math.min(maxP, p)) - minP) / (maxP - minP)) * plotH;

          // Build SVG line paths along X = Beban, Y = Pressure
          const pathBatasBawah = samples
            .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.batasBawah).toFixed(1)}`)
            .join(' ');
          const pathEarlyBawah = samples
            .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.earlyBawah).toFixed(1)}`)
            .join(' ');
          const pathBatasAtas = samples
            .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.batasAtas).toFixed(1)}`)
            .join(' ');
          const pathEarlyAtas = samples
            .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.earlyAtas).toFixed(1)}`)
            .join(' ');

          // Build Shaded Ribbon Areas:
          // 1. Alarm Bawah Zone (below alarmBawah = Batas Bawah - 4.0 down to minP)
          const ribbonBelowAlarmBawahPath = (() => {
            const up = samples.map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.alarmBawah).toFixed(1)}`).join(' ');
            const btmRight = `L ${toX(samples[samples.length - 1].beban).toFixed(1)} ${toY(minP).toFixed(1)}`;
            const btmLeft = `L ${toX(samples[0].beban).toFixed(1)} ${toY(minP).toFixed(1)}`;
            return `${up} ${btmRight} ${btmLeft} Z`;
          })();

          // 2. Mendekati Batas Bawah (between alarmBawah and earlyBawah = Batas Bawah + 4.0)
          const ribbonMendekatiBawahPath = (() => {
            const up = samples.map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.earlyBawah).toFixed(1)}`).join(' ');
            const down = [...samples].reverse().map((s) => `L ${toX(s.beban).toFixed(1)} ${toY(s.alarmBawah).toFixed(1)}`).join(' ');
            return `${up} ${down} Z`;
          })();

          // 3. Normal Operating Zone (between earlyBawah = Batas Bawah + 4.0 and earlyAtas = Batas Atas - 4.0)
          const ribbonNormalPath = (() => {
            const up = samples.map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.earlyAtas).toFixed(1)}`).join(' ');
            const down = [...samples].reverse().map((s) => `L ${toX(s.beban).toFixed(1)} ${toY(s.earlyBawah).toFixed(1)}`).join(' ');
            return `${up} ${down} Z`;
          })();

          // 4. Mendekati Batas Atas (between earlyAtas = Batas Atas - 4.0 and alarmAtas = Batas Atas + 4.0)
          const ribbonMendekatiAtasPath = (() => {
            const up = samples.map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.alarmAtas).toFixed(1)}`).join(' ');
            const down = [...samples].reverse().map((s) => `L ${toX(s.beban).toFixed(1)} ${toY(s.earlyAtas).toFixed(1)}`).join(' ');
            return `${up} ${down} Z`;
          })();

          // 5. Alarm Atas Zone (above alarmAtas = Batas Atas + 4.0 up to maxP)
          const ribbonBeyondAlarmAtasPath = (() => {
            const up = samples.map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.beban).toFixed(1)} ${toY(s.alarmAtas).toFixed(1)}`).join(' ');
            const topRight = `L ${toX(samples[samples.length - 1].beban).toFixed(1)} ${toY(maxP).toFixed(1)}`;
            const topLeft = `L ${toX(samples[0].beban).toFixed(1)} ${toY(maxP).toFixed(1)}`;
            return `${up} ${topRight} ${topLeft} Z`;
          })();

          // X ticks: 1, 2, ..., 23 MW (matching user request)
          const xTicks = Array.from({ length: 23 }, (_, i) => i + 1);

          // Y ticks: step 5 or 10 depending on visible span
          const yStep = (maxP - minP) <= 130 ? 5 : 10;
          const yTicks: number[] = [];
          for (let p = minP; p <= maxP; p += yStep) {
            yTicks.push(p);
          }

          // Active hovered record details if any
          const hoveredRecord = hoveredRecordId
            ? allMonitoredRecords.find((r) => r.id === hoveredRecordId) || null
            : null;

          return (
            <div className="w-full relative overflow-x-auto bg-slate-950/2 rounded-xl p-2 border border-slate-200">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto select-none font-sans"
                style={{ minHeight: '500px', maxHeight: '580px' }}
              >
                <defs>
                  <filter id="dot-shadow" x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.35" />
                  </filter>
                  <filter id="current-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feDropShadow dx="0" dy="0" stdDeviation="4.5" floodColor="#ec4899" floodOpacity="0.85" />
                  </filter>
                </defs>

                {/* Plot Background */}
                <rect
                  x={padL}
                  y={padT}
                  width={plotW}
                  height={plotH}
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />

                {/* Horizontal Grid Lines (Pressure Y Axis) */}
                {yTicks.map((yVal) => (
                  <g key={`y-grid-${yVal}`}>
                    <line
                      x1={padL}
                      y1={toY(yVal)}
                      x2={padL + plotW}
                      y2={toY(yVal)}
                      stroke={yVal % 50 === 0 ? "#cbd5e1" : "#e2e8f0"}
                      strokeWidth={yVal % 50 === 0 ? 1.0 : 0.6}
                    />
                    <text
                      x={padL - 6}
                      y={toY(yVal) + 2.5}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight={yVal % 50 === 0 ? 'bold' : 'normal'}
                    >
                      {yVal.toFixed(2).replace('.', ',')}
                    </text>
                  </g>
                ))}

                {/* Vertical Grid Lines (Beban X Axis: 1 to 23 MW) */}
                {xTicks.map((xVal) => (
                  <g key={`x-grid-${xVal}`}>
                    <line
                      x1={toX(xVal)}
                      y1={padT}
                      x2={toX(xVal)}
                      y2={padT + plotH}
                      stroke={xVal % 5 === 0 ? "#cbd5e1" : "#f1f5f9"}
                      strokeWidth={xVal % 5 === 0 ? 1.2 : 0.6}
                    />
                    <text
                      x={toX(xVal)}
                      y={padT + plotH + 16}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight={xVal % 5 === 0 ? 'bold' : 'normal'}
                    >
                      {xVal.toFixed(2).replace('.', ',')}
                    </text>
                  </g>
                ))}

                {/* Supervisor Excel Right Floating Legend */}
                <g transform={`translate(${padL + plotW + 12}, ${padT + plotH / 2 - 45})`}>
                  {/* Legend Batas Atas (Yellow Solid) */}
                  <line x1={0} y1={0} x2={20} y2={0} stroke="#eab308" strokeWidth="2.8" strokeLinecap="round" />
                  <text x={26} y={3.5} fill="#1e293b" fontSize="10" fontWeight="bold">
                    Batas Atas (1.18x)
                  </text>

                  {/* Legend Early Warning (Amber Dashed) */}
                  <line x1={0} y1={22} x2={20} y2={22} stroke="#d97706" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
                  <text x={26} y={25.5} fill="#1e293b" fontSize="9.5" fontWeight="semibold">
                    Early Warning (±4)
                  </text>

                  {/* Legend Batas Normal (Red Solid) */}
                  <line x1={0} y1={44} x2={20} y2={44} stroke="#dc2626" strokeWidth="2.8" strokeLinecap="round" />
                  <text x={26} y={47.5} fill="#1e293b" fontSize="10" fontWeight="bold">
                    Batas Bawah (0.82x)
                  </text>

                  {/* Legend PT007 (Emerald Dot) */}
                  <circle cx={10} cy={66} r={5} fill="#059669" stroke="#ffffff" strokeWidth="1.5" filter="url(#dot-shadow)" />
                  <text x={26} y={69.5} fill="#1e293b" fontSize="10" fontWeight="bold">
                    PT007
                  </text>
                </g>

                {/* SHADED RIBBON AREAS */}
                {/* 1. Alarm Bawah Zone (below Batas Bawah) */}
                <path d={ribbonBelowAlarmBawahPath} fill="rgba(239, 68, 68, 0.08)" />

                {/* 2. Mendekati Batas Bawah (between Batas Bawah and earlyBawah) */}
                <path d={ribbonMendekatiBawahPath} fill="rgba(245, 158, 11, 0.16)" />

                {/* 3. Normal Operating Zone (between earlyBawah and earlyAtas) */}
                <path d={ribbonNormalPath} fill="rgba(16, 185, 129, 0.12)" />

                {/* 4. Mendekati Batas Atas (between earlyAtas and Batas Atas) */}
                <path d={ribbonMendekatiAtasPath} fill="rgba(245, 158, 11, 0.16)" />

                {/* 5. Alarm Atas Zone (above Batas Atas) */}
                <path d={ribbonBeyondAlarmAtasPath} fill="rgba(239, 68, 68, 0.08)" />

                {/* Curve Lines (drawn from top to bottom in pressure order) */}
                {/* Line 1 (Paling Atas): Ambang Alarm Atas (+4.0 PSIA di atas Batas Atas) - Amber Dashed */}
                <path
                  d={pathEarlyAtas}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                />

                {/* Line 2: Batas Atas (1.18x) - Yellow Solid Line */}
                <path
                  d={pathBatasAtas}
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />

                {/* Line 3: Batas Bawah (0.82x) - Red Solid Line */}
                <path
                  d={pathBatasBawah}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />

                {/* Line 4 (Paling Bawah): Ambang Alarm Bawah (-4.0 PSIA di bawah Batas Bawah) - Amber Dashed */}
                <path
                  d={pathEarlyBawah}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                />

                {/* In-Chart Legend Markers */}
                <text
                  x={toX(22.2)}
                  y={toY(Math.min(maxP - 5, samples[samples.length - 1].batasAtas + 8))}
                  fill="#ca8a04"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="end"
                >
                  Batas Atas (1.18x)
                </text>
                <text
                  x={toX(22.2)}
                  y={toY(Math.max(minP + 10, samples[samples.length - 1].batasBawah - 5))}
                  fill="#dc2626"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="end"
                >
                  Batas Bawah (0.82x)
                </text>

                {/* SCATTER POINTS: (Beban, PT007) with Crystal-Clear Enlarged Dots and Callout Badges */}
                {chartFilteredRecords.map((r, i) => {
                  const cx = toX(r.beban);
                  const cy = toY(r.pt007);
                  const isSelected = selectedRecordId === r.id;
                  const isHovered = hoveredRecordId === r.id;

                  // Determine dot color based on operational zone
                  const isAlarm = r.zone === 'MELEWATI_BATAS_BAWAH' || r.zone === 'MELEWATI_BATAS_ATAS';
                  const isEarly = r.zone === 'EARLY_LOWER' || r.zone === 'EARLY_UPPER';
                  const dotColor = isAlarm ? '#dc2626' : isEarly ? '#f59e0b' : '#059669';

                  // Alternating callout label placement so numbers don't overlap
                  const labelOffsetY = i % 2 === 0 ? -18 : -28;
                  const labelOffsetX = i % 2 === 0 ? -16 : 16;

                  // Only show small floating number badge if toggled ON and dataset is reasonably sized, or if currently selected/hovered
                  const shouldShowCallout = (showPointLabels && chartFilteredRecords.length <= 25) || isSelected || isHovered;

                  return (
                    <g
                      key={r.id}
                      onClick={() => setSelectedRecordId(r.id)}
                      onMouseEnter={() => setHoveredRecordId(r.id)}
                      onMouseLeave={() => setHoveredRecordId(null)}
                      className="cursor-pointer group"
                    >
                      {shouldShowCallout && (
                        <>
                          {/* Leader line to data callout label */}
                          <line
                            x1={cx}
                            y1={cy}
                            x2={cx + labelOffsetX}
                            y2={cy + labelOffsetY + 7}
                            stroke="#94a3b8"
                            strokeWidth={isSelected || isHovered ? "1.4" : "0.9"}
                            opacity={isSelected || isHovered ? "1" : "0.75"}
                          />

                          {/* Small Callout Label (PT007 value formatted like Excel) */}
                          <rect
                            x={cx + labelOffsetX - 19}
                            y={cy + labelOffsetY - 9}
                            width={38}
                            height={16}
                            rx={3}
                            fill="#ffffff"
                            stroke={isSelected ? "#ec4899" : isHovered ? "#6366f1" : "#cbd5e1"}
                            strokeWidth={isSelected || isHovered ? "1.5" : "0.9"}
                            filter="url(#dot-shadow)"
                            className="transition-all"
                          />
                          <text
                            x={cx + labelOffsetX}
                            y={cy + labelOffsetY + 3}
                            textAnchor="middle"
                            fill={isSelected ? "#831843" : "#0f172a"}
                            fontSize="9.5"
                            fontFamily="monospace"
                            fontWeight="bold"
                            className="pointer-events-none"
                          >
                            {r.pt007.toFixed(1).replace('.', ',')}
                          </text>
                        </>
                      )}

                      {/* Data Point Dot - Enlarged & Distinct for Clear Visual Position */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSelected ? 9.5 : isHovered ? 8.5 : 7.0}
                        fill={dotColor}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? 2.5 : 2.0}
                        filter="url(#dot-shadow)"
                        className="transition-transform duration-150"
                      />
                    </g>
                  );
                })}

                {/* Empty State Banner when filter yields 0 points */}
                {chartFilteredRecords.length === 0 && (
                  <g transform={`translate(${padL + plotW / 2}, ${padT + plotH / 2})`}>
                    <rect
                      x="-150"
                      y="-28"
                      width="300"
                      height="56"
                      rx="8"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                      filter="url(#dot-shadow)"
                    />
                    <text textAnchor="middle" y="-6" fill="#334155" fontSize="12" fontWeight="bold">
                      Tidak ada titik operasi yang cocok
                    </text>
                    <text textAnchor="middle" y="14" fill="#64748b" fontSize="10.5">
                      Ganti pilihan filter tanggal atau klik Reset Filter
                    </text>
                  </g>
                )}

                {/* Floating Interactive Hover Tooltip for Instant Inspection */}
                {hoveredRecord && hoveredRecord.id !== selectedRecordId && (
                  <g
                    transform={`translate(${Math.min(plotW - 120, toX(hoveredRecord.beban) + 16)}, ${Math.max(padT + 10, toY(hoveredRecord.pt007) - 35)})`}
                    className="pointer-events-none"
                  >
                    <rect
                      x={0}
                      y={-14}
                      width={190}
                      height={44}
                      rx={6}
                      fill="#0f172a"
                      opacity="0.95"
                      filter="url(#dot-shadow)"
                    />
                    <text x={8} y={-1} fill="#ffffff" fontSize="10" fontWeight="bold">
                      {hoveredRecord.date} {hoveredRecord.time || '19:00'}
                    </text>
                    <text x={8} y={11} fill="#38bdf8" fontSize="9" fontFamily="monospace">
                      Beban: {hoveredRecord.beban.toFixed(2)} MW &bull; PT007: {hoveredRecord.pt007.toFixed(2)}
                    </text>
                    <text x={8} y={23} fill="#cbd5e1" fontSize="8.5">
                      Bawah: {hoveredRecord.lowerThreshold} | Atas: {hoveredRecord.upperThreshold} PSIA
                    </text>
                  </g>
                )}

                {/* ACTIVELY SELECTED RECORD: Highlighted with crosshairs, glow halo, and full badge */}
                {activeEvaluation && (
                  <g className="pointer-events-none">
                    {/* Crosshair guidelines to X and Y axes */}
                    <line
                      x1={padL}
                      y1={toY(activeEvaluation.pt007)}
                      x2={toX(activeEvaluation.beban)}
                      y2={toY(activeEvaluation.pt007)}
                      stroke="#ec4899"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <line
                      x1={toX(activeEvaluation.beban)}
                      y1={toY(activeEvaluation.pt007)}
                      x2={toX(activeEvaluation.beban)}
                      y2={padT + plotH}
                      stroke="#ec4899"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />

                    {/* Outer pulsating ring */}
                    <circle
                      cx={toX(activeEvaluation.beban)}
                      cy={toY(activeEvaluation.pt007)}
                      r={15}
                      fill="none"
                      stroke="#ec4899"
                      strokeWidth="2.5"
                      opacity="0.6"
                    />

                    {/* Inner active marker */}
                    <circle
                      cx={toX(activeEvaluation.beban)}
                      cy={toY(activeEvaluation.pt007)}
                      r={8}
                      fill="#ec4899"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      filter="url(#current-glow)"
                    />

                    {/* Active Point Callout Box */}
                    <g transform={`translate(${Math.min(plotW - 140, toX(activeEvaluation.beban) + 14)}, ${Math.max(padT + 15, toY(activeEvaluation.pt007) - 22)})`}>
                      <rect
                        x={0}
                        y={-14}
                        width={210}
                        height={28}
                        rx={6}
                        fill="#ffffff"
                        stroke="#db2777"
                        strokeWidth="1.8"
                        filter="url(#dot-shadow)"
                      />
                      <text x={8} y={-1} fill="#9d174d" fontSize="10" fontWeight="bold">
                        Aktif: {activeEvaluation.beban.toFixed(2)} MW &bull; PT007: {activeEvaluation.pt007.toFixed(2)} PSIA
                      </text>
                      <text x={8} y={10} fill="#64748b" fontSize="8.5">
                        Bawah: {activeEvaluation.lowerThreshold} | Atas: {activeEvaluation.upperThreshold} PSIA
                      </text>
                    </g>
                  </g>
                )}

                {/* Main Axis Title Labels */}
                <text
                  x={padL + plotW / 2}
                  y={svgH - 12}
                  textAnchor="middle"
                  fill="#1e293b"
                  fontSize="12"
                  fontWeight="bold"
                >
                  Beban Turbin (MW) &bull; Sumbu Horizontal (1 - 23 MW)
                </text>
                <text
                  x={18}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  fill="#1e293b"
                  fontSize="12"
                  fontWeight="bold"
                  transform={`rotate(-90 18 ${padT + plotH / 2})`}
                >
                  Tekanan PT007 (PSIA) &bull; Sumbu Vertikal
                </text>
              </svg>
            </div>
          );
        })()}

        {/* Info Cards below Chart */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-100">
          <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <span className="font-bold text-emerald-950 block">Zona Normal (0.82x s/d 1.18x)</span>
              <span className="text-[11px] text-emerald-800">Nilai PT007 berada aman di zona hijau di antara Batas Bawah dan Batas Atas.</span>
            </div>
          </div>
          <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shrink-0" />
            <div>
              <span className="font-bold text-amber-950 block">Mendekati Batas (Warning)</span>
              <span className="text-[11px] text-amber-800">Selisih melebihi batas dalam toleransi 4.0 PSIA (Bawah s/d -4.0 PSIA; Atas s/d +4.0 PSIA). Belum recommend water washing.</span>
            </div>
          </div>
          <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded-lg flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-500 shrink-0" />
            <div>
              <span className="font-bold text-rose-950 block">Recommend Water Washing</span>
              <span className="text-[11px] text-rose-800">Selisih melebihi batas lebih dari 4.0 PSIA (&gt; +4.0 PSIA di atas Batas Atas atau &lt; -4.0 PSIA di bawah Batas Bawah).</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HISTORICAL MONITORING TABLE */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Riwayat Titik Input &amp; Evaluasi PT007 ({filteredRecords.length} Data)
            </h3>
            <p className="text-xs text-slate-500">
              Klik baris mana pun untuk menampilkan titik dan kalkulasinya pada kartu status dan grafik di atas.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Zone Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-300 rounded bg-white font-medium"
              >
                <option value="ALL">Semua Zona</option>
                <option value="NORMAL">Normal</option>
                <option value="EARLY_UPPER">Mendekati Batas Atas</option>
                <option value="EARLY_LOWER">Mendekati Batas Bawah</option>
                <option value="MELEWATI_BATAS_ATAS">Batas Atas (Recommend Water Washing)</option>
                <option value="MELEWATI_BATAS_BAWAH">Batas Bawah (Recommend Water Washing)</option>
              </select>
            </div>

            {/* Sort Toggle */}
            <button
              type="button"
              onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded cursor-pointer shadow-2xs"
            >
              <ArrowDownUp className="w-3.5 h-3.5 text-slate-500" />
              <span>{sortDirection === 'desc' ? 'Terbaru' : 'Terlama'}</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded cursor-pointer shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Excel</span>
            </button>

            {/* Clear All Extra Records if any */}
            {extraUploadedRecords.length > 0 && (
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded cursor-pointer shadow-2xs transition-colors"
                title="Hapus data upload lokal (dengan konfirmasi pop up)"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Reset Upload</span>
              </button>
            )}
          </div>
        </div>

        {/* Records Table */}
        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {allMonitoredRecords.length === 0
              ? 'Belum ada data input tercatat. Masukkan data di halaman Input Data atau unggah berkas Excel/CSV di atas.'
              : 'Tidak ada rekaman data operasi yang cocok dengan filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-auto">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2 px-2 whitespace-nowrap">Waktu &amp; Tanggal</th>
                  <th className="py-2 px-1.5 text-right whitespace-nowrap">Beban (MW)</th>
                  <th className="py-2 px-1.5 text-right whitespace-nowrap text-blue-700">PB Synthesis</th>
                  <th className="py-2 px-1.5 text-right whitespace-nowrap text-rose-700">Batas Atas (1.18x)</th>
                  <th className="py-2 px-1.5 text-right whitespace-nowrap text-amber-700">Mendekati Atas (-4)</th>
                  <th className="py-2 px-1.5 text-right whitespace-nowrap text-rose-700">Batas Bawah (0.82x)</th>
                  <th className="py-2 px-1.5 text-right whitespace-nowrap text-amber-700">Mendekati Bawah (+4)</th>
                  <th className="py-2 px-2.5 whitespace-nowrap text-center text-purple-950 font-black bg-purple-100/90 border-x border-purple-200 text-xs uppercase tracking-wider">
                    ★ PT007 (Testing)
                  </th>
                  <th className="py-2 px-2 whitespace-nowrap text-slate-800">Selisih Batas</th>
                  <th className="py-2 px-1.5 text-center whitespace-nowrap">Status Area</th>
                  <th className="py-2 px-1 text-center">Pilih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredRecords.map((r) => {
                  const isSelected = selectedRecordId === r.id;
                  const isExceedBawah = r.pt007 < r.lowerThreshold;
                  const deltaBawahStr = isExceedBawah
                    ? `-${(r.lowerThreshold - r.pt007).toFixed(2)} PSIA`
                    : `${(r.pt007 - r.lowerThreshold).toFixed(2)} PSIA`;

                  const isExceedAtas = r.pt007 > r.upperThreshold;
                  const deltaAtasStr = isExceedAtas
                    ? `+${(r.pt007 - r.upperThreshold).toFixed(2)} PSIA`
                    : `${(r.upperThreshold - r.pt007).toFixed(2)} PSIA`;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRecordId(r.id)}
                      className={`hover:bg-violet-50/60 transition-colors cursor-pointer ${
                        isSelected ? 'bg-violet-100/70 font-bold' : ''
                      }`}
                    >
                      {/* Waktu & Tanggal */}
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span className="font-bold text-slate-900 font-sans">{r.date}</span>
                        <span className="ml-1 font-mono text-violet-700 font-bold bg-violet-100 px-1 py-0.2 rounded text-[10px]">
                          {r.time || '19:00'}
                        </span>
                      </td>

                      {/* Beban */}
                      <td className="py-2 px-1.5 text-right font-bold text-slate-900 whitespace-nowrap">
                        {r.beban.toFixed(2)} <span className="text-[9px] text-slate-400 font-sans font-normal">MW</span>
                      </td>

                      {/* PB Synthesis */}
                      <td className="py-2 px-1.5 text-right font-bold text-blue-700 whitespace-nowrap">
                        {r.pbSynthesis.toFixed(2)}
                      </td>

                      {/* Batas Atas (1.18x) */}
                      <td className="py-2 px-1.5 text-right text-rose-700 whitespace-nowrap font-semibold">
                        {r.upperThreshold.toFixed(2)}
                      </td>

                      {/* Mendekati Batas Atas (+4.0 PSIA) */}
                      <td className="py-2 px-1.5 text-right text-amber-700 whitespace-nowrap">
                        {r.earlyUpper.toFixed(2)}
                      </td>

                      {/* Batas Bawah (0.82x) */}
                      <td className="py-2 px-1.5 text-right text-rose-700 whitespace-nowrap font-semibold">
                        {r.lowerThreshold.toFixed(2)}
                      </td>

                      {/* Mendekati Batas Bawah (-4.0 PSIA) */}
                      <td className="py-2 px-1.5 text-right text-amber-700 whitespace-nowrap">
                        {r.earlyLower.toFixed(2)}
                      </td>

                      {/* PT007 (Testing Data) - STANDOUT & BIGGER */}
                      <td className="py-2 px-2.5 text-center whitespace-nowrap bg-purple-50/90 border-x border-purple-200">
                        <span className="inline-block text-xs sm:text-sm font-black text-purple-950 font-mono px-2 py-0.5 rounded bg-white border-2 border-purple-300 shadow-2xs">
                          {r.pt007.toFixed(2)}
                        </span>
                        <span className="text-[8px] text-purple-700 block font-sans font-bold leading-none mt-0.5">PSIA</span>
                      </td>

                      {/* Selisih PT007 dengan Batas Atas / Bawah */}
                      <td className="py-2 px-2 whitespace-nowrap text-xs font-mono">
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] text-rose-600 font-sans font-medium">Batas Atas:</span>
                            <span className={`font-bold ${isExceedAtas ? 'text-amber-700 font-black' : 'text-slate-800'}`}>{deltaAtasStr}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] text-rose-600 font-sans font-medium">Batas Bawah:</span>
                            <span className={`font-bold ${isExceedBawah ? 'text-amber-700 font-black' : 'text-slate-800'}`}>{deltaBawahStr}</span>
                          </div>
                        </div>
                      </td>

                      {/* Zone Status */}
                      <td className="py-2 px-1.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black border shadow-2xs font-sans ${
                            r.zone === 'NORMAL'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : r.zone === 'EARLY_UPPER' || r.zone === 'EARLY_LOWER'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-rose-600 text-white border-rose-700 font-extrabold shadow-xs'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              r.zone === 'NORMAL'
                                ? 'bg-emerald-600'
                                : r.zone === 'EARLY_UPPER' || r.zone === 'EARLY_LOWER'
                                ? 'bg-amber-600'
                                : 'bg-white'
                            }`}
                          />
                          {r.zone === 'NORMAL'
                            ? 'NORMAL'
                            : r.zone === 'EARLY_LOWER'
                            ? 'MENDEKATI BAWAH'
                            : r.zone === 'EARLY_UPPER'
                            ? 'MENDEKATI ATAS'
                            : r.zone === 'MELEWATI_BATAS_ATAS'
                            ? 'ALARM ATAS'
                            : 'ALARM BAWAH'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-1 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecordId(r.id);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            isSelected
                              ? 'bg-violet-700 text-white'
                              : 'bg-slate-100 hover:bg-violet-100 text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Aktif' : 'Pilih'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reset Extra Upload Confirmation Modal */}
      {isResetConfirmOpen && (
        <div
          id="reset-extra-upload-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsResetConfirmOpen(false)}
        >
          <div
            id="reset-extra-upload-modal"
            className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-rose-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3.5 mb-3.5">
                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-full shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reset Data Unggahan Lokal?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Konfirmasi penghapusan data file yang diunggah</p>
                </div>
              </div>

              <div className="text-xs text-rose-800 bg-rose-50/80 p-3 rounded-lg border border-rose-200 mb-5 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong>{extraUploadedRecords.length} rekaman</strong> data yang diunggah secara langsung di halaman PB Synthesis? Tindakan ini tidak dapat dibatalkan.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal (Cancel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExtraUploadedRecords([]);
                    setIsResetConfirmOpen(false);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Reset Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
