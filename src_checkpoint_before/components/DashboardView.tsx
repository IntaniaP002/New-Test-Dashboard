import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  Info,
  Compass,
  Check,
  Sliders,
  History,
  RotateCcw,
} from 'lucide-react';
import {
  BaselineConfig,
  OperationalRecord,
  OverallForecastSummary,
  ThresholdConfig,
  WaterWashEvent,
} from '../types';
import { WaterWashDetailModal } from './WaterWashDetailModal';
import { PerformanceIndexCard } from './PerformanceIndexCard';
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
  onNavigate: (tab: 'dashboard' | 'input' | 'trend') => void;
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
    det: number | null | undefined,
    thresh: number,
    isNphr: boolean = false,
    earlyBound: number = 1.7
  ): { label: 'Normal' | 'Monitoring' | 'Threshold Reached' | 'N/A'; colorClass: string } => {
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
    activeRecord?.nphrDeterioration,
    thresholds.nphrWWThreshold,
    true,
    thresholds.nphrEarlyMonitoring
  );
  const prStatus = getParamStatus(activeRecord?.prDeterioration, thresholds.prWWThreshold);
  const p3Status = getParamStatus(activeRecord?.p3Deterioration, thresholds.p3WWThreshold);
  const powerStatus = getParamStatus(activeRecord?.powerDeterioration, thresholds.powerWWThreshold);

  // Overall Recommendation determination reflects Performance Index & Core parameter criteria
  const getRecommendation = () => {
    if (!hasData || !hasBaseline) {
      return {
        label: 'AWAITING DATA',
        boxStyle: 'bg-slate-50 border-slate-200 text-slate-700',
        badgeStyle: 'bg-slate-200 text-slate-700',
        icon: <HelpCircle className="w-6 h-6 text-slate-400" />,
        explanation: 'Operational data or baseline reference required to calculate condition.',
      };
    }

    if (activeRecord?.overallStatus === 'RECOMMEND WATER WASH') {
      return {
        label: 'RECOMMEND WATER WASH',
        boxStyle: 'bg-rose-50/80 border-rose-300 text-rose-950',
        badgeStyle: 'bg-rose-600 text-white',
        icon: <AlertTriangle className="w-6 h-6 text-rose-600" />,
        explanation: activeRecord.statusExplanation,
      };
    }

    if (activeRecord?.overallStatus === 'MONITORING' || activeRecord?.overallStatus === 'EARLY MONITORING') {
      return {
        label: 'MONITORING (PANTAU)',
        boxStyle: 'bg-amber-50/80 border-amber-300 text-amber-950',
        badgeStyle: 'bg-amber-600 text-white',
        icon: <Clock className="w-6 h-6 text-amber-600" />,
        explanation: activeRecord.statusExplanation,
      };
    }

    return {
      label: 'NORMAL',
      boxStyle: 'bg-emerald-50/70 border-emerald-300 text-emerald-950',
      badgeStyle: 'bg-emerald-600 text-white',
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
      explanation: activeRecord?.statusExplanation || '0 of 4 parameters reached threshold.',
    };
  };

  const rec = getRecommendation();

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
              <p className="text-[11px] text-slate-600 mt-0.5">
                {isHistorical
                  ? 'All 4 parameter deteriorations, performance index, and WW recommendations below reflect conditions on this selected historical date.'
                  : 'Displaying the most recent verified operational reading. Select any date from Input History or use the controls to inspect historical movement.'}
              </p>
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

      {/* 1. TOP SECTION: CURRENT CONDITION & WATER WASH RECOMMENDATION */}
      <section className="bg-white rounded-md border border-slate-200 p-5 shadow-xs space-y-4">
        {/* Main Recommendation Banner */}
        <div className={`p-4 rounded border ${rec.boxStyle} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            {rec.icon}
            <div>
              <div className="text-[11px] font-bold tracking-wider uppercase opacity-75">
                Water Washing Recommendation {isHistorical && '(Historical)'}
              </div>
              <div className="text-xl font-extrabold tracking-tight mt-0.5">
                {rec.label}
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            <span className="text-xs font-medium block">
              {rec.explanation}
            </span>
            {activeRecord && (
              <span className="text-[11px] opacity-75 mt-0.5 block">
                {isHistorical ? `Historical snapshot: ${activeRecord.date} ${activeRecord.isDailyMedian ? '(Daily Median)' : activeRecord.time || ''}` : `Last reading: ${activeRecord.date} ${activeRecord.time}`}
              </span>
            )}
          </div>
        </div>

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
                onClick={onOpenBaselineConfig}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-2xs shrink-0"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>Change Baseline</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Main Performance Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* NPHR */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">NPHR</span>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${nphrStatus.colorClass}`}>
                {nphrStatus.label}
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? `${activeRecord.nphr.toLocaleString()} ` : '— '}
                <span className="text-xs font-normal text-slate-500">kcal/kWh</span>
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
          </div>

          {/* PR */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">PR</span>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${prStatus.colorClass}`}>
                {prStatus.label}
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? activeRecord.pr.toFixed(4) : '—'}
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
          </div>

          {/* P3.0 */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">P3.0</span>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${p3Status.colorClass}`}>
                {p3Status.label}
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? `${activeRecord.P3_0.toFixed(2)} ` : '— '}
                <span className="text-xs font-normal text-slate-500">PSIA</span>
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
          </div>

          {/* Real Power */}
          <div className="bg-white border border-slate-200 rounded-md p-3.5 hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Real Power</span>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${powerStatus.colorClass}`}>
                {powerStatus.label}
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">
                {activeRecord ? `${activeRecord.realPower.toFixed(2)} ` : '— '}
                <span className="text-xs font-normal text-slate-500">MW</span>
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
        </div>
      </section>

      {/* 2. WEIGHTED PERFORMANCE INDEX SECTION */}
      <PerformanceIndexCard
        latestRecord={activeRecord}
        thresholds={thresholds}
        hasBaseline={hasBaseline}
      />

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
                  <th className="py-3 px-4">Readings Aggregated</th>
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {evt.hourlyObservationsCount && evt.hourlyObservationsCount > 1
                          ? `${evt.hourlyObservationsCount} hourly (median)`
                          : '1 daily record'}
                      </span>
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
