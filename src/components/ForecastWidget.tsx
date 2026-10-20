import React, { useState } from 'react';
import {
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle2,
  HelpCircle,
  BarChart3,
  Flame,
  Gauge,
  Zap,
  Activity,
  Target,
  LayoutGrid,
  Layers,
  Info,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BaselineConfig,
  ForecastParameter,
  OperationalRecord,
  OverallForecastSummary,
  ThresholdConfig,
} from '../types';
import { FIXED_FORECAST_THRESHOLDS, WATER_WASH_DECISION_RULES } from '../data/initialData';
import { calculateOverallForecast, calculateThreeDayProjection, MIN_FORECAST_OBSERVATIONS } from '../utils/forecastEngine';
import { TimePeriod, getWeekBucket, getMonthBucket } from '../utils/dateGrouping';
import { ThreeDayProjectionSection } from './ThreeDayProjectionSection';

interface ForecastWidgetProps {
  forecastSummary: OverallForecastSummary;
  inputHistoryRecords?: OperationalRecord[];
  baseline?: BaselineConfig;
  thresholds?: ThresholdConfig;
  hasBaseline: boolean;
  selectedDate?: string;
}

export const ForecastWidget: React.FC<ForecastWidgetProps> = ({
  forecastSummary,
  inputHistoryRecords,
  baseline,
  thresholds,
  hasBaseline,
  selectedDate,
}) => {
  const [selectedParamChart, setSelectedParamChart] = useState<ForecastParameter | 'ALL'>('ALL');
  const [allViewMode, setAllViewMode] = useState<'combined' | 'grid'>('combined');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('daily');
  const [syncToHistoricalDate, setSyncToHistoricalDate] = useState(true);
  const [showPantauDetail, setShowPantauDetail] = useState(false);

  // Determine latest record date available in dataset
  const latestRecordDate = React.useMemo(() => {
    if (!inputHistoryRecords || inputHistoryRecords.length === 0) return null;
    const sorted = [...inputHistoryRecords].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1]?.date ?? null;
  }, [inputHistoryRecords]);

  // Is inspecting a historical date earlier than latest dataset date?
  const isHistoricalDate = Boolean(
    selectedDate && latestRecordDate && selectedDate < latestRecordDate
  );

  const shouldScopeToSelectedDate = isHistoricalDate && syncToHistoricalDate;

  // Effective records scoped to selected date if historical inspection is active
  const effectiveHistoryRecords = React.useMemo(() => {
    if (!inputHistoryRecords || inputHistoryRecords.length === 0) return [];
    if (shouldScopeToSelectedDate && selectedDate) {
      return inputHistoryRecords.filter((r) => r.date <= selectedDate);
    }
    return inputHistoryRecords;
  }, [inputHistoryRecords, shouldScopeToSelectedDate, selectedDate]);

  // Compute active summary based on selected scope and historical inspection date
  const activeSummary = React.useMemo(() => {
    if (!inputHistoryRecords || !baseline || inputHistoryRecords.length === 0) {
      return forecastSummary;
    }

    if (shouldScopeToSelectedDate) {
      return calculateOverallForecast(effectiveHistoryRecords, baseline, thresholds, 'cycle', selectedDate);
    }

    return forecastSummary;
  }, [
    shouldScopeToSelectedDate,
    effectiveHistoryRecords,
    baseline,
    thresholds,
    forecastSummary,
    inputHistoryRecords,
  ]);

  const {
    hasForecast,
    forecastWW,
    forecastWWDate,
    governingParameter,
    governingDisplayName,
    forecastDaysPR,
    forecastDaysP3,
    forecastDaysNPHR,
    forecastDaysPower,
    forecastDaysAux,
    isConditionSatisfied,
    waterWashStatus,
    daysUntilNextWaterWash,
    isPantauOperationalState,
    isPantauCapped,
    rawForecastWW,
    pantauCapDays,
    pantauExplanation,
    nearestParameter,
    nearestDisplayName,
    nearestDays,
    nearestDate,
    hasThresholdReached,
    reachedParameters,
    parameters,
    dailyRecords,
    cycleStartDate,
    baselineDate,
    forecastRunningHours,
    runningHoursPerDay,
    pantauCapHours,
  } = activeSummary;

  const runningHours = forecastRunningHours ?? (forecastWW !== null ? forecastWW * 4 : null);
  const rhPerDay = runningHoursPerDay || 4;

  // Parameter Projection Summary (3 Days for DUE_NOW or N Days for Normal status)
  const projectionSummary = React.useMemo(() => {
    if (!baseline || !hasBaseline || !parameters) return null;
    const latestRec = dailyRecords[dailyRecords.length - 1];
    const startDate = shouldScopeToSelectedDate && selectedDate ? selectedDate : latestRec?.date;
    const targetDays = isConditionSatisfied
      ? (activeSummary.forecastWW !== null ? activeSummary.forecastWW : 3)
      : (activeSummary.forecastWW || 3);
    const targetDate = activeSummary.forecastWWDate;

    return calculateThreeDayProjection(
      parameters,
      baseline,
      latestRec,
      startDate,
      isConditionSatisfied,
      targetDays,
      targetDate
    );
  }, [
    parameters,
    baseline,
    hasBaseline,
    dailyRecords,
    shouldScopeToSelectedDate,
    selectedDate,
    isConditionSatisfied,
    activeSummary.forecastWW,
    activeSummary.forecastWWDate,
  ]);

  // Selected parameter forecast info (falls back to governing parameter or PR when 'ALL' is selected)
  const activeFc = selectedParamChart === 'ALL'
    ? parameters[governingParameter || 'PR'] || parameters.PR
    : parameters[selectedParamChart];

  // Helper for human-readable parameter labels
  const getParamLabel = (p: ForecastParameter) => {
    switch (p) {
      case 'PR':
        return 'PR';
      case 'P3_0':
        return 'P3.0';
      case 'NPHR':
        return 'NPHR';
      case 'realPower':
        return 'Real Power';
    }
  };

  const getParamIcon = (p: ForecastParameter) => {
    switch (p) {
      case 'PR':
        return <Gauge className="w-3.5 h-3.5" />;
      case 'P3_0':
        return <Activity className="w-3.5 h-3.5" />;
      case 'NPHR':
        return <Flame className="w-3.5 h-3.5" />;
      case 'realPower':
        return <Zap className="w-3.5 h-3.5" />;
    }
  };

  // Dynamic snapshot information based on selected historical date
  const snapshotInfo = React.useMemo(() => {
    const record = (inputHistoryRecords || []).find((r) => r.date === selectedDate);
    
    let statusText = 'Normal';
    let badgeClass = 'text-emerald-800';
    
    if (record?.overallStatus === 'RECOMMEND_WW' || waterWashStatus === 'DUE_NOW') {
      const weight = record?.performanceIndex ?? 80;
      statusText = `Recommend Water Wash (${weight}%)`;
      badgeClass = 'text-rose-800 font-extrabold';
    } else if (record?.overallStatus === 'CAUTION' || record?.overallStatus === 'MONITORING' || isPantauOperationalState) {
      const weight = record?.performanceIndex ?? 60;
      statusText = `Caution (${weight}%)`;
      badgeClass = 'text-amber-800 font-bold';
    }

    const reachedNames = reachedParameters && reachedParameters.length > 0
      ? reachedParameters.map((p) => getParamLabel(p)).join(', ')
      : null;

    return {
      statusText,
      badgeClass,
      reachedNames,
    };
  }, [selectedDate, inputHistoryRecords, waterWashStatus, isPantauOperationalState, reachedParameters]);

  // Raw daily combined dataset
  const rawAllChartData = React.useMemo(() => {
    if (dailyRecords.length === 0) return [];

    const dates: string[] = Array.from(new Set<string>(dailyRecords.map((r) => r.date))).sort();

    return dates.map((d: string) => {
      const prPt = parameters.PR?.elapsedDaysData?.find((p) => p.date === d);
      const p3Pt = parameters.P3_0?.elapsedDaysData?.find((p) => p.date === d);
      const nphrPt = parameters.NPHR?.elapsedDaysData?.find((p) => p.date === d);
      const powerPt = parameters.realPower?.elapsedDaysData?.find((p) => p.date === d);

      const elapsed = prPt?.elapsedDays ?? p3Pt?.elapsedDays ?? nphrPt?.elapsedDays ?? powerPt?.elapsedDays ?? 0;

      return {
        date: d,
        displayLabel: d.length > 5 ? d.slice(5) : d,
        elapsedDays: elapsed,
        PR: prPt ? Number(prPt.deterioration.toFixed(2)) : null,
        P3_0: p3Pt ? Number(p3Pt.deterioration.toFixed(2)) : null,
        NPHR: nphrPt ? Number(nphrPt.deterioration.toFixed(2)) : null,
        realPower: powerPt ? Number(powerPt.deterioration.toFixed(2)) : null,
        count: 1,
        tooltipTitle: `${d} (Day ${elapsed})`,
      };
    });
  }, [dailyRecords, parameters]);

  // Aggregated multi-parameter chart dataset (supports Daily, Weekly, Monthly)
  const allChartData = React.useMemo(() => {
    if (rawAllChartData.length === 0) return [];
    if (timePeriod === 'daily') return rawAllChartData;

    const groups = new Map<string, {
      key: string;
      displayLabel: string;
      tooltipTitle: string;
      date: string;
      elapsedDays: number[];
      PR: number[];
      P3_0: number[];
      NPHR: number[];
      realPower: number[];
      count: number;
    }>();

    rawAllChartData.forEach((pt) => {
      let key: string;
      let displayLabel: string;
      let tooltipTitle: string;

      if (timePeriod === 'weekly') {
        const wk = getWeekBucket(pt.date);
        key = wk.key;
        displayLabel = wk.label;
        tooltipTitle = `Week ${wk.rangeLabel}`;
      } else {
        const mo = getMonthBucket(pt.date);
        key = mo.key;
        displayLabel = mo.label;
        tooltipTitle = mo.fullLabel;
      }

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          displayLabel,
          tooltipTitle,
          date: pt.date,
          elapsedDays: [],
          PR: [],
          P3_0: [],
          NPHR: [],
          realPower: [],
          count: 0,
        });
      }

      const g = groups.get(key)!;
      g.count += 1;
      g.elapsedDays.push(pt.elapsedDays);
      if (pt.PR !== null && pt.PR !== undefined) g.PR.push(pt.PR);
      if (pt.P3_0 !== null && pt.P3_0 !== undefined) g.P3_0.push(pt.P3_0);
      if (pt.NPHR !== null && pt.NPHR !== undefined) g.NPHR.push(pt.NPHR);
      if (pt.realPower !== null && pt.realPower !== undefined) g.realPower.push(pt.realPower);
    });

    const avg = (arr: number[]) => (arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null);

    return Array.from(groups.values()).map((g) => ({
      date: g.date,
      displayLabel: g.displayLabel,
      tooltipTitle: `${g.tooltipTitle} • Rata-rata ${g.count} data harian`,
      elapsedDays: Math.round(g.elapsedDays.reduce((a, b) => a + b, 0) / g.elapsedDays.length),
      PR: avg(g.PR),
      P3_0: avg(g.P3_0),
      NPHR: avg(g.NPHR),
      realPower: avg(g.realPower),
      count: g.count,
    }));
  }, [rawAllChartData, timePeriod]);

  // Build chart dataset with historic points, regression line, and projected forward points
  const chartData = React.useMemo(() => {
    if (dailyRecords.length === 0) return [];

    const elapsedData = activeFc.elapsedDaysData || [];
    if (elapsedData.length === 0) return [];

    const points: {
      date: string;
      displayLabel: string;
      elapsedDays: number;
      actualDeterioration: number | null;
      regressionTrend: number | null;
      projectedTrend: number | null;
      isForecast: boolean;
      isThresholdCrossing?: boolean;
      tooltipTitle?: string;
    }[] = [];

    // 1. Historical actual and fitted regression points
    if (timePeriod === 'daily') {
      elapsedData.forEach((pt) => {
        points.push({
          date: pt.date,
          displayLabel: pt.date.length > 5 ? pt.date.slice(5) : pt.date,
          elapsedDays: pt.elapsedDays,
          actualDeterioration: Number(pt.deterioration.toFixed(2)),
          regressionTrend: pt.fitted !== null ? Number(pt.fitted.toFixed(2)) : null,
          projectedTrend: null,
          isForecast: false,
          tooltipTitle: `${pt.date} (Day ${pt.elapsedDays})`,
        });
      });
    } else {
      // Group historical points by week or month
      const groups = new Map<string, {
        key: string;
        displayLabel: string;
        tooltipTitle: string;
        date: string;
        elapsedDays: number[];
        actualDeterioration: number[];
        regressionTrend: number[];
      }>();

      elapsedData.forEach((pt) => {
        let key: string;
        let displayLabel: string;
        let tooltipTitle: string;

        if (timePeriod === 'weekly') {
          const wk = getWeekBucket(pt.date);
          key = wk.key;
          displayLabel = wk.label;
          tooltipTitle = `Week ${wk.rangeLabel}`;
        } else {
          const mo = getMonthBucket(pt.date);
          key = mo.key;
          displayLabel = mo.label;
          tooltipTitle = mo.fullLabel;
        }

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            displayLabel,
            tooltipTitle,
            date: pt.date,
            elapsedDays: [],
            actualDeterioration: [],
            regressionTrend: [],
          });
        }

        const g = groups.get(key)!;
        g.elapsedDays.push(pt.elapsedDays);
        g.actualDeterioration.push(pt.deterioration);
        if (pt.fitted !== null) g.regressionTrend.push(pt.fitted);
      });

      const avg = (arr: number[]) => (arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null);

      groups.forEach((g) => {
        points.push({
          date: g.date,
          displayLabel: g.displayLabel,
          elapsedDays: Math.round(g.elapsedDays.reduce((a, b) => a + b, 0) / g.elapsedDays.length),
          actualDeterioration: avg(g.actualDeterioration),
          regressionTrend: avg(g.regressionTrend),
          projectedTrend: null,
          isForecast: false,
          tooltipTitle: `${g.tooltipTitle} • Rata-rata ${g.actualDeterioration.length} data harian`,
        });
      });
    }

    // 2. If forecast is available, append projection points up to threshold crossing
    if (
      activeFc.status === 'FORECAST AVAILABLE' &&
      activeFc.daysToThreshold !== null &&
      activeFc.daysToThreshold > 0 &&
      activeFc.slope !== null &&
      activeFc.intercept !== null &&
      activeFc.estimatedDate &&
      elapsedData.length > 0
    ) {
      const lastPt = elapsedData[elapsedData.length - 1];
      const lastDate = new Date(lastPt.date + 'T00:00:00');
      const totalDays = activeFc.daysToThreshold;

      // Smooth connection: set projectedTrend on last historical point
      if (points.length > 0) {
        const lastIdx = points.length - 1;
        points[lastIdx].projectedTrend = points[lastIdx].regressionTrend ?? points[lastIdx].actualDeterioration;
      }

      // Add intermediate projection steps
      const steps = Math.min(totalDays, 4);
      for (let s = 1; s <= steps; s++) {
        const addedDays = Math.round((totalDays / steps) * s);
        if (addedDays === 0) continue;

        const projDate = new Date(lastDate);
        projDate.setDate(projDate.getDate() + addedDays);
        const projDateStr = projDate.toISOString().slice(0, 10);
        const projElapsed = lastPt.elapsedDays + addedDays;

        const isCrossing = s === steps;
        // On final crossing point, value equals the threshold
        const projVal = isCrossing
          ? activeFc.threshold
          : Number((activeFc.slope * projElapsed + activeFc.intercept).toFixed(2));

        let displayLabel = projDateStr.slice(5) + (isCrossing ? ' (Target)' : ' (est)');
        if (timePeriod === 'weekly') {
          const wk = getWeekBucket(projDateStr);
          displayLabel = `${wk.label}${isCrossing ? ' (Target)' : ''}`;
        } else if (timePeriod === 'monthly') {
          const mo = getMonthBucket(projDateStr);
          displayLabel = `${mo.label}${isCrossing ? ' (Target)' : ''}`;
        }

        points.push({
          date: projDateStr,
          displayLabel,
          elapsedDays: projElapsed,
          actualDeterioration: null,
          regressionTrend: null,
          projectedTrend: projVal,
          isForecast: true,
          isThresholdCrossing: isCrossing,
          tooltipTitle: `Estimasi Proyeksi: ${projDateStr} (Hari ke-${projElapsed})`,
        });
      }
    }

    return points;
  }, [dailyRecords, activeFc, timePeriod]);

  return (
    <div className="bg-white rounded-md border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Water Washing Early Warning Forecast
            </h3>
          </div>
        </div>

        {isHistoricalDate && (
          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            {/* Historical Inspection Calibration Toggle */}
            <div className="inline-flex rounded border border-amber-300 p-0.5 bg-amber-50 text-xs items-center shadow-2xs">
              <button
                type="button"
                onClick={() => setSyncToHistoricalDate(true)}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  syncToHistoricalDate
                    ? 'bg-amber-600 text-white shadow-2xs font-bold'
                    : 'text-amber-800 hover:text-amber-950'
                }`}
                title={`Forecast dikalibrasi hanya sampai data ${selectedDate}`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Hingga {selectedDate}</span>
              </button>
              <button
                type="button"
                onClick={() => setSyncToHistoricalDate(false)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  !syncToHistoricalDate
                    ? 'bg-white text-slate-900 shadow-2xs font-bold border border-slate-200'
                    : 'text-amber-800 hover:text-amber-950'
                }`}
                title="Lihat status forecast menggunakan seluruh data sampai tanggal terbaru"
              >
                Data Siklus Penuh
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historical Calibration Informative Banner */}
      {shouldScopeToSelectedDate && (
        <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-md text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-900">Historical Snapshot Active ({selectedDate}):</span>{' '}
              Forecast regresi linear dikalibrasi menggunakan data input harian sampai tanggal <strong>{selectedDate}</strong>.{' '}
              {snapshotInfo.reachedNames ? (
                <>
                  Pada titik ini, parameter <strong>{snapshotInfo.reachedNames}</strong> telah melampaui batas ambang.
                  {' '}Hasil forecast sepenuhnya konsisten dengan status <strong className={snapshotInfo.badgeClass}>{snapshotInfo.statusText}</strong> di atas.
                </>
              ) : (
                <>
                  Pada titik ini, seluruh parameter masih berada dalam batas normal.
                  {' '}Hasil forecast sepenuhnya konsisten dengan status <strong className={snapshotInfo.badgeClass}>{snapshotInfo.statusText}</strong> di atas.
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSyncToHistoricalDate(false)}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold text-[11px] shrink-0 transition-colors self-start sm:self-auto shadow-2xs"
          >
            Bandingkan Siklus Penuh
          </button>
        </div>
      )}

      {/* Main Forecast Highlight Banner: "Berapa hari lagi sampai Water Wash selanjutnya" */}
      {!hasBaseline ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex items-center gap-2.5">
          <HelpCircle className="w-5 h-5 text-slate-400 shrink-0" />
          <div>
            <span className="font-semibold text-slate-800">Forecast Tidak Tersedia:</span> Baseline aktif belum dikonfigurasi. Harap tentukan baseline terlebih dahulu.
          </div>
        </div>
      ) : waterWashStatus === 'DUE_NOW' ? (
        /* CASE 1: FULL CONDITION SATISFIED: PR AND P3.0 AND (NPHR OR Real Power) -> 12 JAM OPERASI / 3 HARI LAGI */
        <div className="p-4 rounded-md bg-gradient-to-r from-rose-50 via-rose-100/75 to-amber-50 border-2 border-rose-400 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-16 h-16 rounded-full bg-rose-600 text-white flex flex-col items-center justify-center shrink-0 shadow-md ring-4 ring-rose-200 font-black">
              <span className="text-base leading-none font-black">
                {runningHours !== null ? runningHours : 12}
              </span>
              <span className="text-[8px] font-extrabold uppercase tracking-wider mt-0.5 text-rose-100 text-center leading-tight">
                Jam Operasi
              </span>
              <span className="text-[8px] font-bold text-rose-200 leading-none mt-0.5">
                ({forecastWW !== null ? (forecastWW === 0 ? 'Hari-H' : `${forecastWW} Hari`) : '3 Hari'})
              </span>
            </div>
            <div>
              <div className="text-base sm:text-lg font-black text-rose-950">
                Water Wash Selanjutnya: <span className="text-rose-700 underline decoration-rose-400 decoration-2">
                  {runningHours !== null ? `${runningHours} Jam Operasi` : '12 Jam Operasi'}
                </span>
                {forecastWW === 0 ? (
                  <span className="text-rose-900 font-bold text-sm sm:text-base ml-1">
                    {' '}(Lakukan Water Wash Segera)
                  </span>
                ) : (
                  <>
                    <span className="text-rose-900 font-bold text-sm sm:text-base ml-1">
                      ({forecastWW !== null ? `${forecastWW} Hari Lagi` : '3 Hari Lagi'})
                    </span>
                    {forecastWWDate && (
                      <span className="text-rose-900 font-semibold text-sm sm:text-base">
                        {' '}(Target: {forecastWWDate})
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-rose-800 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="bg-rose-100 text-rose-900 px-2 py-0.5 rounded font-semibold border border-rose-300 text-[11px]">
                  Asumsi: {rhPerDay} Jam Operasi / Hari
                </span>
                <span className="text-rose-400">•</span>
                <span>
                  {forecastWW !== null && forecastWW > 0
                    ? `Sisa ${forecastWW} hari kalender prosedur persiapan & cooldown`
                    : 'Target tanggal pelaksanaan tercapai — laksanakan Water Wash'}
                </span>
                {baselineDate && (
                  <>
                    <span className="text-rose-400">•</span>
                    <span>Baseline: <strong>{baselineDate} (Day 0)</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs bg-white/95 border border-rose-300 px-3.5 py-2.5 rounded shadow-2xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <div className="font-extrabold text-rose-950">Rekomendasi:</div>
                <div className="text-rose-700 font-bold">Water Wash Segera</div>
              </div>
            </div>
          </div>
        </div>
      ) : waterWashStatus === 'PROJECTED' && forecastWW !== null ? (
        /* CASE 2: PROJECTED THRESHOLD CROSSING -> ~X RUNNING HOURS (ASUMSI 4 JAM/HARI) */
        <div className={`p-4 rounded-md shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 border ${
          isPantauOperationalState
            ? 'bg-gradient-to-r from-amber-50/95 via-sky-50/60 to-slate-50 border-amber-300'
            : 'bg-gradient-to-r from-sky-50/95 via-blue-50/70 to-indigo-50/50 border-sky-300'
        }`}>
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-16 h-16 rounded-full text-white flex flex-col items-center justify-center shrink-0 shadow-md font-black ring-4 ${
              isPantauOperationalState || isPantauCapped
                ? 'bg-amber-600 ring-amber-200'
                : 'bg-sky-600 ring-sky-200'
            }`}>
              <span className="text-base leading-none font-black">~{runningHours}</span>
              <span className="text-[8px] font-extrabold uppercase tracking-wider mt-0.5 text-sky-100 text-center leading-tight">
                Jam Operasi
              </span>
              <span className="text-[8px] font-bold text-sky-200 leading-none mt-0.5">
                (~{forecastWW} Hari)
              </span>
            </div>
            <div>
              <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>
                  {isPantauOperationalState || isPantauCapped ? (
                    <>
                      Water Wash Selanjutnya:{' '}
                      <span className={isPantauCapped ? 'text-amber-800 font-black' : 'text-sky-700 font-black'}>
                        ~{runningHours} Jam Operasi
                      </span>
                    </>
                  ) : (
                    <>
                      Periode Pemantauan Tren:{' '}
                      <span className="text-sky-700 font-black">~{runningHours} Jam Operasi</span>
                    </>
                  )}
                  <span className="text-slate-600 font-bold text-sm sm:text-base ml-1">
                    (~{forecastWW} Hari Lagi)
                  </span>
                  {forecastWWDate && (
                    <span className="text-slate-600 font-semibold text-sm sm:text-base">
                      {' '}(Estimasi: {forecastWWDate})
                    </span>
                  )}
                  {isPantauCapped && (
                    <button
                      type="button"
                      onClick={() => setShowPantauDetail((prev) => !prev)}
                      className="inline-flex items-center justify-center w-5 h-5 ml-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-full transition-colors cursor-pointer align-middle"
                      title={showPantauDetail ? 'Sembunyikan informasi batas jendela Caution' : 'Informasi: Dibatasi jendela Caution (maks. 15 hari / 60 jam operasi)'}
                    >
                      <Info className="w-3 h-3" />
                    </button>
                  )}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="bg-sky-50 text-sky-900 px-2 py-0.5 rounded font-semibold border border-sky-200 text-[11px]">
                  Asumsi: <strong>{rhPerDay} Jam Operasi (Running Hours) / Hari</strong>
                </span>

                {baselineDate && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span>Baseline: <strong>{baselineDate} (Day 0)</strong></span>
                  </>
                )}
              </div>

              {/* Alert explanation if Pantau ceiling cap is active (Hidden by default, toggleable via Info icon) */}
              {isPantauCapped && showPantauDetail && (
                <div className="mt-2 text-[11px] text-amber-950 bg-amber-100/80 border border-amber-300 px-3 py-1.5 rounded flex items-start justify-between gap-2 shadow-2xs animate-in fade-in duration-150">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Dibatasi Jendela Caution (Maks. {pantauCapDays || 15} Hari / {pantauCapHours || 60} Jam Operasi):</span>{' '}
                      <span>
                        Unit saat ini berada dalam <strong>Status Caution</strong> (bobot lolos ambang batas telah mencapai &ge;50% dengan parameter <strong>{reachedParameters.length > 0 ? reachedParameters.map((p) => getParamLabel(p)).join(', ') : 'PR, P3.0'}</strong> melampaui ambang batas). Proyeksi regresi linier dibatasi maksimal <strong>{pantauCapDays || 15} hari ({pantauCapHours || 60} jam operasi)</strong> dengan pertimbangan historis operasional: siklus pemicu Water Wash tercepat adalah <strong>22 hari (88 jam)</strong>, dikurangi <strong>7 hari (28 jam)</strong> minimum observasi regresi (22 &minus; 7 = <strong>15 hari / 60 jam</strong>) untuk menjamin waktu persiapan Water Wash tetap aman dan proporsional.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPantauDetail(false)}
                    className="p-0.5 text-amber-700 hover:text-amber-950 rounded hover:bg-amber-200/60 shrink-0 transition-colors"
                    title="Tutup detail"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

            </div>
          </div>

          {isPantauOperationalState && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 self-start md:self-auto">
              <div className="flex items-center gap-2.5 text-xs bg-white/95 border border-sky-200 px-3.5 py-2.5 rounded shadow-2xs">
                <Clock className="w-5 h-5 text-sky-600 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-900">Rekomendasi:</span>{' '}
                  {forecastWW <= 4 ? (
                    <span className="text-rose-700 font-bold">Siapkan jadwal Off-line WW</span>
                  ) : (
                    <span className="text-amber-700 font-semibold">Caution: Perhatikan kondisi operasi</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : dailyRecords.length < MIN_FORECAST_OBSERVATIONS ? (
        /* CASE 3: INSUFFICIENT DATA -> MEMBUTUHKAN N DATA LAGI */
        <div className="p-4 bg-amber-50/90 border border-amber-300 rounded text-xs text-amber-950 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-amber-600 text-white flex flex-col items-center justify-center shrink-0 shadow-md font-black ring-4 ring-amber-200">
              <span className="text-base leading-none">{dailyRecords.length}/{MIN_FORECAST_OBSERVATIONS}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 text-amber-100">Data</span>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-2">
                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                  MENUNGGU DATA
                </span>
              </div>
              <div className="text-base font-extrabold text-amber-950 mt-0.5">
                Water Wash Selanjutnya: <span className="text-amber-800">Menunggu Tambahan {MIN_FORECAST_OBSERVATIONS - dailyRecords.length} Data Harian</span>
              </div>
              <p className="text-amber-800 text-xs mt-1">
                Dibutuhkan minimal {MIN_FORECAST_OBSERVATIONS} data harian pada siklus ini untuk menghitung regresi linear secara andal. Saat ini baru tersedia {dailyRecords.length} data harian.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold bg-white text-amber-800 border border-amber-200 px-3 py-1.5 rounded shrink-0 self-start md:self-auto">
            {dailyRecords.length} / {MIN_FORECAST_OBSERVATIONS} Observasi
          </span>
        </div>
      ) : (
        /* CASE 4: TREND NOT INCREASING (SLOPE <= 0) -> >120 JAM OPERASI / >30 HARI (KONDISI STABIL) */
        <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded text-xs text-emerald-950 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex flex-col items-center justify-center shrink-0 shadow-md font-black ring-4 ring-emerald-200">
              <span className="text-sm leading-none font-black">&gt;120</span>
              <span className="text-[8px] font-extrabold uppercase tracking-wider mt-0.5 text-emerald-100 text-center leading-tight">
                Jam Operasi
              </span>
              <span className="text-[8px] font-bold text-emerald-200 leading-none mt-0.5">
                (&gt;30 Hari)
              </span>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full">
                  KONDISI STABIL
                </span>
              </div>
              <div className="text-base font-extrabold text-emerald-950 mt-0.5">
                Water Wash Selanjutnya: <span className="text-emerald-700">Belum Diperlukan (&gt;120 Jam Operasi / &gt;30 Hari Lagi)</span>
              </div>
              <p className="text-emerald-800 text-xs mt-1">
                Laju penurunan performa (slope) pada parameter kunci stabil atau membaik (≤ 0). Kriteria PR AND P3.0 AND (NPHR OR Real Power) tidak diproyeksikan tercapai dalam waktu dekat (asumsi operasional {rhPerDay} jam/hari).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs bg-white/90 border border-emerald-200 px-3 py-2 rounded self-start md:self-auto">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-slate-700 font-medium">Performa Kompresor Stabil</span>
          </div>
        </div>
      )}

      {/* 3-Day Parameter Projection Trend Section */}
      {hasBaseline && projectionSummary && (
        <ThreeDayProjectionSection
          forecastSummary={activeSummary}
          projectionSummary={projectionSummary}
        />
      )}

      {/* Parameter Selector & Metrics Summary Bar */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/80 p-2.5 rounded border border-slate-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 mr-1">Pilih Parameter:</span>

            {/* Option to show All 4 Parameters in one look */}
            <button
              type="button"
              onClick={() => setSelectedParamChart('ALL')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-all ${
                selectedParamChart === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-extrabold border border-slate-300 ring-1 ring-sky-500'
                  : 'text-slate-600 bg-white/70 hover:bg-white border border-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-sky-600" />
              <span>Semua Parameter</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  waterWashStatus === 'DUE_NOW'
                    ? 'bg-rose-600 text-white'
                    : waterWashStatus === 'PROJECTED'
                    ? 'bg-sky-600 text-white'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {waterWashStatus === 'DUE_NOW'
                  ? (runningHours !== null ? `${runningHours} Jam (${forecastWW} Hari)` : '12 Jam (3 Hari)')
                  : runningHours !== null
                  ? `~${runningHours} Jam (~${forecastWW} Hari)`
                  : '>120 Jam (>30 Hari)'}
              </span>
            </button>

            {(['PR', 'P3_0', 'NPHR', 'realPower'] as const).map((param) => {
              const fc = parameters[param];
              const isSelected = selectedParamChart === param;
              const isGoverning = governingParameter === param;
              const paramHours = fc.hoursToThreshold || (fc.daysToThreshold ? fc.daysToThreshold * 4 : null);

              return (
                <button
                  key={param}
                  type="button"
                  onClick={() => setSelectedParamChart(param)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-all ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold border border-slate-300 ring-1 ring-sky-400'
                      : 'text-slate-600 bg-white/70 hover:bg-white border border-slate-200'
                  }`}
                >
                  {getParamIcon(param)}
                  <span>{getParamLabel(param)}</span>
                  {fc.status === 'THRESHOLD REACHED' ? (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-600 text-white">
                      0 Jam (REACHED)
                    </span>
                  ) : fc.daysToThreshold !== null && fc.daysToThreshold > 0 ? (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        isGoverning
                          ? 'bg-sky-600 text-white'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      ~{paramHours} Jam (~{fc.daysToThreshold} Hari) {isGoverning ? '• Penentu' : ''}
                    </span>
                  ) : fc.status === 'INSUFFICIENT DATA' ? (
                    <span className="text-[10px] text-amber-700 bg-amber-100 px-1 py-0.2 rounded font-medium">
                      Perlu Data
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-medium">
                      &gt;120 Jam (&gt;30 Hari)
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right side controls: Time Period and View/Metric indicators */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Time Period Selector: Daily / Weekly / Monthly */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold text-[11px] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Periode:</span>
              </span>
              <div className="inline-flex bg-slate-200/80 p-0.5 rounded border border-slate-300">
                <button
                  type="button"
                  onClick={() => setTimePeriod('daily')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    timePeriod === 'daily'
                      ? 'bg-white text-sky-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Tampilkan data per hari (Daily)"
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('weekly')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    timePeriod === 'weekly'
                      ? 'bg-white text-sky-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Tampilkan rata-rata mingguan (Weekly)"
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('monthly')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    timePeriod === 'monthly'
                      ? 'bg-white text-sky-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Tampilkan rata-rata bulanan (Monthly)"
                >
                  Monthly
                </button>
              </div>
            </div>

            {selectedParamChart === 'ALL' ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium text-[11px] hidden sm:inline">Tampilan:</span>
                <div className="inline-flex bg-slate-200/80 p-0.5 rounded border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setAllViewMode('combined')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                      allViewMode === 'combined'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-sky-600" />
                    <span>Grafik Gabungan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllViewMode('grid')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                      allViewMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-sky-600" />
                    <span>Grid 4 Card</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Fixed Limit:</span>
                  <strong className="text-rose-600 font-bold">{activeFc.threshold}%</strong>
                </div>
                {activeFc.currentDeterioration !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Current:</span>
                    <strong
                      className={
                        activeFc.status === 'THRESHOLD REACHED'
                          ? 'text-rose-700 font-black'
                          : 'text-slate-800'
                      }
                    >
                      {activeFc.currentDeterioration}%
                    </strong>
                  </div>
                )}
                {activeFc.slope !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Slope (b):</span>
                    <strong
                      className={
                        activeFc.slope > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700'
                      }
                      title={`Laju degradasi per hari dan per jam operasi (${rhPerDay} jam/hari)`}
                    >
                      {activeFc.slope > 0 ? '+' : ''}
                      {activeFc.slope} %/hari ({activeFc.slopePerHour !== undefined ? activeFc.slopePerHour : (activeFc.slope / rhPerDay).toFixed(4)} %/jam)
                    </strong>
                  </div>
                )}
                {activeFc.rSquared !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">R²:</span>
                    <strong className="text-slate-800">{activeFc.rSquared}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Forecast Status Notice */}
        {selectedParamChart === 'ALL' ? (
          <div className="flex items-center justify-between text-xs px-1 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-sky-600" />
                Semua Parameter (All 4 Parameters Overview)
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">
                Logika: <strong>MAX(PR, P3.0, MIN(NPHR, Real Power))</strong>
              </span>
              {governingParameter && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-sky-800 font-semibold">
                    Penentu Utama: <strong>{getParamLabel(governingParameter)}</strong> ({waterWashStatus === 'DUE_NOW' ? (runningHours !== null ? `${runningHours} Jam (Due Now • ${forecastWW} Hari Lagi)` : '12 Jam (Due Now • 3 Hari)') : runningHours !== null ? `~${runningHours} Jam (~${forecastWW} Hari)` : '>120 Jam'})
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-[11px] flex-wrap">
              <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Periode: {timePeriod === 'daily' ? 'Harian (Daily)' : timePeriod === 'weekly' ? 'Mingguan (Weekly avg)' : 'Bulanan (Monthly avg)'}
              </span>
              <span>
                Ambang Batas: PR ({FIXED_FORECAST_THRESHOLDS.PR}%), P3.0 ({FIXED_FORECAST_THRESHOLDS.P3_0}%), NPHR ({FIXED_FORECAST_THRESHOLDS.NPHR}%), Real Power ({FIXED_FORECAST_THRESHOLDS.realPower}%)
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs px-1 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">{activeFc.displayName}</span>
              <span className="text-slate-400">•</span>
              <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                Periode: {timePeriod === 'daily' ? 'Harian (Daily)' : timePeriod === 'weekly' ? 'Mingguan (Weekly avg)' : 'Bulanan (Monthly avg)'}
              </span>
              <span className="text-slate-400">•</span>
              {activeFc.status === 'THRESHOLD REACHED' ? (
                <span className="text-rose-700 font-black flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Water Wash: 0 Jam (0 Hari) — Ambang batas telah tercapai (Current {activeFc.currentDeterioration}% ≥ Limit {activeFc.threshold}%)
                </span>
              ) : activeFc.status === 'FORECAST AVAILABLE' && activeFc.daysToThreshold !== null ? (
                <span className="text-sky-800 font-bold flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-sky-600" />
                  Water Wash: ~{activeFc.hoursToThreshold || activeFc.daysToThreshold * 4} Jam Operasi (~{activeFc.daysToThreshold} Hari Lagi)
                  {activeFc.estimatedDate && (
                    <span className="text-slate-600 font-normal">
                      (estimasi tanggal: <strong>{activeFc.estimatedDate}</strong>)
                    </span>
                  )}
                </span>
              ) : activeFc.status === 'NO PROJECTED THRESHOLD CROSSING' ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Water Wash: &gt;120 Jam Operasi (&gt;30 Hari Lagi) (Tren deteriorasi stabil / membaik, slope: {activeFc.slope}%/hari)
                </span>
              ) : (
                <span className="text-amber-700 italic flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  Menunggu data observasi ({activeFc.validDaysCount}/{MIN_FORECAST_OBSERVATIONS} data tersedia)
                </span>
              )}
            </div>
            {activeFc.remainingDeterioration !== null && activeFc.status !== 'THRESHOLD REACHED' && (
              <span className="text-slate-500">
                Sisa toleransi: <strong className="text-slate-800 font-bold">{activeFc.remainingDeterioration} pp</strong>
              </span>
            )}
          </div>
        )}

        {/* Chart Container */}
        {selectedParamChart === 'ALL' ? (
          allViewMode === 'combined' ? (
            <div className="space-y-3">
              {/* All 4 Parameters Combined LineChart */}
              <div className="h-80 w-full bg-slate-50/40 rounded border border-slate-200 p-2">
                {allChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No daily observations available in the current Water Washing cycle.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={allChartData} margin={{ top: 10, right: 35, left: 10, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="displayLabel"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={{ stroke: '#cbd5e1' }}
                        label={{
                          value:
                            timePeriod === 'daily'
                              ? 'Date (Daily - Current Water Washing Cycle)'
                              : timePeriod === 'weekly'
                              ? 'Week (Weekly Aggregation - Current Water Washing Cycle)'
                              : 'Month (Monthly Aggregation - Current Water Washing Cycle)',
                          position: 'insideBottom',
                          offset: -12,
                          fontSize: 10,
                          fill: '#94a3b8',
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={{ stroke: '#cbd5e1' }}
                        unit="%"
                        label={{
                          value: 'Deterioration (%)',
                          angle: -90,
                          position: 'insideLeft',
                          fontSize: 10,
                          fill: '#94a3b8',
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '11px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(val: any, name: any) => {
                          if (val === null || val === undefined) return ['—', name];
                          return [`${Number(val).toFixed(2)}%`, name];
                        }}
                        labelFormatter={(label: any, payload: any) => {
                          const item = payload?.[0]?.payload;
                          if (!item) return label;
                          if (item.tooltipTitle) return item.tooltipTitle;
                          return `${item.date} (Day ${item.elapsedDays})`;
                        }}
                      />
                      {/* Placed at top right with generous height so it never collides with X-axis */}
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={32}
                        iconType="plainline"
                        wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
                      />

                      {/* Threshold Reference Lines */}
                      <ReferenceLine
                        y={FIXED_FORECAST_THRESHOLDS.PR}
                        stroke="#0284c7"
                        strokeDasharray="3 3"
                        label={{
                          value: `Limit PR & P3.0 (${FIXED_FORECAST_THRESHOLDS.PR}%)`,
                          fill: '#0284c7',
                          fontSize: 9,
                          position: 'insideTopLeft',
                        }}
                      />
                      <ReferenceLine
                        y={FIXED_FORECAST_THRESHOLDS.NPHR}
                        stroke="#d97706"
                        strokeDasharray="3 3"
                        label={{
                          value: `Limit NPHR (${FIXED_FORECAST_THRESHOLDS.NPHR}%)`,
                          fill: '#d97706',
                          fontSize: 9,
                          position: 'insideTopLeft',
                        }}
                      />
                      <ReferenceLine
                        y={FIXED_FORECAST_THRESHOLDS.realPower}
                        stroke="#059669"
                        strokeDasharray="3 3"
                        label={{
                          value: `Limit Real Power (${FIXED_FORECAST_THRESHOLDS.realPower}%)`,
                          fill: '#059669',
                          fontSize: 9,
                          position: 'insideTopLeft',
                        }}
                      />

                      {/* Selected Inspection Date Marker */}
                      {selectedDate && (
                        <ReferenceLine
                          x={
                            timePeriod === 'weekly'
                              ? getWeekBucket(selectedDate).label
                              : timePeriod === 'monthly'
                              ? getMonthBucket(selectedDate).label
                              : selectedDate.slice(5)
                          }
                          stroke="#0284c7"
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          label={{
                            value: `Inspecting: ${selectedDate}`,
                            fill: '#0284c7',
                            fontSize: 9,
                            fontWeight: 'bold',
                            position: 'insideTopRight',
                          }}
                        />
                      )}

                      {/* 4 Trend Lines - clean line representation without bulky dots */}
                      <Line
                        type="monotone"
                        dataKey="PR"
                        name={`PR (Limit: ${FIXED_FORECAST_THRESHOLDS.PR}%)`}
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="P3_0"
                        name={`P3.0 (Limit: ${FIXED_FORECAST_THRESHOLDS.P3_0}%)`}
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="NPHR"
                        name={`NPHR (Limit: ${FIXED_FORECAST_THRESHOLDS.NPHR}%)`}
                        stroke="#d97706"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="realPower"
                        name={`Real Power (Limit: ${FIXED_FORECAST_THRESHOLDS.realPower}%)`}
                        stroke="#059669"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ) : (
            /* All 4 Parameters Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(['PR', 'P3_0', 'NPHR', 'realPower'] as const).map((param) => {
                const fc = parameters[param];
                const isGoverning = governingParameter === param;
                const rawPts = (fc.elapsedDaysData || []).map((pt) => ({
                  date: pt.date,
                  displayLabel: pt.date.length > 5 ? pt.date.slice(5) : pt.date,
                  actual: Number(pt.deterioration.toFixed(2)),
                  fitted: pt.fitted !== null ? Number(pt.fitted.toFixed(2)) : null,
                }));

                const miniData = timePeriod === 'daily'
                  ? rawPts
                  : (() => {
                      const groups = new Map<string, { label: string; actual: number[]; fitted: number[] }>();
                      rawPts.forEach((pt) => {
                        const key = timePeriod === 'weekly' ? getWeekBucket(pt.date).key : getMonthBucket(pt.date).key;
                        const label = timePeriod === 'weekly' ? getWeekBucket(pt.date).label : getMonthBucket(pt.date).label;
                        if (!groups.has(key)) groups.set(key, { label, actual: [], fitted: [] });
                        const g = groups.get(key)!;
                        g.actual.push(pt.actual);
                        if (pt.fitted !== null) g.fitted.push(pt.fitted);
                      });
                      const avg = (arr: number[]) => (arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null);
                      return Array.from(groups.values()).map((g) => ({
                        date: g.label,
                        displayLabel: g.label,
                        actual: avg(g.actual) ?? 0,
                        fitted: avg(g.fitted),
                      }));
                    })();

                return (
                  <div
                    key={param}
                    className="p-3 bg-white rounded border border-slate-200 shadow-2xs space-y-2 hover:border-sky-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        {getParamIcon(param)}
                        <span>{getParamLabel(param)}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          (Ambang: {fc.threshold}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {fc.status === 'THRESHOLD REACHED' ? (
                          <span className="text-[10px] font-black bg-rose-600 text-white px-1.5 py-0.2 rounded">
                            0 Hari (REACHED)
                          </span>
                        ) : fc.daysToThreshold !== null && fc.daysToThreshold > 0 ? (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              isGoverning ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            ~{fc.daysToThreshold} Hari {isGoverning ? '• Penentu' : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                            &gt;30 Hari (Stabil)
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedParamChart(param)}
                          className="text-[10px] text-sky-600 hover:text-sky-800 hover:underline ml-1"
                        >
                          Fokus
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-1.5 rounded">
                      <div>
                        Deteriorasi:{' '}
                        <strong
                          className={
                            fc.status === 'THRESHOLD REACHED'
                              ? 'text-rose-700 font-black'
                              : 'text-slate-900 font-bold'
                          }
                        >
                          {fc.currentDeterioration !== null ? `${fc.currentDeterioration}%` : '—'}
                        </strong>
                      </div>
                      <div>
                        Slope:{' '}
                        <strong
                          className={
                            fc.slope !== null && fc.slope > 0 ? 'text-rose-600' : 'text-slate-700'
                          }
                        >
                          {fc.slope !== null ? `${fc.slope > 0 ? '+' : ''}${fc.slope}%/hari` : '—'}
                        </strong>
                      </div>
                      {fc.rSquared !== null && (
                        <div>
                          R²: <strong>{fc.rSquared}</strong>
                        </div>
                      )}
                    </div>

                    <div className="h-32 w-full pt-1">
                      {miniData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[10px] text-slate-400">
                          Tidak ada data harian
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={miniData} margin={{ top: 5, right: 15, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="displayLabel" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} unit="%" />
                            <ReferenceLine
                              y={fc.threshold}
                              stroke="#dc2626"
                              strokeDasharray="3 3"
                              label={{ value: `${fc.threshold}%`, fill: '#dc2626', fontSize: 9, position: 'insideTopRight' }}
                            />
                            <Line
                              type="monotone"
                              dataKey="actual"
                              name={getParamLabel(param)}
                              stroke={
                                param === 'PR'
                                  ? '#0284c7'
                                  : param === 'P3_0'
                                  ? '#7c3aed'
                                  : param === 'NPHR'
                                  ? '#d97706'
                                  : '#059669'
                              }
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                            {fc.slope !== null && (
                              <Line
                                type="linear"
                                dataKey="fitted"
                                stroke="#64748b"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                dot={false}
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Single Parameter Forecast Graph */
          <div className="h-72 w-full bg-slate-50/40 rounded border border-slate-200 p-2">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No daily observations available in the current Water Washing cycle.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 35 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="displayLabel"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={{ stroke: '#cbd5e1' }}
                    label={{
                      value:
                        timePeriod === 'daily'
                          ? 'Date (Daily - Current Water Washing Cycle)'
                          : timePeriod === 'weekly'
                          ? 'Week (Weekly Aggregation - Current Water Washing Cycle)'
                          : 'Month (Monthly Aggregation - Current Water Washing Cycle)',
                      position: 'insideBottom',
                      offset: -12,
                      fontSize: 10,
                      fill: '#94a3b8',
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={{ stroke: '#cbd5e1' }}
                    unit="%"
                    domain={[
                      (dataMin: number) => Math.floor(Math.min(0, dataMin)),
                      (dataMax: number) =>
                        Math.ceil(Math.max(activeFc.threshold + 0.5, dataMax + 0.5)),
                    ]}
                    label={{
                      value: 'Deterioration (%)',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 10,
                      fill: '#94a3b8',
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '11px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(val: any, name: any) => {
                      if (val === null || val === undefined) return ['—', name];
                      return [`${Number(val).toFixed(2)}%`, name];
                    }}
                    labelFormatter={(label: any, payload: any) => {
                      const item = payload?.[0]?.payload;
                      if (!item) return label;
                      if (item.tooltipTitle) return item.tooltipTitle;
                      return `${item.date} (Day ${item.elapsedDays}${item.isForecast ? ' • Projected' : ''})`;
                    }}
                  />

                  {/* Legend positioned at TOP right with dedicated height - completely avoids bottom XAxis collision */}
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={32}
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
                  />

                  {/* Fixed Threshold Line */}
                  <ReferenceLine
                    y={activeFc.threshold}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    label={{
                      value: `Threshold (${activeFc.threshold}%)`,
                      fill: '#dc2626',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />

                  {/* Projected crossing date marker if available */}
                  {activeFc.estimatedDate && activeFc.daysToThreshold !== null && (
                    <ReferenceLine
                      x={
                        timePeriod === 'weekly'
                          ? `${getWeekBucket(activeFc.estimatedDate).label} (Target)`
                          : timePeriod === 'monthly'
                          ? `${getMonthBucket(activeFc.estimatedDate).label} (Target)`
                          : activeFc.estimatedDate.slice(5) + ' (Target)'
                      }
                      stroke="#7c3aed"
                      strokeDasharray="3 3"
                      label={{
                        value: `~${activeFc.daysToThreshold}d (${activeFc.estimatedDate})`,
                        fill: '#7c3aed',
                        fontSize: 10,
                        position: 'insideTopLeft',
                      }}
                    />
                  )}

                  {/* Selected Inspection Date Marker */}
                  {selectedDate && (
                    <ReferenceLine
                      x={
                        timePeriod === 'weekly'
                          ? getWeekBucket(selectedDate).label
                          : timePeriod === 'monthly'
                          ? getMonthBucket(selectedDate).label
                          : selectedDate.slice(5)
                      }
                      stroke="#0284c7"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      label={{
                        value: `Inspecting: ${selectedDate}`,
                        fill: '#0284c7',
                        fontSize: 9,
                        fontWeight: 'bold',
                        position: 'insideTopRight',
                      }}
                    />
                  )}

                  {/* Actual deterioration points - clean continuous line */}
                  <Line
                    type="monotone"
                    dataKey="actualDeterioration"
                    name={
                      timePeriod === 'daily'
                        ? 'Actual Daily Deterioration'
                        : timePeriod === 'weekly'
                        ? 'Actual Weekly Deterioration (avg)'
                        : 'Actual Monthly Deterioration (avg)'
                    }
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                    connectNulls
                  />

                  {/* Fitted regression line D(t) = a + b*t */}
                  {activeFc.slope !== null && (
                    <Line
                      type="linear"
                      dataKey="regressionTrend"
                      name="Fitted Regression Trend D(t)"
                      stroke="#475569"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                    />
                  )}

                  {/* Future Projected Trend */}
                  <Line
                    type="linear"
                    dataKey="projectedTrend"
                    name="Projected Future Trend"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
