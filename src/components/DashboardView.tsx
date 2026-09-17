import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  Compass,
  Check,
  Sliders,
  History,
  RotateCcw,
  Gauge,
} from 'lucide-react';
import {
  BaselineConfig,
  OperationalRecord,
  OverallForecastSummary,
  ThresholdConfig,
  WaterWashEvent,
} from '../types';
import {
  INDICATOR_WEIGHTS,
  WATER_WASH_DECISION_RULES,
} from '../data/initialData';
import { WaterWashDetailModal } from './WaterWashDetailModal';
import { ForecastWidget } from './ForecastWidget';

interface DashboardViewProps {
  latestRecord?: OperationalRecord;
  baseline: BaselineConfig;
  thresholds: ThresholdConfig;
  events: WaterWashEvent[];
  recordsCount: number;
  forecastSummary: OverallForecastSummary;
  inputHistoryRecords?: OperationalRecord[];
  selectedRecordId?: string | null;
  onSelectRecord?: (recordId: string | null) => void;
  onNavigate: (tab: 'dashboard' | 'input') => void;
  onOpenImport?: () => void;
  onOpenBaselineConfig?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  latestRecord,
  baseline,
  thresholds,
  events,
  recordsCount,
  forecastSummary,
  inputHistoryRecords,
  selectedRecordId,
  onSelectRecord,
  onNavigate,
  onOpenImport,
  onOpenBaselineConfig,
}) => {
  const [selectedEvent, setSelectedEvent] = useState<WaterWashEvent | null>(null);
  const [showRuleLogic, setShowRuleLogic] = useState<boolean>(false);

  // Sort inputHistoryRecords chronologically for movement stepping
  const historyList = useMemo(() => {
    if (!inputHistoryRecords || inputHistoryRecords.length === 0) return [];
    return [...inputHistoryRecords].sort((a, b) => a.timestamp - b.timestamp || a.date.localeCompare(b.date));
  }, [inputHistoryRecords]);

  // Latest verified record by chronology
  const latestChronologicalRecord = useMemo(() => {
    if (historyList.length > 0) {
      return historyList[historyList.length - 1];
    }
    return latestRecord;
  }, [historyList, latestRecord]);

  // Determine active displayed record (historical snapshot or latest)
  const displayRecord = useMemo(() => {
    if (selectedRecordId && historyList.length > 0) {
      const match = historyList.find((r) => r.id === selectedRecordId || r.date === selectedRecordId);
      if (match) return match;
    }
    return latestChronologicalRecord || latestRecord;
  }, [selectedRecordId, historyList, latestChronologicalRecord, latestRecord]);

  const activeRecord = displayRecord || latestRecord;

  const isHistorical = Boolean(
    activeRecord &&
    latestChronologicalRecord &&
    (activeRecord.id !== latestChronologicalRecord.id || activeRecord.date !== latestChronologicalRecord.date)
  );

  // Current index in chronological history for prev/next movement buttons
  const currentIndex = useMemo(() => {
    if (!activeRecord || historyList.length === 0) return -1;
    return historyList.findIndex((r) => r.id === activeRecord.id || r.date === activeRecord.date);
  }, [activeRecord, historyList]);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < historyList.length - 1;

  const handlePrevRecord = () => {
    if (hasPrevious && onSelectRecord) {
      onSelectRecord(historyList[currentIndex - 1].id);
    }
  };

  const handleNextRecord = () => {
    if (hasNext && onSelectRecord) {
      onSelectRecord(historyList[currentIndex + 1].id);
    }
  };

  const hasData = Boolean(activeRecord);
  const hasBaseline = Boolean(baseline?.isConfigured);

  // Compute status label for each parameter
  const getParamStatus = (
    currentVal: number | null | undefined,
    det: number | null | undefined,
    thresh: number,
    isNphr: boolean = false,
    earlyBound: number = 1.7
  ): { label: 'Normal' | 'Monitoring' | 'Threshold Reached' | 'Data Error (≤ 0)' | 'N/A'; colorClass: string } => {
    if (currentVal !== null && currentVal !== undefined && !isNaN(currentVal) && currentVal <= 0) {
      return { label: 'Data Error (≤ 0)', colorClass: 'bg-rose-100 text-rose-900 border-rose-300 font-bold' };
    }
    if (det === null || det === undefined || !hasBaseline) {
      return { label: 'N/A', colorClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
    if (det >= thresh) {
      return { label: 'Threshold Reached', colorClass: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold' };
    }
    if (isNphr && det >= earlyBound) {
      return { label: 'Monitoring', colorClass: 'bg-amber-50 text-amber-800 border-amber-300 font-medium' };
    }
    if (!isNphr && det >= thresh * 0.5) {
      return { label: 'Monitoring', colorClass: 'bg-amber-50 text-amber-800 border-amber-300 font-medium' };
    }
    return { label: 'Normal', colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
  };

  const nphrStatus = getParamStatus(
    activeRecord?.nphr,
    activeRecord?.nphrDeterioration,
    thresholds.nphrWWThreshold,
    true,
    thresholds.nphrEarlyMonitoring
  );
  const prStatus = getParamStatus(
    activeRecord?.pr,
    activeRecord?.prDeterioration,
    thresholds.prWWThreshold
  );
  const p3Status = getParamStatus(
    activeRecord?.P3_0,
    activeRecord?.p3Deterioration,
    thresholds.p3WWThreshold
  );
  const powerStatus = getParamStatus(
    activeRecord?.realPower,
    activeRecord?.powerDeterioration,
    thresholds.powerWWThreshold
  );

  // Overall Recommendation determination reflects Performance Index & Core parameter criteria
  const getRecommendation = () => {
    if (!hasData || !hasBaseline) {
      return {
        label: 'AWAITING DATA',
        categoryLabel: 'WATER WASHING RECOMMENDATION',
        categoryColor: 'text-slate-500',
        labelColor: 'text-slate-800',
        boxStyle: 'bg-slate-50 border-slate-200 text-slate-700',
        badgeStyle: 'bg-slate-200 text-slate-700',
        icon: <HelpCircle className="w-8 h-8 text-slate-400 shrink-0 stroke-[2.2]" />,
        explanation: 'Operational data or baseline reference required to calculate condition.',
      };
    }

    if (activeRecord?.overallStatus === 'RECOMMEND WATER WASH') {
      return {
        label: 'RECOMMEND WATER WASH',
        categoryLabel: 'WATER WASHING RECOMMENDATION',
        categoryColor: 'text-rose-900/80',
        labelColor: 'text-rose-950',
        boxStyle: 'bg-rose-50/75 border-rose-300',
        badgeStyle: 'bg-rose-600 text-white',
        icon: <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0 stroke-[2.25]" />,
        explanation: activeRecord.statusExplanation,
      };
    }

    if (activeRecord?.overallStatus === 'MONITORING' || activeRecord?.overallStatus === 'EARLY MONITORING') {
      return {
        label: 'MONITORING (PANTAU)',
        categoryLabel: 'WATER WASHING RECOMMENDATION',
        categoryColor: 'text-amber-900/80',
        labelColor: 'text-amber-950',
        boxStyle: 'bg-amber-50/80 border-amber-300',
        badgeStyle: 'bg-amber-600 text-white',
        icon: <Clock className="w-8 h-8 text-amber-600 shrink-0 stroke-[2.25]" />,
        explanation: activeRecord.statusExplanation,
      };
    }

    return {
      label: 'NORMAL',
      categoryLabel: 'WATER WASHING RECOMMENDATION',
      categoryColor: 'text-emerald-900/80',
      labelColor: 'text-emerald-950',
      boxStyle: 'bg-emerald-50/70 border-emerald-300',
      badgeStyle: 'bg-emerald-600 text-white',
      icon: <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 stroke-[2.25]" />,
      explanation: activeRecord?.statusExplanation || '0 of 4 parameters reached threshold.',
    };
  };

  const rec = getRecommendation();

  // Performance Index & Decision evaluation for active record
  const piScore = activeRecord?.performanceIndex ?? null;
  const contrib = activeRecord?.performanceIndexContribution;

  const isPrInvalid = Boolean(activeRecord && (activeRecord.P1_7 <= 0 || activeRecord.P3_0 <= 0 || activeRecord.pr <= 0));
  const isP3Invalid = Boolean(activeRecord && activeRecord.P3_0 <= 0);
  const isNphrInvalid = Boolean(activeRecord && activeRecord.nphr <= 0);
  const isPowerInvalid = Boolean(activeRecord && activeRecord.realPower <= 0);

  const prMet = Boolean(!isPrInvalid && (activeRecord?.prThresholdReached || (contrib && contrib.pr >= INDICATOR_WEIGHTS.pr)));
  const p3Met = Boolean(!isP3Invalid && (activeRecord?.p3ThresholdReached || (contrib && contrib.p3 >= INDICATOR_WEIGHTS.p3)));
  const nphrMet = Boolean(!isNphrInvalid && (activeRecord?.nphrThresholdReached || (contrib && contrib.nphr >= INDICATOR_WEIGHTS.nphr)));
  const powerMet = Boolean(!isPowerInvalid && (activeRecord?.powerThresholdReached || (contrib && contrib.power >= INDICATOR_WEIGHTS.power)));

  const thresholdsMetCount =
    activeRecord?.thresholdsMetCount ??
    [prMet, p3Met, nphrMet, powerMet].filter(Boolean).length;
  const bobotLolos = piScore ?? 0;

  const isRecommendWW =
    activeRecord?.overallStatus === 'RECOMMEND WATER WASH' ||
    (thresholdsMetCount >= WATER_WASH_DECISION_RULES.minIndicatorsMet &&
      bobotLolos >= WATER_WASH_DECISION_RULES.minRecommendWeight);

  const isMonitoring =
    !isRecommendWW &&
    (activeRecord?.overallStatus === 'MONITORING' ||
      activeRecord?.overallStatus === 'EARLY MONITORING' ||
      (bobotLolos >= WATER_WASH_DECISION_RULES.minPantauWeight && bobotLolos < WATER_WASH_DECISION_RULES.minRecommendWeight) ||
      (activeRecord?.nphrDeterioration !== null &&
        activeRecord?.nphrDeterioration !== undefined &&
        activeRecord.nphrDeterioration >= thresholds.nphrEarlyMonitoring));

  const isNormal = !isRecommendWW && !isMonitoring && hasBaseline && piScore !== null;

  let piBadgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
  let piBadgeText = 'AWAITING DATA';
  let piGaugeBarColor = 'bg-slate-300';

  if (hasBaseline && piScore !== null) {
    if (isRecommendWW) {
      piBadgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      piBadgeText = `CRITICAL (≥${WATER_WASH_DECISION_RULES.minRecommendWeight}%)`;
      piGaugeBarColor = 'bg-rose-600';
    } else if (isMonitoring) {
      piBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      piBadgeText = 'PANTAU / MONITORING';
      piGaugeBarColor = 'bg-amber-500';
    } else {
      piBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      piBadgeText = `NORMAL (<${WATER_WASH_DECISION_RULES.minPantauWeight}%)`;
      piGaugeBarColor = 'bg-emerald-600';
    }
  }

  // Helper formatting
  const formatChange = (
    delta: number | null | undefined,
    pct: number | null | undefined,
    unit: string = '',
    reverse: boolean = false
  ) => {
    if (delta === null || delta === undefined || isNaN(delta)) return 'N/A';
    const sign = delta > 0 ? '+' : '';
    const pctStr = pct !== null && pct !== undefined && !isNaN(pct) ? ` (${sign}${pct.toFixed(2)}%)` : '';
    const isGood = reverse ? delta < 0 : delta > 0;
    const color = isGood ? 'text-emerald-700 font-semibold' : 'text-slate-800';

    return (
      <span className={color}>
        {sign}{delta.toFixed(2)}{unit ? ' ' + unit : ''}{pctStr}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Missing Baseline Notice */}
      {!hasBaseline && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Baseline reference values are not set. Input your first operational reading or import data to establish baseline.
            </span>
          </div>
          {onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="px-3 py-1 font-semibold text-xs bg-amber-700 text-white rounded hover:bg-amber-800 transition-colors"
            >
              Import Data
            </button>
          )}
        </div>
      )}

      {/* Historical Inspection / Time-Movement Controller */}
      {historyList.length > 0 && (
        <div className={`p-4 rounded-md border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs transition-all ${
          isHistorical
            ? 'bg-sky-50/80 border-sky-300 text-sky-950'
            : 'bg-white border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 shadow-2xs ${
              isHistorical ? 'bg-sky-600 text-white' : 'bg-slate-900 text-sky-400'
            }`}>
              {isHistorical ? <History className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-xs">
                  {isHistorical ? 'Viewing Historical Snapshot:' : 'Operational Data Scope:'}
                </span>
                {isHistorical ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-600 text-white shadow-2xs">
                    <History className="w-3 h-3" /> {activeRecord?.date} {activeRecord?.isDailyMedian ? '(Daily Median)' : activeRecord?.time || ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white shadow-2xs">
                    <Check className="w-3 h-3 stroke-[3]" /> Latest Reading ({latestChronologicalRecord?.date})
                  </span>
                )}
              </div>
              {isHistorical && (
                <p className="text-[11px] text-slate-600 mt-0.5">
                  All 4 parameter deteriorations, performance index, and WW recommendations below reflect conditions on this selected historical date.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Quick Date Selector Dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="history-date-select" className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                Jump to Date:
              </label>
              <select
                id="history-date-select"
                value={activeRecord?.id || activeRecord?.date || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (onSelectRecord) {
                    if (val === latestChronologicalRecord?.id || val === latestChronologicalRecord?.date) {
                      onSelectRecord(null); // return to latest
                    } else {
                      onSelectRecord(val);
                    }
                  }
                }}
                className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-sky-500 focus:outline-none shadow-2xs"
              >
                {[...historyList].reverse().map((r, idx) => {
                  const isLatest = idx === 0;
                  const isBaseline = baseline?.date === r.date;
                  return (
                    <option key={r.id || r.date} value={r.id || r.date}>
                      {r.date} {isLatest ? '★ (Latest)' : ''} {isBaseline ? '🎯 (Baseline)' : ''} {r.isWaterWashEvent ? '💧 (WW)' : ''} — PI: {r.performanceIndex !== null && r.performanceIndex !== undefined ? `${r.performanceIndex}%` : '—'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Stepper buttons (Previous / Next date movement) */}
            <div className="inline-flex rounded-md shadow-2xs">
              <button
                type="button"
                onClick={handlePrevRecord}
                disabled={!hasPrevious}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-l hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Step backward to previous historical date"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>
              <button
                type="button"
                onClick={handleNextRecord}
                disabled={!hasNext}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border-y border-r border-slate-300 rounded-r hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Step forward to next historical date"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reset to Latest button */}
            {isHistorical && onSelectRecord && (
              <button
                type="button"
                onClick={() => onSelectRecord(null)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-800 bg-white border border-sky-300 rounded hover:bg-sky-100/60 transition-colors shadow-2xs whitespace-nowrap"
                title="Reset dashboard to the latest operational reading"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-600" />
                <span>Return to Latest</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. UNIFIED TURBINE HEALTH & WATER WASH EVALUATION */}
      <section className="bg-white rounded-md border border-slate-200 p-5 shadow-xs space-y-4">
        {/* Main Recommendation & Performance Index Header Banner */}
        <div className={`p-4 sm:p-5 rounded-md border ${rec.boxStyle} flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-2xs`}>
          {/* Left: Recommendation Status Banner */}
          <div className="flex items-center gap-3.5 sm:gap-4 shrink-0">
            {rec.icon}
            <div>
              <div className={`text-xs sm:text-[13px] font-bold tracking-wider uppercase ${rec.categoryColor}`}>
                {rec.categoryLabel} {isHistorical && '(HISTORICAL)'}
              </div>
              <div className={`text-2xl sm:text-[26px] font-black tracking-tight leading-tight mt-0.5 ${rec.labelColor}`}>
                {rec.label}
              </div>
            </div>
          </div>

          {/* Right: Performance Index (Bobot Lolos) Progress & Summary */}
          <div className="lg:w-1/2 flex flex-col justify-center space-y-2 lg:pl-5 lg:border-l lg:border-slate-300/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800">Bobot Indikator Lolos:</span>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${piBadgeColor}`}>
                  {piBadgeText}
                </span>
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="text-lg font-black text-slate-900 tracking-tight">
                  {piScore !== null ? `${piScore}%` : '—'}
                </span>
                <span className="text-xs font-semibold text-slate-400">/ 100%</span>
              </div>
            </div>

            {/* Visual Progress Bar with Threshold Markers (Pantau, Recommend WW) */}
            <div className="space-y-1">
              <div className="relative h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden border border-slate-300/60">
                <div
                  className={`h-full transition-all duration-500 ${piGaugeBarColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, piScore ?? 0))}%` }}
                />
              </div>

              {/* Scale labels */}
              <div className="relative flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0%</span>
                <span className="text-amber-800 font-bold">{WATER_WASH_DECISION_RULES.minPantauWeight}% (Pantau)</span>
                <span className="text-rose-800 font-bold">{WATER_WASH_DECISION_RULES.minRecommendWeight}% (WW Target)</span>
                <span>100%</span>
              </div>
            </div>

            {/* Concise summary line and last reading date */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1 border-t border-slate-200/60 text-xs">
              <span className="font-semibold text-slate-800">
                {thresholdsMetCount} of 4 parameter thresholds met with combined weight {bobotLolos}%.
              </span>
              {activeRecord && (
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {isHistorical
                    ? `Historical: ${activeRecord.date} ${activeRecord.isDailyMedian ? '(Median)' : activeRecord.time || ''}`
                    : `Last reading: ${activeRecord.date} ${activeRecord.time || ''}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Explicit Warning: Physical Data Error (Kasus b: Data ada tapi <= 0) */}
        {activeRecord?.hasPhysicalDataError && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-md text-xs text-rose-950 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-rose-900 text-xs uppercase tracking-wide">
                  ⚠️ Peringatan Kualitas Data: Data Tidak Wajar, Cek Input!
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900">
                  Evaluasi Tetap {activeRecord.thresholdsMetCount} dari {activeRecord.evaluatedIndicatorsCount} Parameter
                </span>
              </div>
              <p className="text-rose-900 text-xs">
                {activeRecord.dataQualityWarning || 'Besaran fisik turbin gas (P1.7, P3.0, Real Power, NPHR) harus bernilai positif (> 0). Nilai ≤ 0 merupakan data error.'}
              </p>
              <p className="text-[11px] text-rose-700">
                Penyebut tidak diam-diam diturunkan menjadi {activeRecord.thresholdsMetCount} dari 3. Periksa input data atau kalibrasi sensor agar evaluasi valid.
              </p>
            </div>
          </div>
        )}

        {/* Active Baseline Reference Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-slate-900 text-sky-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">Active Baseline Reference:</span>
                {hasBaseline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300">
                    Not Set
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {hasBaseline
                  ? (baseline.referenceDescription || (baseline.date ? `Calibrated on ${baseline.date} ${baseline.time || ''}` : 'Operational Baseline Reference'))
                  : 'No baseline set. Deteriorations are calculated relative to this reference point.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {hasBaseline && (
              <div className="flex items-center gap-3 text-[11px] bg-white px-3 py-1.5 rounded border border-slate-200">
                <span>Power: <strong className="text-slate-900">{baseline.realPower?.toFixed(2)} MW</strong></span>
                <span>PR: <strong className="text-slate-900 font-mono">{baseline.PR?.toFixed(4)}</strong></span>
                <span>P3.0: <strong className="text-slate-900">{baseline.P3_0?.toFixed(2)} PSIA</strong></span>
                <span>NPHR: <strong className="text-slate-900">{baseline.nphr?.toLocaleString()} kcal</strong></span>
              </div>
            )}
            {onOpenBaselineConfig && (
              <button
                type="button"
                id="change-baseline-btn"
                onClick={onOpenBaselineConfig}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-2xs shrink-0"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>Change Baseline</span>
              </button>
            )}

            {/* Rule Logic Toggle Button */}
            <button
              type="button"
              id="toggle-rule-logic-btn"
              onClick={() => setShowRuleLogic((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors shadow-2xs shrink-0 ${
                showRuleLogic
                  ? 'bg-sky-50 text-sky-800 border-sky-300 ring-1 ring-sky-200'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title={showRuleLogic ? 'Sembunyikan Rule Logic' : 'Lihat Aturan Keputusan Evaluasi Water Wash (1.1 - 1.3)'}
            >
              <Info className="w-3.5 h-3.5 text-sky-600" />
              <span>Rule Logic</span>
              {showRuleLogic ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Unified 4 Performance Parameters Grid (PR, P3.0, NPHR, Real Power) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* PR Card (30%) */}
          <div className={`border rounded-md p-3.5 transition-colors shadow-2xs ${
            isPrInvalid ? 'bg-rose-50/60 border-rose-300' : prMet ? 'bg-rose-50/25 border-rose-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">PR</span>
                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                  Weight: {INDICATOR_WEIGHTS.pr}%
                </span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                isPrInvalid ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold' : prMet ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                {isPrInvalid ? 'Data Error' : prMet ? `Met (≥${thresholds.prWWThreshold}%)` : 'Normal'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight font-mono">
                {activeRecord ? activeRecord.pr.toFixed(4) : '—'}
              </div>
              <div className="text-xs font-bold text-slate-700">
                Score: <span className={prMet ? 'text-rose-700' : 'text-slate-500'}>{contrib ? `${contrib.pr}%` : prMet ? `${INDICATOR_WEIGHTS.pr}%` : '0%'}</span>
              </div>
            </div>
            <div className="mt-2 text-xs space-y-1 text-slate-600 border-t border-slate-100 pt-2">
              <div className="flex justify-between items-baseline">
                <span>Deterioration:</span>
                <span className={`font-semibold ${activeRecord?.prDeterioration && activeRecord.prDeterioration >= thresholds.prWWThreshold ? 'text-rose-700' : 'text-slate-800'}`}>
                  {activeRecord?.prDeterioration !== null && activeRecord?.prDeterioration !== undefined
                    ? `${activeRecord.prDeterioration > 0 ? '+' : ''}${activeRecord.prDeterioration}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-500">
                <span>Delta vs Baseline:</span>
                <span className="font-mono font-medium text-slate-700">
                  {activeRecord?.prDelta !== null && activeRecord?.prDelta !== undefined
                    ? `${activeRecord.prDelta > 0 ? '+' : ''}${activeRecord.prDelta.toFixed(4)}`
                    : (hasBaseline && baseline.PR && activeRecord ? `${(activeRecord.pr - baseline.PR) > 0 ? '+' : ''}${(activeRecord.pr - baseline.PR).toFixed(4)}` : '—')}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Threshold:</span>
                <span>≥ {thresholds.prWWThreshold}%</span>
              </div>
            </div>
          </div>

          {/* P3.0 Card (30%) */}
          <div className={`border rounded-md p-3.5 transition-colors shadow-2xs ${
            isP3Invalid ? 'bg-rose-50/60 border-rose-300' : p3Met ? 'bg-rose-50/25 border-rose-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">P3.0</span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                  Weight: {INDICATOR_WEIGHTS.p3}%
                </span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                isP3Invalid ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold' : p3Met ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                {isP3Invalid ? 'Data Error' : p3Met ? `Met (≥${thresholds.p3WWThreshold}%)` : 'Normal'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? `${activeRecord.P3_0.toFixed(2)} ` : '— '}
                <span className="text-xs font-normal text-slate-500">PSIA</span>
              </div>
              <div className="text-xs font-bold text-slate-700">
                Score: <span className={p3Met ? 'text-rose-700' : 'text-slate-500'}>{contrib ? `${contrib.p3}%` : p3Met ? `${INDICATOR_WEIGHTS.p3}%` : '0%'}</span>
              </div>
            </div>
            <div className="mt-2 text-xs space-y-1 text-slate-600 border-t border-slate-100 pt-2">
              <div className="flex justify-between items-baseline">
                <span>Deterioration:</span>
                <span className={`font-semibold ${activeRecord?.p3Deterioration && activeRecord.p3Deterioration >= thresholds.p3WWThreshold ? 'text-rose-700' : 'text-slate-800'}`}>
                  {activeRecord?.p3Deterioration !== null && activeRecord?.p3Deterioration !== undefined
                    ? `${activeRecord.p3Deterioration > 0 ? '+' : ''}${activeRecord.p3Deterioration}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-500">
                <span>Delta vs Baseline:</span>
                <span className="font-mono font-medium text-slate-700">
                  {activeRecord?.p3Delta !== null && activeRecord?.p3Delta !== undefined
                    ? `${activeRecord.p3Delta > 0 ? '+' : ''}${activeRecord.p3Delta.toFixed(2)} PSIA`
                    : (hasBaseline && baseline.P3_0 && activeRecord ? `${(activeRecord.P3_0 - baseline.P3_0) > 0 ? '+' : ''}${(activeRecord.P3_0 - baseline.P3_0).toFixed(2)} PSIA` : '—')}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Threshold:</span>
                <span>≥ {thresholds.p3WWThreshold}%</span>
              </div>
            </div>
          </div>

          {/* NPHR Card (20%) */}
          <div className={`border rounded-md p-3.5 transition-colors shadow-2xs ${
            isNphrInvalid ? 'bg-rose-50/60 border-rose-300' : nphrMet ? 'bg-rose-50/25 border-rose-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">NPHR</span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Weight: {INDICATOR_WEIGHTS.nphr}%
                </span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                isNphrInvalid
                  ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                  : nphrMet
                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                  : activeRecord?.nphrEarlyMonitoringReached
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                {isNphrInvalid
                  ? 'Data Error'
                  : nphrMet
                  ? `Met (≥${thresholds.nphrWWThreshold}%)`
                  : activeRecord?.nphrEarlyMonitoringReached
                  ? `Pantau (≥${thresholds.nphrEarlyMonitoring}%)`
                  : 'Normal'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? `${activeRecord.nphr.toLocaleString()} ` : '— '}
                <span className="text-xs font-normal text-slate-500">kcal/kWh</span>
              </div>
              <div className="text-xs font-bold text-slate-700">
                Score: <span className={nphrMet ? 'text-rose-700' : 'text-slate-500'}>{contrib ? `${contrib.nphr}%` : nphrMet ? `${INDICATOR_WEIGHTS.nphr}%` : '0%'}</span>
              </div>
            </div>
            <div className="mt-2 text-xs space-y-1 text-slate-600 border-t border-slate-100 pt-2">
              <div className="flex justify-between items-baseline">
                <span>Deterioration:</span>
                <span className={`font-semibold ${activeRecord?.nphrDeterioration && activeRecord.nphrDeterioration >= thresholds.nphrWWThreshold ? 'text-rose-700' : 'text-slate-800'}`}>
                  {activeRecord?.nphrDeterioration !== null && activeRecord?.nphrDeterioration !== undefined
                    ? `${activeRecord.nphrDeterioration > 0 ? '+' : ''}${activeRecord.nphrDeterioration}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-500">
                <span>Delta vs Baseline:</span>
                <span className="font-mono font-medium text-slate-700">
                  {activeRecord?.nphrDelta !== null && activeRecord?.nphrDelta !== undefined
                    ? `${activeRecord.nphrDelta > 0 ? '+' : ''}${activeRecord.nphrDelta.toFixed(1)} kcal/kWh`
                    : (hasBaseline && baseline.nphr && activeRecord ? `${(activeRecord.nphr - baseline.nphr) > 0 ? '+' : ''}${(activeRecord.nphr - baseline.nphr).toFixed(1)} kcal/kWh` : '—')}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Threshold:</span>
                <span>≥ {thresholds.nphrWWThreshold}% (Early: {thresholds.nphrEarlyMonitoring}%)</span>
              </div>
            </div>
          </div>

          {/* Real Power Card (20%) */}
          <div className={`border rounded-md p-3.5 transition-colors shadow-2xs ${
            isPowerInvalid ? 'bg-rose-50/60 border-rose-300' : powerMet ? 'bg-rose-50/25 border-rose-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">Real Power</span>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                  Weight: {INDICATOR_WEIGHTS.power}%
                </span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                isPowerInvalid ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold' : powerMet ? `bg-rose-50 text-rose-800 border-rose-300` : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                {isPowerInvalid ? 'Data Error' : powerMet ? `Met (≥${thresholds.powerWWThreshold}%)` : 'Normal'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? `${activeRecord.realPower.toFixed(2)} ` : '— '}
                <span className="text-xs font-normal text-slate-500">MW</span>
              </div>
              <div className="text-xs font-bold text-slate-700">
                Score: <span className={powerMet ? 'text-rose-700' : 'text-slate-500'}>{contrib ? `${contrib.power}%` : powerMet ? `${INDICATOR_WEIGHTS.power}%` : '0%'}</span>
              </div>
            </div>
            <div className="mt-2 text-xs space-y-1 text-slate-600 border-t border-slate-100 pt-2">
              <div className="flex justify-between items-baseline">
                <span>Deterioration:</span>
                <span className={`font-semibold ${activeRecord?.powerDeterioration && activeRecord.powerDeterioration >= thresholds.powerWWThreshold ? 'text-rose-700' : 'text-slate-800'}`}>
                  {activeRecord?.powerDeterioration !== null && activeRecord?.powerDeterioration !== undefined
                    ? `${activeRecord.powerDeterioration > 0 ? '+' : ''}${activeRecord.powerDeterioration}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-[11px] text-slate-500">
                <span>Delta vs Baseline:</span>
                <span className="font-mono font-medium text-slate-700">
                  {activeRecord?.powerDelta !== null && activeRecord?.powerDelta !== undefined
                    ? `${activeRecord.powerDelta > 0 ? '+' : ''}${activeRecord.powerDelta.toFixed(2)} MW`
                    : (hasBaseline && baseline.realPower && activeRecord ? `${(activeRecord.realPower - baseline.realPower) > 0 ? '+' : ''}${(activeRecord.realPower - baseline.realPower).toFixed(2)} MW` : '—')}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Threshold:</span>
                <span>≥ {thresholds.powerWWThreshold}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Decision Rules Card (Rule Logic 1.1 - 1.3) - Hidden by default, toggled via Rule Logic button */}
        {showRuleLogic && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                <Info className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Rule Logic — Aturan Keputusan Evaluasi Water Wash (1.1 - 1.3):</span>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500 font-medium">Status Gerbang Rekomendasi WW:</span>
                {isRecommendWW ? (
                  <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Terpenuhi ({thresholdsMetCount}/4 Lolos, Bobot {bobotLolos}%)
                  </span>
                ) : (
                  <span className="font-medium text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {thresholdsMetCount}/{WATER_WASH_DECISION_RULES.minIndicatorsMet} Indikator • {bobotLolos}%/{WATER_WASH_DECISION_RULES.minRecommendWeight}% Bobot
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowRuleLogic(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition-colors ml-1"
                  title="Tutup Rule Logic"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] leading-relaxed">
              <div className={`p-2.5 rounded border space-y-1 transition-all ${
                isRecommendWW ? 'bg-rose-50/70 border-rose-300 ring-1 ring-rose-400' : 'bg-white border-slate-200/80'
              }`}>
                <div className="font-bold text-rose-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0"></span>
                  <span>1.1 RECOMMEND WATER WASH</span>
                  {isRecommendWW && (
                    <span className="ml-auto text-[9px] uppercase px-1.5 py-0.2 bg-rose-600 text-white rounded font-extrabold">Active</span>
                  )}
                </div>
                <p className="text-slate-600 text-[11px]">
                  Kriteria terpenuhi: <strong>Indikator Lolos ≥ {WATER_WASH_DECISION_RULES.minIndicatorsMet}</strong> (dari 4) <strong>DAN</strong> total <strong>Bobot Lolos ≥ {WATER_WASH_DECISION_RULES.minRecommendWeight}%</strong>.
                </p>
              </div>

              <div className={`p-2.5 rounded border space-y-1 transition-all ${
                isMonitoring ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400' : 'bg-white border-slate-200/80'
              }`}>
                <div className="font-bold text-amber-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                  <span>1.2 PANTAU / MONITORING</span>
                  {isMonitoring && (
                    <span className="ml-auto text-[9px] uppercase px-1.5 py-0.2 bg-amber-600 text-white rounded font-extrabold">Active</span>
                  )}
                </div>
                <p className="text-slate-600 text-[11px]">
                  Kriteria WW belum terpenuhi, dan: <strong>Bobot Lolos {WATER_WASH_DECISION_RULES.minPantauWeight}% – {WATER_WASH_DECISION_RULES.maxPantauWeight}%</strong> <strong>ATAU</strong> Deteriorasi <strong>NPHR ≥ {thresholds.nphrEarlyMonitoring}%</strong> (Early Monitoring).
                </p>
              </div>

              <div className={`p-2.5 rounded border space-y-1 transition-all ${
                isNormal ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400' : 'bg-white border-slate-200/80'
              }`}>
                <div className="font-bold text-emerald-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span>
                  <span>1.3 NORMAL</span>
                  {isNormal && (
                    <span className="ml-auto text-[9px] uppercase px-1.5 py-0.2 bg-emerald-600 text-white rounded font-extrabold">Active</span>
                  )}
                </div>
                <p className="text-slate-600 text-[11px]">
                  Operasi turbin gas berada dalam batas normal: <strong>Bobot Lolos &lt; {WATER_WASH_DECISION_RULES.minPantauWeight}%</strong> <strong>DAN</strong> Deteriorasi <strong>NPHR &lt; {thresholds.nphrEarlyMonitoring}%</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. EARLY WARNING FORECAST SYSTEM */}
      <ForecastWidget
        forecastSummary={forecastSummary}
        inputHistoryRecords={inputHistoryRecords}
        baseline={baseline}
        thresholds={thresholds}
        hasBaseline={hasBaseline}
        selectedDate={activeRecord?.date}
      />

      {/* 4. WATER WASH PERFORMANCE RECOVERY */}
      <section className="bg-white rounded-md border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Water Wash Performance</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical results comparing H-1 (before wash) to H+1 (after wash) aggregated by daily median. Click a row to view full comparison details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              {events.length} {events.length === 1 ? 'wash event' : 'wash events'} recorded
            </span>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No Water Washing events recorded yet. You can mark Water Wash events when submitting readings in{' '}
            <button
              type="button"
              onClick={() => onNavigate('input')}
              className="text-sky-700 font-semibold underline hover:text-sky-900"
            >
              Input Data
            </button>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">WW Date</th>
                  <th className="py-3 px-4">NPHR Change</th>
                  <th className="py-3 px-4">Efficiency Change</th>
                  <th className="py-3 px-4">PR Change</th>
                  <th className="py-3 px-4">P3.0 Change</th>
                  <th className="py-3 px-4">Real Power Change</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {evt.date}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatChange(evt.deltaNPHR, evt.deltaNPHRPercent, 'kcal/kWh', true)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {evt.deltaEfficiency !== null && evt.deltaEfficiency !== undefined
                        ? <span className="text-emerald-700 font-semibold">+{evt.deltaEfficiency.toFixed(2)}%</span>
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatChange(evt.deltaPR, evt.deltaPRPercent, '', false)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatChange(evt.deltaP3, evt.deltaP3Percent, 'PSIA', false)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatChange(evt.deltaPower, evt.deltaPowerPercent, 'MW', false)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      <ChevronRight className="w-4 h-4 inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Water Wash Detail Modal */}
      <WaterWashDetailModal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
      />
    </div>
  );
};
