import React from 'react';
import {
  Gauge,
  Info,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  TrendingDown,
} from 'lucide-react';
import { OperationalRecord, ThresholdConfig } from '../types';
import {
  INDICATOR_WEIGHTS,
  WATER_WASH_DECISION_RULES,
} from '../data/initialData';

interface PerformanceIndexCardProps {
  latestRecord?: OperationalRecord;
  thresholds: ThresholdConfig;
  hasBaseline: boolean;
}

export const PerformanceIndexCard: React.FC<PerformanceIndexCardProps> = ({
  latestRecord,
  thresholds,
  hasBaseline,
}) => {
  const index = latestRecord?.performanceIndex ?? null;
  const contrib = latestRecord?.performanceIndexContribution;

  // Status designation (Aturan Final 1.1 - 1.3):
  // 1.1 RECOMMEND WATER WASH: Indikator Lolos >= 3 DAN Bobot Lolos >= 80%
  // 1.2 PANTAU / MONITORING: Bobot Lolos 50% - 79% ATAU NPHR >= nphrEarlyMonitoring (1.7%)
  // 1.3 NORMAL: Bobot Lolos < 50% DAN NPHR < 1.7%
  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
  let badgeText = 'AWAITING DATA';
  let gaugeBarColor = 'bg-slate-300';

  if (hasBaseline && index !== null) {
    if (
      latestRecord?.overallStatus === 'RECOMMEND WATER WASH' ||
      index >= WATER_WASH_DECISION_RULES.minRecommendWeight
    ) {
      badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      badgeText = `CRITICAL (≥${WATER_WASH_DECISION_RULES.minRecommendWeight}%)`;
      gaugeBarColor = 'bg-rose-600';
    } else if (
      latestRecord?.overallStatus === 'MONITORING' ||
      (index >= WATER_WASH_DECISION_RULES.minPantauWeight &&
        index < WATER_WASH_DECISION_RULES.minRecommendWeight) ||
      (latestRecord?.nphrDeterioration !== null &&
        latestRecord?.nphrDeterioration !== undefined &&
        latestRecord.nphrDeterioration >= thresholds.nphrEarlyMonitoring)
    ) {
      badgeColor = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      badgeText = 'PANTAU / MONITORING';
      gaugeBarColor = 'bg-amber-500';
    } else {
      badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      badgeText = `NORMAL (<${WATER_WASH_DECISION_RULES.minPantauWeight}%)`;
      gaugeBarColor = 'bg-emerald-600';
    }
  }

  // Status flags for all 4 parameters
  const isPrInvalid = Boolean(latestRecord && (latestRecord.P1_7 <= 0 || latestRecord.P3_0 <= 0 || latestRecord.pr <= 0));
  const isP3Invalid = Boolean(latestRecord && latestRecord.P3_0 <= 0);
  const isNphrInvalid = Boolean(latestRecord && latestRecord.nphr <= 0);
  const isPowerInvalid = Boolean(latestRecord && latestRecord.realPower <= 0);

  const prMet = Boolean(!isPrInvalid && (latestRecord?.prThresholdReached || (contrib && contrib.pr >= INDICATOR_WEIGHTS.pr)));
  const p3Met = Boolean(!isP3Invalid && (latestRecord?.p3ThresholdReached || (contrib && contrib.p3 >= INDICATOR_WEIGHTS.p3)));
  const nphrMet = Boolean(!isNphrInvalid && (latestRecord?.nphrThresholdReached || (contrib && contrib.nphr >= INDICATOR_WEIGHTS.nphr)));
  const powerMet = Boolean(!isPowerInvalid && (latestRecord?.powerThresholdReached || (contrib && contrib.power >= INDICATOR_WEIGHTS.power)));

  const thresholdsMetCount =
    latestRecord?.thresholdsMetCount ??
    [prMet, p3Met, nphrMet, powerMet].filter(Boolean).length;
  const bobotLolos = index ?? 0;
  const isRecommendWW =
    latestRecord?.overallStatus === 'RECOMMEND WATER WASH' ||
    (thresholdsMetCount >= WATER_WASH_DECISION_RULES.minIndicatorsMet &&
      bobotLolos >= WATER_WASH_DECISION_RULES.minRecommendWeight);

  return (
    <div className="bg-white rounded-md border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-slate-900 text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Bobot Indikator Lolos (Performance Index)</span>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${badgeColor}`}>
                {badgeText}
              </span>
              <div
                className="group relative cursor-help inline-flex items-center"
                title="Rule Logic (1.1 - 1.3):&#10;• 1.1 RECOMMEND WW: Indikator Lolos ≥3 (dari 4) DAN Bobot Lolos ≥80%&#10;• 1.2 PANTAU: Bobot Lolos 50%-79% ATAU NPHR ≥1.7%&#10;• 1.3 NORMAL: Bobot Lolos <50% DAN NPHR <1.7%"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600 transition-colors" />
              </div>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Skor diskrit (tanpa partial credit): PR ({INDICATOR_WEIGHTS.pr}%) + P3.0 ({INDICATOR_WEIGHTS.p3}%) + NPHR ({INDICATOR_WEIGHTS.nphr}%) + Real Power ({INDICATOR_WEIGHTS.power}%)
            </p>
          </div>
        </div>

        {/* Index Value Highlight */}
        <div className="flex items-baseline gap-1.5 self-start sm:self-auto">
          <span className="text-2xl font-black text-slate-900 tracking-tight">
            {index !== null ? `${index}%` : '—'}
          </span>
          <span className="text-xs font-semibold text-slate-400">/ 100%</span>
        </div>
      </div>

      {/* Visual Progress Bar with Threshold Markers (Pantau, Recommend WW) */}
      <div className="space-y-1.5">
        <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          {/* Progress fill */}
          <div
            className={`h-full transition-all duration-500 ${gaugeBarColor}`}
            style={{ width: `${Math.min(100, Math.max(0, index ?? 0))}%` }}
          />
        </div>

        {/* Scale labels */}
        <div className="relative flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
          <span>0%</span>
          <span className="text-amber-700 font-bold">{WATER_WASH_DECISION_RULES.minPantauWeight}% (Pantau)</span>
          <span className="text-rose-700 font-bold">{WATER_WASH_DECISION_RULES.minRecommendWeight}% (WW Target)</span>
          <span>100%</span>
        </div>
      </div>

      {/* Physical Data Quality Warning (Kasus b: Nilai <= 0) */}
      {latestRecord?.hasPhysicalDataError && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-950 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-rose-900">Peringatan Kualitas Data: Data tidak wajar, cek input!</span>
            <p className="text-[11px] text-rose-800">
              {latestRecord.dataQualityWarning || 'Besaran fisik gas turbin harus bernilai positif (> 0).'}
            </p>
            <p className="text-[10px] text-rose-700 font-medium">
              Penyebut evaluasi tetap dihitung dari {latestRecord.evaluatedIndicatorsCount} parameter (tidak diturunkan diam-diam).
            </p>
          </div>
        </div>
      )}


      {/* 4 Weights Breakdown Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        {/* PR Component */}
        <div className={`p-2.5 rounded border text-xs space-y-1 ${isPrInvalid ? 'bg-rose-50/60 border-rose-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">PR</span>
            <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
              Weight: {INDICATOR_WEIGHTS.pr}%
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-slate-500 text-[11px]">Score:</span>
            <strong className="text-slate-900">
              {contrib ? `${contrib.pr}%` : '—'}
            </strong>
          </div>
          <div className="flex justify-between items-baseline text-[11px]">
            <span className="text-slate-500">Threshold:</span>
            <span className={isPrInvalid ? 'text-rose-700 font-bold' : prMet ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {isPrInvalid ? 'Data Error (≤ 0)' : prMet ? `Met (≥${thresholds.prWWThreshold}%)` : `< ${thresholds.prWWThreshold}%`}
            </span>
          </div>
        </div>

        {/* P3.0 Component */}
        <div className={`p-2.5 rounded border text-xs space-y-1 ${isP3Invalid ? 'bg-rose-50/60 border-rose-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">P3.0</span>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
              Weight: {INDICATOR_WEIGHTS.p3}%
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-slate-500 text-[11px]">Score:</span>
            <strong className="text-slate-900">
              {contrib ? `${contrib.p3}%` : '—'}
            </strong>
          </div>
          <div className="flex justify-between items-baseline text-[11px]">
            <span className="text-slate-500">Threshold:</span>
            <span className={isP3Invalid ? 'text-rose-700 font-bold' : p3Met ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {isP3Invalid ? 'Data Error (≤ 0)' : p3Met ? `Met (≥${thresholds.p3WWThreshold}%)` : `< ${thresholds.p3WWThreshold}%`}
            </span>
          </div>
        </div>

        {/* NPHR Component */}
        <div className={`p-2.5 rounded border text-xs space-y-1 ${isNphrInvalid ? 'bg-rose-50/60 border-rose-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">NPHR</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
              Weight: {INDICATOR_WEIGHTS.nphr}%
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-slate-500 text-[11px]">Score:</span>
            <strong className="text-slate-900">
              {contrib ? `${contrib.nphr}%` : '—'}
            </strong>
          </div>
          <div className="flex justify-between items-baseline text-[11px]">
            <span className="text-slate-500">Threshold:</span>
            <span
              className={
                isNphrInvalid
                  ? 'text-rose-700 font-bold'
                  : nphrMet
                  ? 'text-rose-600 font-bold'
                  : latestRecord?.nphrEarlyMonitoringReached
                  ? 'text-amber-600 font-semibold'
                  : 'text-slate-600'
              }
            >
              {isNphrInvalid
                ? 'Data Error (≤ 0)'
                : nphrMet
                ? `Met (≥${thresholds.nphrWWThreshold}%)`
                : latestRecord?.nphrEarlyMonitoringReached
                ? `Pantau (≥${thresholds.nphrEarlyMonitoring}%)`
                : `< ${thresholds.nphrWWThreshold}%`}
            </span>
          </div>
        </div>

        {/* Real Power Component */}
        <div className={`p-2.5 rounded border text-xs space-y-1 ${isPowerInvalid ? 'bg-rose-50/60 border-rose-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">Real Power</span>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
              Weight: {INDICATOR_WEIGHTS.power}%
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-slate-500 text-[11px]">Score:</span>
            <strong className="text-slate-900">
              {contrib ? `${contrib.power}%` : '—'}
            </strong>
          </div>
          <div className="flex justify-between items-baseline text-[11px]">
            <span className="text-slate-500">Threshold:</span>
            <span className={isPowerInvalid ? 'text-rose-700 font-bold' : powerMet ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {isPowerInvalid ? 'Data Error (≤ 0)' : powerMet ? `Met (≥${thresholds.powerWWThreshold}%)` : `< ${thresholds.powerWWThreshold}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Decision Rules Card (Rule Logic 1.1 - 1.3) */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 space-y-2.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
            <Info className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Rule Logic — Aturan Keputusan Evaluasi Water Wash (1.1 - 1.3):</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] leading-relaxed">
          <div className="p-2.5 bg-white rounded border border-slate-200/80 space-y-1">
            <div className="font-bold text-rose-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0"></span>
              <span>1.1 RECOMMEND WATER WASH</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Kriteria terpenuhi: <strong>Indikator Lolos ≥ {WATER_WASH_DECISION_RULES.minIndicatorsMet}</strong> (dari 4) <strong>DAN</strong> total <strong>Bobot Lolos ≥ {WATER_WASH_DECISION_RULES.minRecommendWeight}%</strong>.
            </p>
          </div>

          <div className="p-2.5 bg-white rounded border border-slate-200/80 space-y-1">
            <div className="font-bold text-amber-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
              <span>1.2 PANTAU / MONITORING</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Kriteria WW belum terpenuhi, dan: <strong>Bobot Lolos {WATER_WASH_DECISION_RULES.minPantauWeight}% – {WATER_WASH_DECISION_RULES.maxPantauWeight}%</strong> <strong>ATAU</strong> Deteriorasi <strong>NPHR ≥ {thresholds.nphrEarlyMonitoring}%</strong> (Early Monitoring).
            </p>
          </div>

          <div className="p-2.5 bg-white rounded border border-slate-200/80 space-y-1">
            <div className="font-bold text-emerald-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span>
              <span>1.3 NORMAL</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Operasi turbin gas berada dalam batas normal: <strong>Bobot Lolos &lt; {WATER_WASH_DECISION_RULES.minPantauWeight}%</strong> <strong>DAN</strong> Deteriorasi <strong>NPHR &lt; {thresholds.nphrEarlyMonitoring}%</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
