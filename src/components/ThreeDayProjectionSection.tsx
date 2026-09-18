import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Zap,
  Activity,
  Flame,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Table as TableIcon,
  Calendar,
  Layers,
  Sliders,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  OverallForecastSummary,
  ThreeDayProjectionSummary,
  ThreeDayProjectionPoint,
} from '../types';

interface ThreeDayProjectionSectionProps {
  forecastSummary: OverallForecastSummary;
  projectionSummary: ThreeDayProjectionSummary;
}

export const ThreeDayProjectionSection: React.FC<ThreeDayProjectionSectionProps> = ({
  forecastSummary,
  projectionSummary,
}) => {
  const [activeView, setActiveView] = useState<'cards' | 'chart' | 'table'>('cards');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const { waterWashStatus, isConditionSatisfied } = forecastSummary;
  const isDueWindow = waterWashStatus === 'DUE_NOW' || isConditionSatisfied;

  const { days, startDate, targetWaterWashDate } = projectionSummary;
  const totalDays = projectionSummary.totalDays || days.length || 3;
  const isMultiDay = totalDays > 3;

  // Day selection for multi-day card view
  const defaultMidpoint = Math.max(1, Math.round(totalDays / 2));
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(defaultMidpoint);
  const [cardsMode, setCardsMode] = useState<'milestones' | 'all'>('milestones');
  const [tableMode, setTableMode] = useState<'milestones' | 'all'>('milestones');

  const selectedDayData = useMemo(() => {
    return days.find((d) => d.dayOffset === selectedDayOffset) || days[Math.min(days.length - 1, defaultMidpoint - 1)] || days[0];
  }, [days, selectedDayOffset, defaultMidpoint]);

  // Distinct middle card for 3 Key Milestones view to prevent duplicate cards
  const middleMilestoneDay = useMemo(() => {
    if (!days.length) return null;
    if (selectedDayOffset > 1 && selectedDayOffset < totalDays) {
      return days.find((d) => d.dayOffset === selectedDayOffset) || null;
    }
    return days.find((d) => d.dayOffset === defaultMidpoint) || days[Math.floor(days.length / 2)] || null;
  }, [days, selectedDayOffset, totalDays, defaultMidpoint]);

  // Chart dataset: H-0 (Terkini) + all days in projection
  const chartData = useMemo(() => {
    return [
      {
        label: 'H-0',
        fullLabel: 'H-0 (Terkini)',
        date: startDate,
        PR: forecastSummary.parameters.PR.currentDeterioration ?? 0,
        P3_0: forecastSummary.parameters.P3_0.currentDeterioration ?? 0,
        NPHR: forecastSummary.parameters.NPHR.currentDeterioration ?? 0,
        realPower: forecastSummary.parameters.realPower.currentDeterioration ?? 0,
      },
      ...days.map((d) => ({
        label: d.dayLabel,
        fullLabel: `${d.dayLabel} (${d.date})`,
        date: d.date,
        PR: d.PR.deterioration,
        P3_0: d.P3_0.deterioration,
        NPHR: d.NPHR.deterioration,
        realPower: d.realPower.deterioration,
      })),
    ];
  }, [startDate, days, forecastSummary.parameters]);

  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Milestone points for multi-day display (e.g. H+1, H+7, H+14, H+21, H+end)
  const milestoneIndices = useMemo(() => {
    if (!isMultiDay) return [0, 1, 2].filter((i) => i < days.length);
    const indices = [0]; // Day 1
    const steps = [7, 14, 21, 28];
    for (const step of steps) {
      if (step < totalDays) {
        indices.push(step - 1);
      }
    }
    if (!indices.includes(days.length - 1)) {
      indices.push(days.length - 1);
    }
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  }, [isMultiDay, totalDays, days.length]);

  // Render an individual daily parameter card
  const renderCard = (day: ThreeDayProjectionPoint, isKeyTarget: boolean = false) => {
    const isTarget = isKeyTarget || day.dayOffset === totalDays;
    const isMidpoint = isMultiDay && day.dayOffset === selectedDayOffset;

    return (
      <div
        key={`${day.dayOffset}-${day.date}`}
        className={`rounded-lg border p-3.5 flex flex-col justify-between transition-all ${
          isTarget
            ? 'bg-gradient-to-b from-rose-50 via-white to-amber-50/60 border-rose-300 shadow-xs ring-1 ring-rose-200'
            : isMidpoint
            ? 'bg-gradient-to-b from-sky-50/70 via-white to-slate-50 border-sky-300 shadow-xs ring-1 ring-sky-200'
            : day.dayOffset === 2 && !isMultiDay
            ? 'bg-gradient-to-b from-amber-50/70 via-white to-slate-50 border-amber-300 shadow-2xs'
            : 'bg-white border-slate-200 shadow-2xs'
        }`}
      >
        {/* Day Header */}
        <div className="border-b border-slate-100 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                  isTarget
                    ? 'bg-rose-600 text-white'
                    : isMidpoint
                    ? 'bg-sky-700 text-white'
                    : day.dayOffset === 2 && !isMultiDay
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-white'
                }`}
              >
                {day.dayLabel}
              </span>
              <span className="text-xs font-bold text-slate-900">
                {formatDateIndo(day.date)}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                isTarget
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : isMidpoint
                  ? 'bg-sky-100 text-sky-900 border-sky-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {isTarget
                ? 'Target Eksekusi WW'
                : day.dayOffset === 1
                ? 'Awal Periode'
                : isMidpoint
                ? (day.dayOffset === defaultMidpoint ? 'Pertengahan' : `Pilihan (H+${day.dayOffset})`)
                : `Hari ke-${day.dayOffset}`}
            </span>
          </div>
          <div className="text-[11px] font-medium text-slate-600 mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{day.focusLabel}</span>
          </div>
        </div>

        {/* Parameters Grid */}
        <div className="mt-3 space-y-2">
          {/* PR */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-50/90 border border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="font-bold text-slate-800">PR:</span>
              <span className="font-mono text-slate-600">{day.PR.projectedValue}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono font-bold ${
                  day.PR.isThresholdExceeded ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                +{day.PR.deterioration}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono">&le;2.5%</span>
            </div>
          </div>

          {/* P3.0 */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-50/90 border border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="font-bold text-slate-800">P3.0:</span>
              <span className="font-mono text-slate-600">{day.P3_0.projectedValue} PSIA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono font-bold ${
                  day.P3_0.isThresholdExceeded ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                +{day.P3_0.deterioration}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono">&le;2.5%</span>
            </div>
          </div>

          {/* NPHR */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-50/90 border border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-bold text-slate-800">NPHR:</span>
              <span className="font-mono text-slate-600">{day.NPHR.projectedValue}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono font-bold ${
                  day.NPHR.isThresholdExceeded ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                +{day.NPHR.deterioration}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono">&le;3.0%</span>
            </div>
          </div>

          {/* Real Power */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-50/90 border border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="font-bold text-slate-800">Power:</span>
              <span className="font-mono text-slate-600">{day.realPower.projectedValue} MW</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono font-bold ${
                  day.realPower.isThresholdExceeded ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                +{day.realPower.deterioration}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono">&ge;4.0%</span>
            </div>
          </div>
        </div>

        {/* Card Footer: Threshold Met Count */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Lolos Ambang:</span>
          <span
            className={`font-bold flex items-center gap-1 ${
              day.thresholdsMetCount >= 3
                ? 'text-rose-700'
                : day.thresholdsMetCount >= 2
                ? 'text-amber-700'
                : 'text-slate-700'
            }`}
          >
            {day.thresholdsMetCount >= 3 ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            )}
            {day.thresholdsMetCount}/4 Parameter
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      id="three-day-projection-section"
      className={`mt-4 rounded-lg border transition-all duration-200 overflow-hidden ${
        isDueWindow
          ? 'bg-gradient-to-b from-rose-50/70 via-white to-amber-50/40 border-rose-300 shadow-xs'
          : 'bg-gradient-to-b from-sky-50/60 via-white to-slate-50/40 border-slate-200 shadow-xs'
      }`}
    >
      {/* Header Banner */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-inherit">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-2xs font-bold ${
              isDueWindow
                ? 'bg-rose-600 text-white ring-2 ring-rose-200'
                : 'bg-sky-600 text-white ring-2 ring-sky-200'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                {isDueWindow
                  ? 'Proyeksi Tren Parameter 3 Hari Menuju Water Wash'
                  : `Proyeksi Tren Parameter ${totalDays} Hari Menuju Water Wash`}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isDueWindow
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-sky-100 text-sky-800 border-sky-300'
                }`}
              >
                {isDueWindow ? 'JENDELA 3 HARI' : `PREDIKSI ${totalDays} HARI`}
              </span>
            </div>
            {targetWaterWashDate && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Target Estimasi: <strong>{formatDateIndo(targetWaterWashDate)}</strong></span>
              </p>
            )}
          </div>
        </div>

        {/* View Switcher & Expand Toggle */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <div className="inline-flex rounded-md p-1 bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveView('cards');
                setIsExpanded(true);
              }}
              className={`px-2.5 py-1 rounded font-semibold transition-all ${
                activeView === 'cards'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kartu Harian
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('chart');
                setIsExpanded(true);
              }}
              className={`px-2.5 py-1 rounded font-semibold transition-all flex items-center gap-1 ${
                activeView === 'chart'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Grafik
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('table');
                setIsExpanded(true);
              }}
              className={`px-2.5 py-1 rounded font-semibold transition-all flex items-center gap-1 ${
                activeView === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Tabel
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
            title={isExpanded ? 'Sembunyikan detail proyeksi' : 'Tampilkan detail proyeksi'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* CARDS VIEW */}
          {activeView === 'cards' && (
            <div>
              {/* Multi-day Control Toolbar */}
              {isMultiDay && (
                <div className="mb-4 p-2.5 sm:p-3 bg-slate-50/80 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  {/* Slider Control for Day Selection */}
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      Pilih Hari:
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={totalDays}
                      value={selectedDayOffset}
                      onChange={(e) => setSelectedDayOffset(Number(e.target.value))}
                      className="w-32 sm:w-44 accent-sky-600 cursor-pointer"
                      title={`Geser untuk memilih hari H+1 s/d H+${totalDays}`}
                    />
                    <span className="font-mono font-bold text-sky-700 px-2 py-0.5 bg-sky-50 rounded border border-sky-200 text-xs">
                      H+{selectedDayOffset}
                    </span>
                  </div>

                  {/* Mode switcher (3 Titik Kunci vs Semua Hari) */}
                  <div className="inline-flex rounded p-0.5 bg-slate-200/80 border border-slate-200 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setCardsMode('milestones')}
                      className={`px-2.5 py-1 rounded font-semibold transition-all ${
                        cardsMode === 'milestones'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      3 Titik Kunci
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardsMode('all')}
                      className={`px-2.5 py-1 rounded font-semibold transition-all ${
                        cardsMode === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua {totalDays} Hari
                    </button>
                  </div>
                </div>
              )}

              {/* Cards Grid */}
              {!isMultiDay ? (
                /* Exactly 3 days (DUE_NOW) */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {days.map((day) => renderCard(day, day.dayOffset === 3))}
                </div>
              ) : cardsMode === 'milestones' ? (
                /* 3 Key Milestone Cards for Multi-Day */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Day 1 (Awal Periode) */}
                  {days[0] && renderCard(days[0], false)}
                  {/* Card 2: Selected Day or Distinct Midpoint */}
                  {middleMilestoneDay && renderCard(middleMilestoneDay, false)}
                  {/* Card 3: Final Target Day */}
                  {days[days.length - 1] && renderCard(days[days.length - 1], true)}
                </div>
              ) : (
                /* All Days Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[580px] overflow-y-auto pr-1">
                  {days.map((day) => renderCard(day, day.dayOffset === totalDays))}
                </div>
              )}
            </div>
          )}

          {/* CHART VIEW */}
          {activeView === 'chart' && (
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3 text-xs text-slate-600">
                <span className="font-bold text-slate-800">
                  Grafik Proyeksi Laju Deteriorasi Parameter (%) — {totalDays} Hari ke Depan
                </span>
                <span className="text-[11px] text-slate-500">
                  Garis putus-putus menunjukkan ambang batas (PR 2.5%, P3.0 2.5%, NPHR 3.0%, Power 4.0%)
                </span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                      interval={totalDays > 14 ? Math.ceil(totalDays / 7) : 'preserveStartEnd'}
                    />
                    <YAxis
                      stroke="#64748b"
                      unit="%"
                      tick={{ fontSize: 11 }}
                      domain={[0, 'dataMax + 1']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '0.375rem',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                      labelFormatter={(label, payload) => {
                        const pt = payload?.[0]?.payload;
                        return pt ? `${pt.fullLabel || label}` : label;
                      }}
                      formatter={(val: any) => [`+${val}%`, '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <ReferenceLine
                      y={2.5}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Ambang PR & P3.0 (2.5%)', fill: '#dc2626', fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={3.0}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{ value: 'Ambang NPHR (3.0%)', fill: '#d97706', fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={4.0}
                      stroke="#0284c7"
                      strokeDasharray="4 4"
                      label={{ value: 'Ambang Power (4.0%)', fill: '#0369a1', fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="PR"
                      name="PR (%)"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={totalDays > 15 ? false : { r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="P3_0"
                      name="P3.0 (%)"
                      stroke="#9333ea"
                      strokeWidth={2}
                      dot={totalDays > 15 ? false : { r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="NPHR"
                      name="NPHR (%)"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={totalDays > 15 ? false : { r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="realPower"
                      name="Real Power (%)"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={totalDays > 15 ? false : { r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TABLE VIEW */}
          {activeView === 'table' && (
            <div className="space-y-3">
              {/* Table Sub-Mode Switcher for Multi-Day */}
              {isMultiDay && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    Pilihan Tampilan Tabel:
                  </span>
                  <div className="inline-flex rounded p-0.5 bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setTableMode('milestones')}
                      className={`px-2.5 py-1 rounded font-semibold transition-all ${
                        tableMode === 'milestones'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rekap Parameter & Milestone
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableMode('all')}
                      className={`px-2.5 py-1 rounded font-semibold transition-all ${
                        tableMode === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rincian Lengkap Semua {totalDays} Hari
                    </button>
                  </div>
                </div>
              )}

              {/* Table: Milestone Columns View (Parameter Rows) */}
              {(!isMultiDay || tableMode === 'milestones') && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Parameter</th>
                        <th className="py-2.5 px-3">Ambang Batas</th>
                        <th className="py-2.5 px-3">Hari Ini (H-0)</th>
                        {milestoneIndices.map((idx) => {
                          const d = days[idx];
                          const isLast = idx === days.length - 1;
                          return (
                            <th
                              key={idx}
                              className={`py-2.5 px-3 ${
                                isLast ? 'bg-rose-50 text-rose-950 font-black' : ''
                              }`}
                            >
                              {d?.dayLabel} ({formatDateIndo(d?.date)})
                              {isLast ? ' - Target WW' : ''}
                            </th>
                          );
                        })}
                        <th className="py-2.5 px-3">Delta Akumulasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* PR */}
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          Pressure Ratio (PR)
                        </td>
                        <td className="py-2 px-3 font-semibold text-rose-700">&le;2.5%</td>
                        <td className="py-2 px-3 font-mono">
                          +{forecastSummary.parameters.PR.currentDeterioration}%
                        </td>
                        {milestoneIndices.map((idx) => {
                          const d = days[idx];
                          const isLast = idx === days.length - 1;
                          return (
                            <td
                              key={idx}
                              className={`py-2 px-3 font-mono ${
                                isLast
                                  ? 'font-bold bg-rose-50/70 text-rose-800'
                                  : 'text-slate-700'
                              }`}
                            >
                              +{d?.PR.deterioration}% ({d?.PR.projectedValue})
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 font-mono text-slate-600">
                          +{days[days.length - 1]?.PR.deltaFromCurrent}%
                        </td>
                      </tr>

                      {/* P3.0 */}
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          Discharge Pressure (P3.0)
                        </td>
                        <td className="py-2 px-3 font-semibold text-rose-700">&le;2.5%</td>
                        <td className="py-2 px-3 font-mono">
                          +{forecastSummary.parameters.P3_0.currentDeterioration}%
                        </td>
                        {milestoneIndices.map((idx) => {
                          const d = days[idx];
                          const isLast = idx === days.length - 1;
                          return (
                            <td
                              key={idx}
                              className={`py-2 px-3 font-mono ${
                                isLast
                                  ? 'font-bold bg-rose-50/70 text-rose-800'
                                  : 'text-slate-700'
                              }`}
                            >
                              +{d?.P3_0.deterioration}% ({d?.P3_0.projectedValue} PSIA)
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 font-mono text-slate-600">
                          +{days[days.length - 1]?.P3_0.deltaFromCurrent}%
                        </td>
                      </tr>

                      {/* NPHR */}
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          Net Plant Heat Rate (NPHR)
                        </td>
                        <td className="py-2 px-3 font-semibold text-amber-700">&le;3.0%</td>
                        <td className="py-2 px-3 font-mono">
                          +{forecastSummary.parameters.NPHR.currentDeterioration}%
                        </td>
                        {milestoneIndices.map((idx) => {
                          const d = days[idx];
                          const isLast = idx === days.length - 1;
                          return (
                            <td
                              key={idx}
                              className={`py-2 px-3 font-mono ${
                                isLast
                                  ? 'font-bold bg-rose-50/70 text-rose-800'
                                  : 'text-slate-700'
                              }`}
                            >
                              +{d?.NPHR.deterioration}% ({d?.NPHR.projectedValue} kcal/kWh)
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 font-mono text-slate-600">
                          +{days[days.length - 1]?.NPHR.deltaFromCurrent}%
                        </td>
                      </tr>

                      {/* Real Power */}
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          Real Power (MW)
                        </td>
                        <td className="py-2 px-3 font-semibold text-sky-700">&ge;4.0%</td>
                        <td className="py-2 px-3 font-mono">
                          +{forecastSummary.parameters.realPower.currentDeterioration}%
                        </td>
                        {milestoneIndices.map((idx) => {
                          const d = days[idx];
                          const isLast = idx === days.length - 1;
                          return (
                            <td
                              key={idx}
                              className={`py-2 px-3 font-mono ${
                                isLast
                                  ? 'font-bold bg-rose-50/70 text-rose-800'
                                  : 'text-slate-700'
                              }`}
                            >
                              +{d?.realPower.deterioration}% ({d?.realPower.projectedValue} MW)
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 font-mono text-slate-600">
                          +{days[days.length - 1]?.realPower.deltaFromCurrent}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table: Full Daily Rows View (All Days) */}
              {isMultiDay && tableMode === 'all' && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white max-h-[480px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Hari</th>
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">Fokus / Tahap</th>
                        <th className="py-2.5 px-3">PR (&le;2.5%)</th>
                        <th className="py-2.5 px-3">P3.0 (&le;2.5%)</th>
                        <th className="py-2.5 px-3">NPHR (&le;3.0%)</th>
                        <th className="py-2.5 px-3">Real Power (&ge;4.0%)</th>
                        <th className="py-2.5 px-3">Lolos Ambang</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {days.map((day) => {
                        const isTarget = day.dayOffset === totalDays;
                        return (
                          <tr
                            key={day.dayOffset}
                            className={`hover:bg-slate-50/60 transition-colors ${
                              isTarget ? 'bg-rose-50/40 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  isTarget
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-slate-100 text-slate-800'
                                }`}
                              >
                                {day.dayLabel}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {formatDateIndo(day.date)}
                            </td>
                            <td className="py-2 px-3 text-slate-600 max-w-[180px] truncate">
                              {day.focusLabel}
                            </td>
                            <td
                              className={`py-2 px-3 font-mono ${
                                day.PR.isThresholdExceeded ? 'text-rose-700 font-bold' : 'text-slate-700'
                              }`}
                            >
                              +{day.PR.deterioration}% ({day.PR.projectedValue})
                            </td>
                            <td
                              className={`py-2 px-3 font-mono ${
                                day.P3_0.isThresholdExceeded ? 'text-rose-700 font-bold' : 'text-slate-700'
                              }`}
                            >
                              +{day.P3_0.deterioration}% ({day.P3_0.projectedValue} PSIA)
                            </td>
                            <td
                              className={`py-2 px-3 font-mono ${
                                day.NPHR.isThresholdExceeded ? 'text-rose-700 font-bold' : 'text-slate-700'
                              }`}
                            >
                              +{day.NPHR.deterioration}% ({day.NPHR.projectedValue})
                            </td>
                            <td
                              className={`py-2 px-3 font-mono ${
                                day.realPower.isThresholdExceeded
                                  ? 'text-rose-700 font-bold'
                                  : 'text-slate-700'
                              }`}
                            >
                              +{day.realPower.deterioration}% ({day.realPower.projectedValue} MW)
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                  day.thresholdsMetCount >= 3
                                    ? 'bg-rose-100 text-rose-800'
                                    : day.thresholdsMetCount >= 1
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {day.thresholdsMetCount}/4 Lolos
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
