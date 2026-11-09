import React, { useId, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Download,
  Upload,
  AlertCircle,
  Save,
  Trash2,
  Droplets,
  Check,
  Star,
  Compass,
  Sliders,
  FileSpreadsheet,
  RotateCcw,
  Eye,
  Activity,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import {
  BaselineConfig,
  OperationalInput,
  OperationalRecord,
  ThresholdConfig,
} from '../types';
import {
  calculatePressureRatio,
  aggregateRecordsByDailyAverage,
  evaluatePBSynthesis,
  parseNHSpeed,
  evaluatePBOperationPoint,
  DEFAULT_SPEEDRONIC_CURVE_POINTS,
  DEFAULT_PB_OPERATION_CURVE_POINTS,
} from '../utils/calculations';
import { validateRecordAnomalies, RecordAnomalyReport } from '../utils/anomalyValidation';
import { AnomalyWarningModal } from './AnomalyWarningModal';
import { exportOperationalRecordsExcel } from '../utils/export';

interface OperatorInputViewProps {
  onRecordSubmitted: (record: OperationalInput, setAsBaseline?: boolean) => Promise<{ success: boolean; message: string }>;
  baseline: BaselineConfig;
  thresholds: ThresholdConfig;
  records: OperationalRecord[];
  inputHistoryRecords?: OperationalRecord[];
  selectedRecordId?: string | null;
  onSelectRecordForDashboard?: (recordId: string) => void;
  selectedPbRecordId?: string | null;
  onSelectRecordForPbSynthesis?: (recordId: string) => void;
  onNavigate: (tab: 'dashboard' | 'input' | 'pbSynthesis') => void;
  onToggleWaterWash?: (recordId: string) => void;
  onClearAllWaterWash?: () => void;
  onDeleteRecord?: (recordId: string) => void;
  onClearAllData?: () => void;
  onSetBaselineRecord?: (record: OperationalRecord) => void;
  onOpenBaselineConfig?: () => void;
  onOpenImport?: () => void;
}

interface DeleteTargetInfo {
  id: string;
  date: string;
  time?: string;
  isDailyAverage?: boolean;
  count?: number;
  details?: string;
}

export const OperatorInputView: React.FC<OperatorInputViewProps> = ({
  onRecordSubmitted,
  baseline,
  thresholds,
  records,
  inputHistoryRecords,
  selectedRecordId,
  onSelectRecordForDashboard,
  selectedPbRecordId,
  onSelectRecordForPbSynthesis,
  onNavigate,
  onToggleWaterWash,
  onClearAllWaterWash,
  onDeleteRecord,
  onClearAllData,
  onSetBaselineRecord,
  onOpenBaselineConfig,
  onOpenImport,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowTime);
  const [nhSpeed, setNhSpeed] = useState<string>('11670');
  const [T1_7, setT1_7] = useState<string>('85.5');
  const [P1_7, setP1_7] = useState<string>('');
  const [P3_0, setP3_0] = useState<string>('');
  const [realPower, setRealPower] = useState<string>('');
  const [nphr, setNphr] = useState<string>('');
  const [isWaterWashEvent, setIsWaterWashEvent] = useState<boolean>(false);
  const [setAsBaseline, setSetAsBaseline] = useState<boolean>(!baseline.isConfigured);
  const [notes, setNotes] = useState<string>('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAnomalyModal, setShowAnomalyModal] = useState<boolean>(false);
  const [pendingAnomalyReport, setPendingAnomalyReport] = useState<RecordAnomalyReport | null>(null);
  const [showRefTable, setShowRefTable] = useState<boolean>(false);

  // Download official Excel operational template
  const handleDownloadExcelTemplate = () => {
    const templateRows = [
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-23',
        'Waktu (HH:MM)': '19:00',
        'NH Speed (RPM)': 11670,
        'T1.7 (°F)': 85.5,
        'P1.7 / PT006 (PSIA)': 14.60,
        'P3.0 / PT007 (PSIA)': 265.79,
        'Real Power (MW)': 21.60,
        'NPHR (kcal/kWh)': 2435,
      },
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-22',
        'Waktu (HH:MM)': '19:00',
        'NH Speed (RPM)': 11399,
        'T1.7 (°F)': 84.8,
        'P1.7 / PT006 (PSIA)': 14.64,
        'P3.0 / PT007 (PSIA)': 265.00,
        'Real Power (MW)': 18.90,
        'NPHR (kcal/kWh)': 2450,
      },
      {
        'Tanggal (YYYY-MM-DD)': '2026-10-21',
        'Waktu (HH:MM)': '19:00',
        'NH Speed (RPM)': 10645,
        'T1.7 (°F)': 86.0,
        'P1.7 / PT006 (PSIA)': 14.65,
        'P3.0 / PT007 (PSIA)': 210.00,
        'Real Power (MW)': 10.50,
        'NPHR (kcal/kWh)': 2510,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Operasional');
    XLSX.writeFile(wb, 'Template_Upload_Operasional.xlsx');
  };

  // History Section View Mode: 'water_washing' | 'pb_synthesis'
  const [historySection, setHistorySection] = useState<'water_washing' | 'pb_synthesis'>('water_washing');
  const [pbDateFilter, setPbDateFilter] = useState<string>('ALL');
  const [pbStartDateFilter, setPbStartDateFilter] = useState<string>('');
  const [pbEndDateFilter, setPbEndDateFilter] = useState<string>('');
  const [pbPageSize, setPbPageSize] = useState<number>(50);
  const [pbCurrentPage, setPbCurrentPage] = useState<number>(1);
  const [recordToDelete, setRecordToDelete] = useState<DeleteTargetInfo | null>(null);

  // Use the Input History table dataset directly (or aggregate from records if not provided)
  const displayedRecords = useMemo(() => {
    if (inputHistoryRecords && inputHistoryRecords.length > 0) {
      return inputHistoryRecords;
    }
    return aggregateRecordsByDailyAverage(records, baseline, thresholds);
  }, [inputHistoryRecords, records, baseline, thresholds]);

  // Raw individual un-averaged records for PB Synthesis history (each reading preserved with exact date and time)
  const rawPbRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return (b.time || '').localeCompare(a.time || '');
    });
  }, [records]);

  // Unique dates for PB Synthesis filter
  const availablePbDates = useMemo(() => {
    const dates = Array.from(new Set(records.map((r) => r.date))).sort().reverse();
    return dates;
  }, [records]);

  // Filtered PB Synthesis records based on selected date or date range
  const filteredPbRecords = useMemo(() => {
    return rawPbRecords.filter((r) => {
      if (pbDateFilter !== 'ALL' && r.date !== pbDateFilter) {
        return false;
      }
      if (pbStartDateFilter && r.date < pbStartDateFilter) {
        return false;
      }
      if (pbEndDateFilter && r.date > pbEndDateFilter) {
        return false;
      }
      return true;
    });
  }, [rawPbRecords, pbDateFilter, pbStartDateFilter, pbEndDateFilter]);

  // Paginated PB Synthesis records
  const paginatedPbRecords = useMemo(() => {
    if (pbPageSize === -1) return filteredPbRecords;
    const start = (pbCurrentPage - 1) * pbPageSize;
    return filteredPbRecords.slice(start, start + pbPageSize);
  }, [filteredPbRecords, pbCurrentPage, pbPageSize]);

  const totalPbPages = useMemo(() => {
    if (pbPageSize === -1 || filteredPbRecords.length === 0) return 1;
    return Math.ceil(filteredPbRecords.length / pbPageSize);
  }, [filteredPbRecords, pbPageSize]);


  // Export PB Synthesis history dataset to Excel
  const handleExportPbSynthesisExcel = () => {
    if (filteredPbRecords.length === 0) return;
    const rows = filteredPbRecords.map((r) => {
      const nh = r.nhSpeed || 11670;
      const t = r.T1_7 !== undefined && r.T1_7 !== null ? r.T1_7 : 85.5;
      const p1 = r.P1_7 || 14.65;
      const p3 = r.P3_0 || 265.79;
      const evalRes = evaluatePBOperationPoint(r.realPower, nh, t, p1, p3);

      return {
        'Tanggal (YYYY-MM-DD)': r.date,
        'Waktu (HH:MM)': r.time || '19:00',
        'Beban (MW)': r.realPower,
        'NH Speed (RPM)': nh,
        'T1.7 (°F)': t,
        'NH Speed Korr (RPM)': evalRes ? evalRes.nhSpeedCorrected : '',
        'P1.7 / PT006 (PSIA)': p1,
        'P3.0 / PT007 (PSIA)': p3,
        'f(NH) / Y': evalRes ? evalRes.fNH : '',
        'PB Synthesis (PSIA)': evalRes ? evalRes.pbSynthesis : '',
        'Batas Bawah 0.82x (PSIA)': evalRes ? evalRes.lowerThreshold : '',
        'Mendekati Batas Bawah (-4.0 PSIA)': evalRes ? evalRes.earlyLower : '',
        'Mendekati Batas Atas (+4.0 PSIA)': evalRes ? evalRes.earlyUpper : '',
        'Batas Atas 1.18x (PSIA)': evalRes ? evalRes.upperThreshold : '',
        'Status Evaluasi PT007': evalRes ? evalRes.statusLabel : 'NORMAL',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PB_Synthesis_History');
    XLSX.writeFile(wb, `PB_Synthesis_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Automatic calculation of PR = P3.0 / P1.7 (handles comma decimals e.g. 238,32)
  const calculatedPR = useMemo(() => {
    const p3 = parseFloat(P3_0.trim().replace(',', '.'));
    const p1 = parseFloat(P1_7.trim().replace(',', '.'));
    if (!isNaN(p3) && !isNaN(p1) && p1 > 0 && p3 > 0) {
      return calculatePressureRatio(p3, p1);
    }
    return null;
  }, [P3_0, P1_7]);

  // Real-time evaluation of PB Synthesis using NH Speed, T1.7, P1.7, P3.0, and Real Power
  const livePBOpEval = useMemo(() => {
    const b = parseFloat(realPower.trim().replace(',', '.'));
    const nh = parseNHSpeed(nhSpeed);
    const t = parseFloat(T1_7.trim().replace(',', '.'));
    const p1 = parseFloat(P1_7.trim().replace(',', '.'));
    const p3 = parseFloat(P3_0.trim().replace(',', '.'));
    if (isNaN(b) || b <= 0 || isNaN(nh) || nh <= 0 || isNaN(t) || isNaN(p1) || p1 <= 0 || isNaN(p3) || p3 <= 0) {
      return null;
    }
    return evaluatePBOperationPoint(b, nh, t, p1, p3);
  }, [realPower, nhSpeed, T1_7, P1_7, P3_0]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = 'Date is required';
    if (!time) errs.time = 'Time is required';

    const nh = parseNHSpeed(nhSpeed);
    if (isNaN(nh) || nh <= 0) {
      errs.nhSpeed = 'NH Speed harus berupa angka RPM positif (contoh: 11670)';
    }

    const t = parseFloat(T1_7.trim().replace(',', '.'));
    if (isNaN(t)) {
      errs.T1_7 = 'T1.7 harus berupa angka temperatur (°F)';
    }

    const p1 = parseFloat(P1_7.trim().replace(',', '.'));
    if (isNaN(p1) || p1 <= 0) {
      errs.P1_7 = 'P1.7 (PT006) harus berupa angka positif';
    }

    const p3 = parseFloat(P3_0.trim().replace(',', '.'));
    if (isNaN(p3) || p3 <= 0) {
      errs.P3_0 = 'P3.0 (PT007) harus berupa angka positif';
    }

    const pw = parseFloat(realPower.trim().replace(',', '.'));
    if (isNaN(pw) || pw <= 0) {
      errs.realPower = 'Real Power (Beban) harus berupa angka positif';
    }

    const hr = parseFloat(nphr.trim().replace(',', '.'));
    if (isNaN(hr) || hr <= 0) {
      errs.nphr = 'NPHR harus berupa angka positif';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isRecordActiveBaseline = (r: OperationalRecord) => {
    if (!baseline?.isConfigured) return false;
    if (
      baseline.sourceRecordId &&
      (baseline.sourceRecordId === r.id || r.sourceRecordIds?.includes(baseline.sourceRecordId))
    ) {
      return true;
    }
    if (baseline.date === r.date) {
      if (r.isDailyMedian || r.isDailyAverage || baseline.time?.toLowerCase().includes('average') || baseline.time?.toLowerCase().includes('median')) return true;
      if (baseline.time && r.time && baseline.time === r.time) return true;
    }
    if (
      baseline.P3_0 !== null &&
      baseline.P3_0 !== undefined &&
      baseline.realPower !== null &&
      baseline.realPower !== undefined &&
      Math.abs(baseline.P3_0 - r.P3_0) < 0.01 &&
      Math.abs(baseline.realPower - r.realPower) < 0.01 &&
      Math.abs((baseline.nphr ?? 0) - r.nphr) < 0.1
    ) {
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Check for potential anomalies based on user operational rules:
    const anomalyReport = validateRecordAnomalies({
      P1_7,
      P3_0,
      realPower,
      nphr,
      date,
      time,
    });

    if (anomalyReport.hasAnomalies) {
      setPendingAnomalyReport(anomalyReport);
      setShowAnomalyModal(true);
      return;
    }

    await executeSubmitRecord();
  };

  const executeSubmitRecord = async () => {
    setIsSubmitting(true);
    setSubmitMessage(null);

    const parseNum = (val: string) => parseFloat(val.trim().replace(',', '.'));
    const parsedNHSpeed = parseNHSpeed(nhSpeed);
    const parsedT17 = parseNum(T1_7);
    const parsedP17 = parseNum(P1_7);
    const parsedP30 = parseNum(P3_0);
    const parsedPower = parseNum(realPower);
    const parsedNphr = parseNum(nphr);

    const inputData: OperationalInput = {
      date,
      time,
      nhSpeed: !isNaN(parsedNHSpeed) && parsedNHSpeed > 0 ? parsedNHSpeed : null,
      T1_7: !isNaN(parsedT17) ? parsedT17 : null,
      P1_7: parsedP17,
      P3_0: parsedP30,
      pt006: parsedP17,
      realPower: parsedPower,
      nphr: parsedNphr,
      pbSynthesis: livePBOpEval?.pbSynthesis ?? null,
      fNH: livePBOpEval?.fNH ?? null,
      isWaterWashEvent,
      notes: notes.trim() || undefined,
    };

    try {
      const res = await onRecordSubmitted(inputData, setAsBaseline);
      if (res.success) {
        setSubmitMessage({
          type: 'success',
          text: setAsBaseline
            ? 'Data operasional berhasil disimpan dan dikalibrasi sebagai Baseline Reference.'
            : 'Data operasional berhasil disimpan ke riwayat dan siap dimonitor di PB Synthesis.',
        });
        // Reset reading inputs
        setP1_7('');
        setP3_0('');
        setRealPower('');
        setNphr('');
        setNotes('');
        setIsWaterWashEvent(false);
        setSetAsBaseline(false);
        setErrors({});
        setPendingAnomalyReport(null);
      } else {
        setSubmitMessage({ type: 'error', text: res.message || 'Failed to save data.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed.';
      setSubmitMessage({ type: 'error', text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. TOP SECTION: MERGED OPERATOR INPUT FORM */}
      <section className="bg-white rounded-md border border-slate-200 p-6 shadow-xs">
        <div className="border-b border-slate-200 pb-3 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Input Data Operasional Turbin &amp; Kompresor</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Masukkan 8 parameter operasi terintegrasi (Tanggal, Waktu, NH Speed, T1.7, P1.7, P3.0, Real Power, NPHR) atau unggah berkas CSV / Excel.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadExcelTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
              title="Download format template Excel untuk upload data operasi"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel Template</span>
            </button>
            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold text-sky-900 bg-sky-50 border border-sky-300 rounded hover:bg-sky-100 transition-colors shadow-2xs cursor-pointer"
                title="Upload or paste raw operational exports with automatic column detection and standardization"
              >
                <Upload className="w-4 h-4 text-sky-700" />
                <span>Upload Data Excel/CSV</span>
              </button>
            )}
          </div>
        </div>

        {submitMessage && (
          <div
            className={`p-3.5 rounded-md mb-5 text-xs font-medium flex items-center justify-between ${
              submitMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border border-rose-300 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {submitMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{submitMessage.text}</span>
            </div>
            {submitMessage.type === 'success' && (
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
              >
                View Dashboard
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Group 1: Tanggal & Waktu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="input-date" className="block text-xs font-semibold text-slate-700 mb-1">
                Date (Tanggal Operasi)
              </label>
              <input
                id="input-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white"
              />
              {errors.date && <p className="text-[11px] text-rose-600 mt-1">{errors.date}</p>}
            </div>

            <div>
              <label htmlFor="input-time" className="block text-xs font-semibold text-slate-700 mb-1">
                Time (Waktu / Jam)
              </label>
              <input
                id="input-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white"
              />
              {errors.time && <p className="text-[11px] text-rose-600 mt-1">{errors.time}</p>}
            </div>
          </div>

          {/* Group 2: Kecepatan & Tekanan Turbin/Kompresor (NH Speed, T1.7, P1.7, P3.0) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {/* NH Speed */}
            <div>
              <label htmlFor="input-nh-speed" className="block text-xs font-semibold text-violet-900 mb-1">
                NH Speed (RPM)
              </label>
              <input
                id="input-nh-speed"
                type="text"
                value={nhSpeed}
                onChange={(e) => setNhSpeed(e.target.value)}
                placeholder="e.g. 11670"
                required
                className="w-full px-3 py-2 text-xs border border-violet-300 rounded focus:ring-1 focus:ring-violet-500 focus:border-violet-500 bg-violet-50/20 font-mono font-bold text-violet-950"
              />
              {errors.nhSpeed ? (
                <p className="text-[11px] text-rose-600 mt-1">{errors.nhSpeed}</p>
              ) : (
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  {livePBOpEval ? `Koreksi: ${livePBOpEval.nhSpeedCorrected} RPM` : 'Standar: ~11,000–12,000 RPM'}
                </span>
              )}
            </div>

            {/* T1.7 Inlet Temperature */}
            <div>
              <label htmlFor="input-t17" className="block text-xs font-semibold text-rose-900 mb-1">
                T1.7 (°F)
              </label>
              <input
                id="input-t17"
                type="number"
                step="0.1"
                value={T1_7}
                onChange={(e) => setT1_7(e.target.value)}
                placeholder="e.g. 85.5"
                required
                className="w-full px-3 py-2 text-xs border border-rose-300 rounded focus:ring-1 focus:ring-rose-500 focus:border-rose-500 bg-rose-50/20 font-mono font-bold text-slate-900"
              />
              {errors.T1_7 ? (
                <p className="text-[11px] text-rose-600 mt-1">{errors.T1_7}</p>
              ) : (
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  {livePBOpEval ? `θ=${livePBOpEval.theta} (√θ=${livePBOpEval.sqrtTheta})` : 'Compressor Inlet Temp'}
                </span>
              )}
            </div>

            {/* P1.7 (PT006) */}
            <div>
              <label htmlFor="input-p17" className="block text-xs font-semibold text-slate-700 mb-1">
                P1.7 / PT006 (PSIA)
              </label>
              <input
                id="input-p17"
                type="number"
                step="0.01"
                value={P1_7}
                onChange={(e) => setP1_7(e.target.value)}
                placeholder="e.g. 14.65"
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white font-mono"
              />
              {errors.P1_7 ? (
                <p className="text-[11px] text-rose-600 mt-1">{errors.P1_7}</p>
              ) : (
                <span className="text-[10px] text-slate-500 mt-0.5 block">Compressor Inlet Pressure</span>
              )}
            </div>

            {/* P3.0 (PT007) */}
            <div>
              <label htmlFor="input-p30" className="block text-xs font-semibold text-purple-900 mb-1">
                P3.0 / PT007 (PSIA)
              </label>
              <input
                id="input-p30"
                type="number"
                step="0.1"
                value={P3_0}
                onChange={(e) => setP3_0(e.target.value)}
                placeholder="e.g. 265.79"
                required
                className="w-full px-3 py-2 text-xs border-2 border-purple-400 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-purple-50/30 font-mono font-black text-purple-950"
              />
              {errors.P3_0 ? (
                <p className="text-[11px] text-rose-600 mt-1">{errors.P3_0}</p>
              ) : (
                <span className="text-[10px] text-purple-700 mt-0.5 block font-semibold">Compressor Discharge Pressure</span>
              )}
            </div>
          </div>

          {/* Group 3: Output & Performance (Real Power, NPHR) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label htmlFor="input-power" className="block text-xs font-semibold text-slate-700 mb-1">
                Real Power / Beban (MW)
              </label>
              <input
                id="input-power"
                type="number"
                step="0.1"
                value={realPower}
                onChange={(e) => setRealPower(e.target.value)}
                placeholder="e.g. 21.60"
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white font-mono"
              />
              {errors.realPower && <p className="text-[11px] text-rose-600 mt-1">{errors.realPower}</p>}
            </div>

            <div>
              <label htmlFor="input-nphr" className="block text-xs font-semibold text-slate-700 mb-1">
                NPHR (kcal/kWh)
              </label>
              <input
                id="input-nphr"
                type="number"
                step="1"
                value={nphr}
                onChange={(e) => setNphr(e.target.value)}
                placeholder="e.g. 2435"
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white font-mono"
              />
              {errors.nphr && <p className="text-[11px] text-rose-600 mt-1">{errors.nphr}</p>}
            </div>
          </div>

          {/* Live Dynamic Computation Banner (PR & PB Synthesis Evaluation) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-xs">
              <span className="text-slate-600">
                Calculated Pressure Ratio (PR = P3.0 / P1.7):
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {calculatedPR !== null ? calculatedPR.toFixed(4) : '— (Auto-calculated)'}
              </span>
            </div>

            <div className="p-3 bg-violet-50/70 border border-violet-200 rounded flex flex-col justify-between text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-violet-900 font-semibold">
                  Kalkulasi PB Synthesis (Kurva f(NH) x P1.7):
                </span>
                <span className="font-mono font-bold text-violet-950 text-sm">
                  {livePBOpEval ? `${livePBOpEval.pbSynthesis} PSIA (Y=${livePBOpEval.fNH})` : '— (Auto-calculated)'}
                </span>
              </div>
              <div className="flex items-center justify-end pt-1 border-t border-violet-200/60">
                <button
                  type="button"
                  onClick={() => setShowRefTable((v) => !v)}
                  className="text-[11px] text-violet-700 hover:text-violet-950 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Sliders className="w-3 h-3 text-violet-600" />
                  <span>{showRefTable ? 'Sembunyikan Tabel Referensi' : 'Tabel Referensi f(NH)'}</span>
                  {showRefTable ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>

          {/* Hidden Information: Tabel Referensi */}
          {showRefTable && (
            <div className="p-3.5 bg-violet-50/50 border border-violet-200 rounded-lg space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-violet-200/70 pb-2">
                <span className="text-xs font-bold text-violet-950 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-violet-600" />
                  <span>Tabel Referensi Speedronic f(NH) &amp; Kurva Operasi (Beban 1 &ndash; 23 MW)</span>
                </span>
                <span className="text-[10px] bg-violet-100 text-violet-800 font-bold px-2 py-0.5 rounded">
                  Informasi Tersembunyi
                </span>
              </div>

              {/* 8 Titik Speedronic */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1">
                  8 Titik Referensi Speedronic f(NH) Resmi:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {DEFAULT_SPEEDRONIC_CURVE_POINTS.map((pt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNhSpeed(String(pt.x))}
                      className="p-1.5 bg-white rounded border border-violet-200 text-center hover:bg-violet-100 transition-colors cursor-pointer"
                      title="Klik untuk mengisi NH Speed"
                    >
                      <span className="text-[10px] text-slate-400 block font-mono">No. {idx + 1}</span>
                      <span className="text-[11px] font-bold text-violet-950 block font-mono">{(pt.x / 1000).toFixed(3)}</span>
                      <span className="text-[10px] text-violet-700 font-semibold block font-mono">Y = {pt.y}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 23 Titik Kurva PB Synthesis */}
              <div className="overflow-x-auto max-h-48 overflow-y-auto bg-white rounded border border-violet-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 text-[11px]">
                    <tr>
                      <th className="py-1.5 px-2.5">Beban (MW)</th>
                      <th className="py-1.5 px-2.5">NH Speed</th>
                      <th className="py-1.5 px-2.5">Y (f(NH))</th>
                      <th className="py-1.5 px-2.5">PT006</th>
                      <th className="py-1.5 px-2.5 text-blue-700 font-bold">PB Synthesis</th>
                      <th className="py-1.5 px-2.5 text-rose-700">Bawah (0.82x)</th>
                      <th className="py-1.5 px-2.5 text-amber-700">Mendekati Batas Bawah (-4.0 PSIA)</th>
                      <th className="py-1.5 px-2.5 text-amber-700">Mendekati Batas Atas (+4.0 PSIA)</th>
                      <th className="py-1.5 px-2.5 text-rose-700">Atas (1.18x)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                    {DEFAULT_PB_OPERATION_CURVE_POINTS.map((pt, i) => (
                      <tr key={i} className="hover:bg-violet-50/40">
                        <td className="py-1 px-2.5 font-bold text-slate-900">{pt.beban.toFixed(2)}</td>
                        <td className="py-1 px-2.5 text-violet-700">{(pt.nhSpeed / 1000).toFixed(3)}</td>
                        <td className="py-1 px-2.5 font-bold">{pt.yInterpolated.toFixed(2)}</td>
                        <td className="py-1 px-2.5 text-slate-600">{pt.pt006.toFixed(2)}</td>
                        <td className="py-1 px-2.5 font-bold text-blue-700 bg-blue-50/50">{pt.pbSynthesis.toFixed(2)}</td>
                        <td className="py-1 px-2.5 text-rose-700">{pt.lowerThreshold.toFixed(2)}</td>
                        <td className="py-1 px-2.5 text-amber-700">{pt.earlyLower.toFixed(2)}</td>
                        <td className="py-1 px-2.5 text-amber-700">{pt.earlyUpper.toFixed(2)}</td>
                        <td className="py-1 px-2.5 text-rose-700">{pt.upperThreshold.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Optional Water Wash tag */}
          <div className="pt-2 space-y-2.5 border-t border-slate-100">
            {/* Water Wash Event Checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="input-is-ww"
                type="checkbox"
                checked={isWaterWashEvent}
                onChange={(e) => setIsWaterWashEvent(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <label htmlFor="input-is-ww" className="text-xs font-medium text-slate-700 cursor-pointer">
                Water Wash performed on this date
              </label>
            </div>

            {/* Baseline Reference Checkbox */}
            <div className="flex items-start gap-2">
              <input
                id="input-is-baseline"
                type="checkbox"
                checked={setAsBaseline}
                onChange={(e) => setSetAsBaseline(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 mt-0.5"
              />
              <div>
                <label htmlFor="input-is-baseline" className="text-xs font-semibold text-slate-800 cursor-pointer">
                  Set this data as Baseline Reference
                </label>
                <p className="text-[11px] text-slate-500">
                  {baseline.isConfigured
                    ? 'Check if this reading represents a newly calibrated clean condition post-wash or overhaul.'
                    : 'Recommended for your first real reading: Future readings will calculate deterioration % against this baseline.'}
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex justify-end">
            <button
              id="btn-submit-data"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Recording...' : 'Submit'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* 2. DIRECTLY BELOW: INPUT HISTORY (DIVIDED INTO WATER WASHING & PB SYNTHESIS SECTIONS) */}
      <section className="bg-white rounded-md border border-slate-200 shadow-xs overflow-hidden space-y-0">
        {/* Top Header & Tab Switcher */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {historySection === 'water_washing'
                  ? 'Input History — Water Washing'
                  : 'Input History — PB Synthesis'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {historySection === 'water_washing'
                ? 'Chronological log of verified operational readings. Active baseline is highlighted below.'
                : 'Chronological log of verified operational readings (un-averaged) for f(NH) and PT007 evaluation.'}
            </p>
          </div>

          {/* Section Selection Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setHistorySection('water_washing')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                historySection === 'water_washing'
                  ? 'bg-white text-sky-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Droplets className="w-3.5 h-3.5 text-sky-600" />
              <span>Water Washing</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                historySection === 'water_washing' ? 'bg-sky-100 text-sky-800' : 'bg-slate-200/70 text-slate-700'
              }`}>
                {displayedRecords.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setHistorySection('pb_synthesis')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                historySection === 'pb_synthesis'
                  ? 'bg-white text-violet-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-violet-600" />
              <span>PB Synthesis</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                historySection === 'pb_synthesis' ? 'bg-violet-100 text-violet-800' : 'bg-slate-200/70 text-slate-700'
              }`}>
                {rawPbRecords.length}
              </span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: WATER WASHING HISTORY (STRICTLY MATCHING USER SCREENSHOT 12.42.12) */}
        {/* ========================================================================= */}
        {historySection === 'water_washing' && (
          <div className="border-b border-slate-200 last:border-b-0">
            {/* Header & Action Toolbar */}
            <div className="px-6 py-3.5 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>Water Washing History</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                    Daily Average Log (19:00 - 21:00 / Beban 20 - 24 MW)
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Chronological log of verified operational readings. Rata-rata harian dihitung dari data jam 19:00 - 21:00, atau data dengan beban 20 - 24 MW jika data jam 19:00-21:00 tidak ditemukan.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {onOpenBaselineConfig && (
                  <button
                    type="button"
                    onClick={onOpenBaselineConfig}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                    title="Configure or calibrate baseline values"
                  >
                    <Sliders className="w-3.5 h-3.5 text-slate-500" />
                    <span>Baseline Settings</span>
                  </button>
                )}
                {onClearAllWaterWash && displayedRecords.some((r) => r.isWaterWashEvent) && (
                  <button
                    type="button"
                    onClick={onClearAllWaterWash}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50/50 border border-rose-200 rounded hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer"
                    title="Reset all WW Event tags to '+ Tag WW'"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                    <span>Reset WW Tags</span>
                  </button>
                )}
                <button
                  id="btn-download-history-excel"
                  type="button"
                  onClick={() => exportOperationalRecordsExcel(displayedRecords)}
                  disabled={displayedRecords.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-300 rounded hover:bg-emerald-100 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                  title="Download operational dataset as Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Excel</span>
                </button>

                {onClearAllData && records.length > 0 && (
                  <button
                    id="btn-delete-all-input-data-ww"
                    type="button"
                    onClick={onClearAllData}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded transition-colors shadow-2xs cursor-pointer"
                    title="Hapus seluruh data operasional (dengan konfirmasi pop up)"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Hapus Semua Data</span>
                  </button>
                )}
              </div>
            </div>

            {displayedRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada data operasional harian. Tambahkan pembacaan data di form atas atau impor file.
              </div>
            ) : (
              <div>
                {/* Clean status bar - tip removed */}
                <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">
                      Total Data Harian: {displayedRecords.length} Hari Terverifikasi
                    </span>
                  </div>
                  {selectedRecordId && (
                    <span className="text-[11px] font-semibold text-sky-800 bg-white px-2.5 py-0.5 rounded border border-sky-200 shadow-2xs self-start sm:self-auto shrink-0">
                      Active in Dashboard: {displayedRecords.find(d => d.id === selectedRecordId)?.date || selectedRecordId}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    {/* Exact 11 Headers from Screenshot 12.42.12 */}
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-4 whitespace-nowrap">Date</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Dashboard Movement</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">P1.7 (PSIA)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">P3.0 (PSIA)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">PR</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Real Power (MW)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">NPHR (kcal/kWh)</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">Perf. Index</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">Baseline Reference</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">WW Status</th>
                        {onDeleteRecord && <th className="py-2.5 px-3 text-center whitespace-nowrap">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {[...displayedRecords].reverse().map((r) => {
                        const isActive = isRecordActiveBaseline(r);
                        const isSelected = selectedRecordId === r.id;

                        return (
                          <tr
                            key={r.id}
                            onClick={() => onSelectRecordForDashboard && onSelectRecordForDashboard(r.id)}
                            className={`hover:bg-sky-50/50 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-sky-100/60 ring-2 ring-inset ring-sky-400 font-medium'
                                : isActive
                                ? 'bg-emerald-50/40'
                                : r.isWaterWashEvent
                                ? 'bg-sky-50/30'
                                : ''
                            }`}
                            title="Click anywhere to inspect this record in the Dashboard"
                          >
                            {/* Date: e.g. 2026-11-02 (clean without subtext) */}
                            <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                              <span className={isSelected ? 'text-sky-900 font-bold' : ''}>{r.date}</span>
                            </td>

                            {/* Dashboard Movement: Inspect / Active */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectRecordForDashboard) {
                                    onSelectRecordForDashboard(r.id);
                                  } else {
                                    onNavigate('dashboard');
                                  }
                                }}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all shadow-2xs cursor-pointer ${
                                  isSelected
                                    ? 'bg-sky-600 text-white shadow-xs font-bold'
                                    : 'bg-white hover:bg-sky-50 text-sky-700 hover:text-sky-900 border border-slate-300 hover:border-sky-300'
                                }`}
                                title={`Inspect ${r.date} di Dashboard`}
                              >
                                <Eye className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-sky-500'}`} />
                                <span>{isSelected ? 'Active' : 'Inspect'}</span>
                              </button>
                            </td>

                            {/* P1.7 (PSIA) */}
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {r.P1_7.toFixed(2)}
                            </td>

                            {/* P3.0 (PSIA) */}
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {r.P3_0.toFixed(2)}
                            </td>

                            {/* PR in Bold */}
                            <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                              {r.pr.toFixed(4)}
                            </td>

                            {/* Real Power (MW) */}
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {r.realPower.toFixed(2)}
                            </td>

                            {/* NPHR (kcal/kWh) */}
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {r.nphr.toLocaleString()}
                            </td>

                            {/* Perf. Index: 80% (red), 0% (green), 20% (green) */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {r.performanceIndex !== null && r.performanceIndex !== undefined ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${
                                    r.performanceIndex >= 80
                                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                                      : r.performanceIndex >= 50
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  }`}
                                >
                                  {r.performanceIndex}%
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>

                            {/* Baseline Reference: Set as Baseline or ACTIVE BASELINE badge */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {isActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-emerald-600 text-white shadow-2xs">
                                  <Star className="w-3 h-3 fill-white" />
                                  <span>ACTIVE BASELINE</span>
                                </span>
                              ) : onSetBaselineRecord ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSetBaselineRecord(r);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors shadow-2xs cursor-pointer"
                                  title="Set as baseline"
                                >
                                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Set as Baseline</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>

                            {/* WW Status: + Tag WW or WW EVENT badge */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {onToggleWaterWash ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleWaterWash(r.id);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors shadow-2xs cursor-pointer ${
                                    r.isWaterWashEvent
                                      ? 'bg-sky-600 text-white hover:bg-sky-700'
                                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
                                  }`}
                                  title="Click to toggle Water Wash event status"
                                >
                                  {r.isWaterWashEvent ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                      <span>WW EVENT</span>
                                    </>
                                  ) : (
                                    <span>+ Tag WW</span>
                                  )}
                                </button>
                              ) : (
                                r.isWaterWashEvent && (
                                  <span className="px-2 py-0.5 text-xs font-bold bg-sky-100 text-sky-800 rounded">
                                    WW
                                  </span>
                                )
                              )}
                            </td>

                            {/* Action: Trash Icon */}
                            {onDeleteRecord && (
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRecordToDelete({
                                      id: r.id,
                                      date: r.date,
                                      time: r.time,
                                      isDailyAverage: true,
                                      count: r.hourlyObservationsCount,
                                      details: `Beban: ${r.realPower.toFixed(2)} MW | P3.0: ${r.P3_0.toFixed(2)} PSIA | PR: ${r.PR?.toFixed(4) || '-'}`,
                                    });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Hapus data harian ini (dengan konfirmasi)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: PB SYNTHESIS HISTORY (UN-AVERAGED INDIVIDUAL ENTRIES, MATCHING UI) */}
        {/* ========================================================================= */}
        {historySection === 'pb_synthesis' && (
          <div>
            {/* Header & Action Toolbar */}
            <div className="px-6 py-3.5 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>PB Synthesis History</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-900 border border-violet-200">
                    Individual Multi-Entry Log
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Chronological log of verified operational readings (un-averaged) for f(NH) and PT007 evaluation.
                </p>
              </div>

              {/* Export Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportPbSynthesisExcel}
                  disabled={filteredPbRecords.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-300 rounded hover:bg-emerald-100 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                  title="Download PB Synthesis dataset as Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Excel</span>
                </button>

                {onClearAllData && records.length > 0 && (
                  <button
                    id="btn-delete-all-input-data-pb"
                    type="button"
                    onClick={onClearAllData}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded transition-colors shadow-2xs cursor-pointer"
                    title="Hapus seluruh data operasional (dengan konfirmasi pop up)"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Hapus Semua Data</span>
                  </button>
                )}
              </div>
            </div>

            {filteredPbRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada data input untuk PB Synthesis. Silakan masukkan data di form atas atau impor file.
              </div>
            ) : (
              <div>
                {/* Date Filter Bar - Clean, functional date filter toolbar replacing the tip banner */}
                <div className="px-6 py-2.5 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-violet-600" />
                      <span>Filter Tanggal:</span>
                    </span>

                    {/* Single Date Select Dropdown */}
                    <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1 shadow-2xs">
                      <select
                        value={pbDateFilter}
                        onChange={(e) => {
                          setPbDateFilter(e.target.value);
                          setPbCurrentPage(1);
                        }}
                        className="text-xs font-semibold text-slate-700 bg-transparent border-0 focus:outline-none cursor-pointer"
                      >
                        <option value="ALL">Semua Tanggal ({rawPbRecords.length} data)</option>
                        {availablePbDates.map((d) => (
                          <option key={d} value={d}>
                            {d} ({rawPbRecords.filter((r) => r.date === d).length} entri)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Range Inputs (From - To) */}
                    <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                      <span className="text-[11px] text-slate-400">Rentang:</span>
                      <input
                        type="date"
                        value={pbStartDateFilter}
                        onChange={(e) => {
                          setPbStartDateFilter(e.target.value);
                          setPbCurrentPage(1);
                        }}
                        className="px-2 py-0.5 text-xs border border-slate-300 rounded bg-white font-mono shadow-2xs"
                        title="Dari Tanggal"
                      />
                      <span className="text-slate-400">s/d</span>
                      <input
                        type="date"
                        value={pbEndDateFilter}
                        onChange={(e) => {
                          setPbEndDateFilter(e.target.value);
                          setPbCurrentPage(1);
                        }}
                        className="px-2 py-0.5 text-xs border border-slate-300 rounded bg-white font-mono shadow-2xs"
                        title="Sampai Tanggal"
                      />
                    </div>

                    {(pbDateFilter !== 'ALL' || pbStartDateFilter || pbEndDateFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPbDateFilter('ALL');
                          setPbStartDateFilter('');
                          setPbEndDateFilter('');
                          setPbCurrentPage(1);
                        }}
                        className="px-2 py-0.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded shadow-2xs cursor-pointer transition-colors"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                    {selectedPbRecordId && (
                      <span className="text-[11px] font-semibold text-violet-800 bg-violet-100/70 px-2.5 py-0.5 rounded border border-violet-200 shadow-2xs">
                        Aktif di PB Synthesis: {rawPbRecords.find((d) => d.id === selectedPbRecordId)?.date || selectedPbRecordId}
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-slate-800 bg-white px-2.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                      Total: {filteredPbRecords.length} Data Entri
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">PB Movement</th>
                        <th className="py-2.5 px-2.5 whitespace-nowrap">Time</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">P1.7 (PSIA)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">P3.0 / PT007 (PSIA)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">PR</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Real Power (MW)</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">NH Speed (RPM)</th>
                        <th className="py-2.5 px-2.5 whitespace-nowrap">T1.7 (°F)</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">f(NH) / Y</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">PB Syn (NH)</th>
                        <th className="py-2.5 px-3 text-center whitespace-nowrap">PT007 Status</th>
                        {onDeleteRecord && <th className="py-2.5 px-3 text-center whitespace-nowrap">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedPbRecords.map((r, idx) => {
                        const nh = r.nhSpeed || 11670;
                        const t17 = r.T1_7 !== undefined && r.T1_7 !== null ? r.T1_7 : 85.5;
                        const pt006 = r.P1_7 || 14.65;
                        const pt007 = r.P3_0 || 265.79;
                        const evalRes = evaluatePBOperationPoint(r.realPower, nh, t17, pt006, pt007);
                        const isSelected = selectedPbRecordId === r.id;

                        return (
                          <tr
                            key={r.id || idx}
                            onClick={() => {
                              if (onSelectRecordForPbSynthesis) {
                                onSelectRecordForPbSynthesis(r.id);
                              } else {
                                onNavigate('pbSynthesis');
                              }
                            }}
                            className={`hover:bg-violet-50/50 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-violet-100/70 ring-2 ring-inset ring-violet-400 font-medium'
                                : ''
                            }`}
                            title="Click anywhere to inspect this record in PB Synthesis"
                          >
                            {/* Date */}
                            <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-900">
                              <span className={isSelected ? 'text-violet-900 font-bold' : ''}>{r.date}</span>
                            </td>

                            {/* PB Movement */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectRecordForPbSynthesis) {
                                    onSelectRecordForPbSynthesis(r.id);
                                  } else {
                                    onNavigate('pbSynthesis');
                                  }
                                }}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all shadow-2xs cursor-pointer ${
                                  isSelected
                                    ? 'bg-violet-600 text-white shadow-xs font-bold'
                                    : 'bg-white hover:bg-violet-50 text-violet-700 hover:text-violet-900 border border-slate-300 hover:border-violet-300'
                                }`}
                                title={`Inspect ${r.date} ${r.time || ''} di PB Synthesis`}
                              >
                                <Eye className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-violet-500'}`} />
                                <span>{isSelected ? 'Active' : 'Inspect'}</span>
                              </button>
                            </td>

                            {/* Time */}
                            <td className="py-2.5 px-2.5 whitespace-nowrap font-mono text-slate-600">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                                {r.time || '19:00'}
                              </span>
                            </td>

                            {/* P1.7 */}
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {pt006.toFixed(2)}
                            </td>

                            {/* P3.0 / PT007 */}
                            <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                              {pt007.toFixed(2)}
                            </td>

                            {/* PR */}
                            <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                              {r.pr.toFixed(4)}
                            </td>

                            {/* Real Power */}
                            <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                              {r.realPower.toFixed(2)}
                            </td>

                            {/* NH Speed */}
                            <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                              {nh.toLocaleString()}
                            </td>

                            {/* T1.7 */}
                            <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                              {t17.toFixed(1)}°F
                            </td>

                            {/* f(NH) / Y */}
                            <td className="py-2.5 px-3 font-mono text-center text-slate-700 whitespace-nowrap">
                              {evalRes ? evalRes.fNH.toFixed(2) : '—'}
                            </td>

                            {/* PB Syn (NH) */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {evalRes ? (
                                <span className="font-bold text-slate-900">
                                  {evalRes.pbSynthesis} PSIA
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* PT007 Status: NORMAL (green), EARLY (amber), OVER (rose) */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {evalRes ? (
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border ${
                                    evalRes.zone === 'NORMAL'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : evalRes.zone === 'EARLY_UPPER' || evalRes.zone === 'EARLY_LOWER'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-rose-600 text-white border-rose-700 shadow-2xs font-extrabold'
                                  }`}
                                  title={evalRes.statusDescription}
                                >
                                  {evalRes.zone === 'NORMAL'
                                    ? 'NORMAL'
                                    : evalRes.zone === 'EARLY_UPPER' || evalRes.zone === 'EARLY_LOWER'
                                    ? 'CAUTION'
                                    : evalRes.zone === 'MELEWATI_BATAS_ATAS'
                                    ? 'BATAS ATAS (ALARM)'
                                    : 'BATAS BAWAH (ALARM)'}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* Action: Trash Icon */}
                            {onDeleteRecord && (
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRecordToDelete({
                                      id: r.id,
                                      date: r.date,
                                      time: r.time,
                                      isDailyAverage: false,
                                      details: `Beban: ${r.realPower.toFixed(2)} MW | PT006: ${r.P1_7.toFixed(2)} PSIA | PT007: ${r.P3_0.toFixed(2)} PSIA`,
                                    });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Hapus data pembacaan ini (dengan konfirmasi)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>
                      Menampilkan{' '}
                      <strong>
                        {pbPageSize === -1
                          ? filteredPbRecords.length
                          : Math.min((pbCurrentPage - 1) * pbPageSize + 1, filteredPbRecords.length)}
                        -
                        {pbPageSize === -1
                          ? filteredPbRecords.length
                          : Math.min(pbCurrentPage * pbPageSize, filteredPbRecords.length)}
                      </strong>{' '}
                      dari <strong>{filteredPbRecords.length}</strong> entri
                    </span>
                    <select
                      value={pbPageSize}
                      onChange={(e) => {
                        setPbPageSize(Number(e.target.value));
                        setPbCurrentPage(1);
                      }}
                      className="text-xs bg-white border border-slate-300 rounded px-2 py-0.5 cursor-pointer ml-2"
                    >
                      <option value={25}>25 per halaman</option>
                      <option value={50}>50 per halaman</option>
                      <option value={100}>100 per halaman</option>
                      <option value={-1}>Tampilkan Semua</option>
                    </select>
                  </div>

                  {pbPageSize !== -1 && totalPbPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pbCurrentPage === 1}
                        onClick={() => setPbCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="px-2 text-xs font-semibold text-slate-700">
                        {pbCurrentPage} / {totalPbPages}
                      </span>
                      <button
                        type="button"
                        disabled={pbCurrentPage === totalPbPages}
                        onClick={() => setPbCurrentPage((p) => Math.min(totalPbPages, p + 1))}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Anomaly Confirmation Modal */}
      <AnomalyWarningModal
        isOpen={showAnomalyModal}
        onClose={() => setShowAnomalyModal(false)}
        onConfirmSubmitAnyway={() => {
          setShowAnomalyModal(false);
          executeSubmitRecord();
        }}
        reports={pendingAnomalyReport ? [pendingAnomalyReport] : []}
        mode="single"
        title="Peringatan: Data Berpotensi Tidak Valid / Anomali"
        submitAnywayLabel="Tetap Simpan"
      />

      {/* Single Record Delete Confirmation Modal */}
      {recordToDelete && (
        <div
          id="single-record-delete-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setRecordToDelete(null)}
        >
          <div
            id="single-record-delete-modal"
            className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-rose-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3.5 mb-3.5">
                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-full shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {recordToDelete.isDailyAverage
                      ? 'Hapus Data Rata-Rata Harian?'
                      : 'Hapus Rekaman Data Operasional?'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Konfirmasi penghapusan data operasional
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 mb-4 text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-semibold">Tanggal:</span>
                  <span className="font-mono font-bold text-slate-900">{recordToDelete.date}</span>
                </div>
                {recordToDelete.time && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">Waktu / Jam:</span>
                    <span className="font-mono font-bold text-slate-900">{recordToDelete.time}</span>
                  </div>
                )}
                {recordToDelete.count && recordToDelete.count > 1 && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold">Jumlah Data:</span>
                    <span className="font-mono font-bold text-slate-900">{recordToDelete.count} pembacaan</span>
                  </div>
                )}
                {recordToDelete.details && (
                  <div className="pt-2 border-t border-slate-200 text-slate-600 font-mono text-[11px]">
                    {recordToDelete.details}
                  </div>
                )}
              </div>

              <div className="text-xs text-rose-800 bg-rose-50/80 p-3 rounded-lg border border-rose-200 mb-5 leading-relaxed">
                {recordToDelete.isDailyAverage
                  ? `Apakah Anda yakin ingin menghapus seluruh pembacaan data untuk tanggal ${recordToDelete.date}? Seluruh data pada tanggal ini akan dihapus secara permanen.`
                  : `Apakah Anda yakin ingin menghapus data pembacaan tanggal ${recordToDelete.date} pukul ${recordToDelete.time || '-'}? Data ini akan dihapus dari riwayat operasional.`}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRecordToDelete(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal (Cancel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteRecord) {
                      onDeleteRecord(recordToDelete.id);
                    }
                    setRecordToDelete(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Hapus Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
