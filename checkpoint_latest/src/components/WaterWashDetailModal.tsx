import React from 'react';
import { X, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';
import { WaterWashEvent } from '../types';
import { calculateEfficiencyFromNPHR } from '../utils/calculations';

interface WaterWashDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: WaterWashEvent | null;
}

export const WaterWashDetailModal: React.FC<WaterWashDetailModalProps> = ({
  isOpen,
  onClose,
  event,
}) => {
  if (!isOpen || !event) return null;

  const pre = event.preRecord;
  const post = event.postRecord;

  const preEff = pre ? calculateEfficiencyFromNPHR(pre.nphr) : null;
  const postEff = post ? calculateEfficiencyFromNPHR(post.nphr) : null;

  const formatVal = (val: number | null | undefined, unit: string = '', decimals: number = 2) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return `${val.toFixed(decimals)}${unit ? ' ' + unit : ''}`;
  };

  const formatDelta = (
    delta: number | null | undefined,
    percent: number | null | undefined,
    unit: string = '',
    reverseColor: boolean = false
  ) => {
    if (delta === null || delta === undefined || isNaN(delta)) return 'N/A';
    const sign = delta > 0 ? '+' : '';
    const pctStr = percent !== null && percent !== undefined && !isNaN(percent)
      ? ` (${delta > 0 ? '+' : ''}${percent.toFixed(2)}%)`
      : '';
    const isGood = reverseColor ? delta < 0 : delta > 0;
    const colorClass = isGood ? 'text-emerald-700 font-semibold' : 'text-slate-700';

    return (
      <span className={colorClass}>
        {sign}{delta.toFixed(2)}{unit ? ' ' + unit : ''}{pctStr}
      </span>
    );
  };

  return (
    <div
      id="ww-detail-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        id="ww-detail-modal"
        className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">Water Wash Performance Details</h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>WW Date: <strong>{event.date}</strong></span>
              {event.hourlyObservationsCount && event.hourlyObservationsCount > 1 && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="bg-sky-100 text-sky-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    {event.hourlyObservationsCount} hourly readings
                  </span>
                </>
              )}
              <span className="text-slate-300">•</span>
              <span>Daily Median Comparison: H-1 vs H+1</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Before WW (H-1) */}
            <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3">
                Before WW (H-1)
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-slate-500 block">NPHR:</span>
                  <span className="font-semibold text-slate-800">{formatVal(pre?.nphr, 'kcal/kWh')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Efficiency:</span>
                  <span className="font-semibold text-slate-800">{formatVal(preEff, '%')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">PR:</span>
                  <span className="font-semibold text-slate-800">{formatVal(pre?.pr, '', 4)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">P3.0:</span>
                  <span className="font-semibold text-slate-800">{formatVal(pre?.P3_0, 'PSIA')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Real Power:</span>
                  <span className="font-semibold text-slate-800">{formatVal(pre?.realPower, 'MW')}</span>
                </div>
              </div>
            </div>

            {/* After WW (H+1) */}
            <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3">
                After WW (H+1)
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-slate-500 block">NPHR:</span>
                  <span className="font-semibold text-slate-800">{formatVal(post?.nphr, 'kcal/kWh')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Efficiency:</span>
                  <span className="font-semibold text-slate-800">{formatVal(postEff, '%')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">PR:</span>
                  <span className="font-semibold text-slate-800">{formatVal(post?.pr, '', 4)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">P3.0:</span>
                  <span className="font-semibold text-slate-800">{formatVal(post?.P3_0, 'PSIA')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Real Power:</span>
                  <span className="font-semibold text-slate-800">{formatVal(post?.realPower, 'MW')}</span>
                </div>
              </div>
            </div>

            {/* Performance Recovery */}
            <div className="border border-emerald-200 rounded-md p-4 bg-emerald-50/30">
              <div className="text-xs font-bold text-emerald-900 uppercase tracking-wide border-b border-emerald-200 pb-2 mb-3 flex items-center justify-between">
                <span>Performance Recovery</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-slate-500 block">NPHR Change:</span>
                  {formatDelta(event.deltaNPHR, event.deltaNPHRPercent, 'kcal/kWh', true)}
                </div>
                <div>
                  <span className="text-slate-500 block">Efficiency Change:</span>
                  {formatDelta(event.deltaEfficiency, null, '%', false)}
                </div>
                <div>
                  <span className="text-slate-500 block">PR Change:</span>
                  {formatDelta(event.deltaPR, event.deltaPRPercent, '', false)}
                </div>
                <div>
                  <span className="text-slate-500 block">P3.0 Change:</span>
                  {formatDelta(event.deltaP3, event.deltaP3Percent, 'PSIA', false)}
                </div>
                <div>
                  <span className="text-slate-500 block">Real Power Change:</span>
                  {formatDelta(event.deltaPower, event.deltaPowerPercent, 'MW', false)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
