import React from 'react';
import { X, Calendar, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
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
    const colorClass = isGood ? 'text-emerald-700 font-bold' : 'text-slate-700';

    return (
      <span className={colorClass}>
        {sign}{delta.toFixed(2)}{unit ? ' ' + unit : ''}{pctStr}
      </span>
    );
  };

  const preLabel = event.preDaysDiff
    ? event.preDaysDiff === 1
      ? 'Before WW (H-1)'
      : `Before WW (H-${event.preDaysDiff})`
    : 'Before WW';

  const postLabel = event.postDaysDiff
    ? event.postDaysDiff === 1
      ? 'After WW (H+1)'
      : `After WW (H+${event.postDaysDiff})`
    : 'After WW (H+1)';

  const hasBoth = Boolean(pre && post && event.deltaNPHR !== null && event.deltaNPHR !== undefined);

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
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
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
              <span className="font-semibold text-slate-700">
                Daily Average Comparison: {pre ? (event.preDaysDiff === 1 ? 'H-1' : `H-${event.preDaysDiff}`) : 'Before'} vs {post ? (event.postDaysDiff === 1 ? 'H+1' : `H+${event.postDaysDiff}`) : 'After'}
              </span>
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
        <div className="p-6 space-y-5">
          {!pre && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Data Operasi Sebelum Wash Tidak Ditemukan:</span>{' '}
                <span>
                  Karena operasi pada tanggal pelaksanaan WW ({event.date}) dihitung setelah water wash selesai, kondisi &quot;Sebelum Wash&quot; harus mengambil tanggal operasi terakhir sebelum tanggal wash (misal: 6 Okt). Masukkan data operasi sebelum tanggal wash untuk mengevaluasi pemulihan performa.
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Before WW */}
            <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
                <span>{preLabel}</span>
                {pre && (
                  <span className="text-[11px] font-semibold text-slate-500 normal-case">
                    {pre.date}
                  </span>
                )}
              </div>
              {pre ? (
                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-slate-500 block">NPHR:</span>
                    <span className="font-semibold text-slate-800">{formatVal(pre.nphr, 'kcal/kWh')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Efficiency:</span>
                    <span className="font-semibold text-slate-800">{formatVal(preEff, '%')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">PR:</span>
                    <span className="font-semibold text-slate-800">{formatVal(pre.pr, '', 4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">P3.0:</span>
                    <span className="font-semibold text-slate-800">{formatVal(pre.P3_0, 'PSIA')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Real Power:</span>
                    <span className="font-semibold text-slate-800">{formatVal(pre.realPower, 'MW')}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-4 text-center">
                  Data sebelum wash belum diinput
                </div>
              )}
            </div>

            {/* After WW */}
            <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
                <span>{postLabel}</span>
                {post && (
                  <span className="text-[11px] font-semibold text-slate-500 normal-case">
                    {post.date}
                  </span>
                )}
              </div>
              {post ? (
                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-slate-500 block">NPHR:</span>
                    <span className="font-semibold text-slate-800">{formatVal(post.nphr, 'kcal/kWh')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Efficiency:</span>
                    <span className="font-semibold text-slate-800">{formatVal(postEff, '%')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">PR:</span>
                    <span className="font-semibold text-slate-800">{formatVal(post.pr, '', 4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">P3.0:</span>
                    <span className="font-semibold text-slate-800">{formatVal(post.P3_0, 'PSIA')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Real Power:</span>
                    <span className="font-semibold text-slate-800">{formatVal(post.realPower, 'MW')}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-4 text-center">
                  Data setelah wash belum diinput
                </div>
              )}
            </div>

            {/* Performance Recovery */}
            <div className={`border rounded-md p-4 ${
              hasBoth ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/30'
            }`}>
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
                <span className={hasBoth ? 'text-emerald-900 font-bold' : ''}>Performance Recovery</span>
                {hasBoth && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              {hasBoth ? (
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
              ) : (
                <div className="text-xs text-slate-500 italic py-4 space-y-1">
                  <p>Memerlukan data tanggal sebelum wash dan setelah wash untuk menghitung perbaikan parameter.</p>
                </div>
              )}
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
