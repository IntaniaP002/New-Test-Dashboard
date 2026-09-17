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

  // Status designation:
  // >= 80%: High Deterioration (Eligible for WW if PR & P3 thresholds also met)
  // 50% - 79%: Monitoring (Pantau)
  // < 50%: Normal
  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
  let badgeText = 'AWAITING DATA';
  let gaugeBarColor = 'bg-slate-300';

  if (hasBaseline && index !== null) {
    if (index >= 80) {
      badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      badgeText = 'CRITICAL (≥80%)';
      gaugeBarColor = 'bg-rose-600';
    } else if (index >= 50) {
      badgeColor = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      badgeText = 'PANTAU / MONITORING (50% - 79%)';
      gaugeBarColor = 'bg-amber-500';
    } else {
      badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      badgeText = 'NORMAL (<50%)';
      gaugeBarColor = 'bg-emerald-600';
    }
  }

  // Status flags for all 4 parameters
  const prMet = Boolean(latestRecord?.prThresholdReached || (contrib && contrib.pr >= 30));
  const p3Met = Boolean(latestRecord?.p3ThresholdReached || (contrib && contrib.p3 >= 30));
  const nphrMet = Boolean(latestRecord?.nphrThresholdReached || (contrib && contrib.nphr >= 20));
  const powerMet = Boolean(latestRecord?.powerThresholdReached || (contrib && contrib.power >= 20));
  const coreTwoMet = prMet && p3Met;

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
              <span>Weighted Performance Index</span>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${badgeColor}`}>
                {badgeText}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Weighted composite: PR (30%) + P3.0 (30%) + NPHR (20%) + Real Power (20%)
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

      {/* Visual Progress Bar with Threshold Markers (50% Pantau, 80% Recommend WW) */}
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
          <span className="text-amber-700 font-bold">50% (Pantau)</span>
          <span className="text-rose-700 font-bold">80% (WW Target)</span>
          <span>100%</span>
        </div>
      </div>

      {/* 4 Weights Breakdown Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        {/* PR Component */}
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">PR</span>
            <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
              Weight: 30%
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
            <span className={prMet ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {prMet ? `Met (≥${thresholds.prWWThreshold}%)` : `< ${thresholds.prWWThreshold}%`}
            </span>
          </div>
        </div>

        {/* P3.0 Component */}
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">P3.0</span>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
              Weight: 30%
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
            <span className={p3Met ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {p3Met ? `Met (≥${thresholds.p3WWThreshold}%)` : `< ${thresholds.p3WWThreshold}%`}
            </span>
          </div>
        </div>

        {/* NPHR Component */}
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">NPHR</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
              Weight: 20%
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
                nphrMet
                  ? 'text-rose-600 font-bold'
                  : latestRecord?.nphrEarlyMonitoringReached
                  ? 'text-amber-600 font-semibold'
                  : 'text-slate-600'
              }
            >
              {nphrMet
                ? `Met (≥${thresholds.nphrWWThreshold}%)`
                : latestRecord?.nphrEarlyMonitoringReached
                ? `Pantau (≥${thresholds.nphrEarlyMonitoring}%)`
                : `< ${thresholds.nphrWWThreshold}%`}
            </span>
          </div>
        </div>

        {/* Real Power Component */}
        <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">Real Power</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              Weight: 20%
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
            <span className={powerMet ? 'text-rose-600 font-bold' : 'text-slate-600'}>
              {powerMet ? `Met (≥${thresholds.powerWWThreshold}%)` : `< ${thresholds.powerWWThreshold}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Decision Rules Card */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong>Rule Logic:</strong> Recommendation requires <strong>Index ≥ 80%</strong> AND both{' '}
            <strong className={prMet ? 'text-emerald-700' : 'text-slate-800'}>PR (30%)</strong> +{' '}
            <strong className={p3Met ? 'text-emerald-700' : 'text-slate-800'}>P3.0 (30%)</strong>{' '}
            at threshold + at least 1 remaining parameter (20%). Status <strong>Pantau</strong> applies when NPHR ≥ 1.7% and Index is between 50% – 79%.
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-500">Core PR + P3.0:</span>
          {coreTwoMet ? (
            <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              Both Met
            </span>
          ) : (
            <span className="font-medium text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
              {prMet ? 'PR Met' : p3Met ? 'P3 Met' : 'Neither Met'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
