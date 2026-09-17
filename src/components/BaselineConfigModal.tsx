import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Compass,
  Check,
  Star,
  Sparkles,
  Sliders,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { BaselineConfig, OperationalRecord } from '../types';
import { DEFAULT_BASELINE, DEFAULT_THRESHOLDS } from '../data/initialData';
import { aggregateRecordsByDailyMedian } from '../utils/calculations';

interface BaselineConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseline?: BaselineConfig;
  currentBaseline?: BaselineConfig;
  records: OperationalRecord[];
  onUpdateBaseline?: (newBaseline: BaselineConfig) => void;
  onSaveBaseline?: (newBaseline: BaselineConfig) => void;
}

export const BaselineConfigModal: React.FC<BaselineConfigModalProps> = ({
  isOpen,
  onClose,
  baseline,
  currentBaseline,
  records,
  onUpdateBaseline,
  onSaveBaseline,
}) => {
  const activeBaseline: BaselineConfig = currentBaseline ?? baseline ?? DEFAULT_BASELINE;
  const saveBaseline = onSaveBaseline ?? onUpdateBaseline ?? (() => {});

  const [activeTab, setActiveTab] = useState<'records' | 'manual'>('records');

  // Compute daily median consolidated records for baseline selection
  const displayedRecords = useMemo(() => {
    return aggregateRecordsByDailyMedian(records, activeBaseline, DEFAULT_THRESHOLDS);
  }, [records, activeBaseline]);

  // Manual form state
  const [manualP1_7, setManualP1_7] = useState<string>('14.65');
  const [manualP3_0, setManualP3_0] = useState<string>('245.0');
  const [manualPower, setManualPower] = useState<string>('156.0');
  const [manualNphr, setManualNphr] = useState<string>('2420.0');
  const [manualDesc, setManualDesc] = useState<string>('OEM Rated / Commissioning Baseline');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state whenever modal is opened or activeBaseline changes
  useEffect(() => {
    if (isOpen) {
      setManualP1_7(
        activeBaseline.P1_7 !== null && activeBaseline.P1_7 !== undefined
          ? String(activeBaseline.P1_7)
          : '14.65'
      );
      setManualP3_0(
        activeBaseline.P3_0 !== null && activeBaseline.P3_0 !== undefined
          ? String(activeBaseline.P3_0)
          : '245.0'
      );
      setManualPower(
        activeBaseline.realPower !== null && activeBaseline.realPower !== undefined
          ? String(activeBaseline.realPower)
          : '156.0'
      );
      setManualNphr(
        activeBaseline.nphr !== null && activeBaseline.nphr !== undefined
          ? String(activeBaseline.nphr)
          : '2420.0'
      );
      setManualDesc(
        activeBaseline.referenceDescription || 'OEM Rated / Commissioning Baseline'
      );
      setErrorMsg(null);
    }
  }, [isOpen, activeBaseline]);

  if (!isOpen) return null;

  const handleApplyRecordBaseline = (record: OperationalRecord) => {
    const pr = record.P1_7 > 0 ? Number((record.P3_0 / record.P1_7).toFixed(4)) : record.pr;
    const isMedian = record.isDailyMedian || record.time?.toLowerCase().includes('median');
    const desc = isMedian
      ? `Daily median baseline from ${record.date}${
          record.hourlyObservationsCount && record.hourlyObservationsCount > 1
            ? ` (${record.hourlyObservationsCount} readings)`
            : ''
        }`
      : `Operational baseline from ${record.date} ${record.time}${record.notes ? ` (${record.notes})` : ''}`;

    const newBaseline: BaselineConfig = {
      isConfigured: true,
      T1_7: record.T1_7,
      P1_7: record.P1_7,
      P3_0: record.P3_0,
      PR: pr,
      realPower: record.realPower,
      nphr: record.nphr,
      sourceRecordId: record.id,
      date: record.date,
      time: isMedian ? 'Daily Median' : record.time,
      referenceDescription: desc,
      setAt: new Date().toISOString(),
    };
    saveBaseline(newBaseline);
    onClose();
  };

  const handleSaveManualBaseline = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const p1 = parseFloat(manualP1_7);
    const p3 = parseFloat(manualP3_0);
    const pw = parseFloat(manualPower);
    const hr = parseFloat(manualNphr);

    if (isNaN(p1) || isNaN(p3) || isNaN(pw) || isNaN(hr)) {
      setErrorMsg('Please ensure all numerical fields are valid numbers.');
      return;
    }

    if (p1 <= 0 || p3 <= 0 || pw <= 0 || hr <= 0) {
      setErrorMsg('Pressures, Real Power, and NPHR must all be positive numbers greater than 0.');
      return;
    }

    const pr = Number((p3 / p1).toFixed(4));

    const newBaseline: BaselineConfig = {
      isConfigured: true,
      P1_7: p1,
      P3_0: p3,
      PR: pr,
      realPower: pw,
      nphr: hr,
      referenceDescription: manualDesc.trim() || 'Manual Reference Baseline',
      setAt: new Date().toISOString(),
    };

    saveBaseline(newBaseline);
    onClose();
  };

  // Check if a record matches the currently active baseline
  const isRecordActiveBaseline = (r: OperationalRecord) => {
    if (!activeBaseline?.isConfigured) return false;
    if (
      activeBaseline.sourceRecordId &&
      (activeBaseline.sourceRecordId === r.id || r.sourceRecordIds?.includes(activeBaseline.sourceRecordId))
    ) {
      return true;
    }
    if (activeBaseline.date === r.date) {
      if (r.isDailyMedian || activeBaseline.time?.toLowerCase().includes('median')) return true;
      if (activeBaseline.time === r.time) return true;
    }
    if (
      activeBaseline.P3_0 !== null &&
      activeBaseline.P3_0 !== undefined &&
      activeBaseline.realPower !== null &&
      activeBaseline.realPower !== undefined &&
      Math.abs(activeBaseline.P3_0 - r.P3_0) < 0.01 &&
      Math.abs(activeBaseline.realPower - r.realPower) < 0.01 &&
      Math.abs((activeBaseline.nphr ?? 0) - r.nphr) < 0.1
    ) {
      return true;
    }
    return false;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-2xl w-full my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-sky-100 flex items-center justify-center text-sky-700">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Baseline Configuration & Reference
              </h3>
              <p className="text-xs text-slate-500">
                Reference values for calculating parameter deteriorations (%) and physical deltas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Baseline Summary Banner */}
        <div className="p-4 bg-slate-100/70 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Active Baseline:
                </span>
                {activeBaseline.isConfigured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Check className="w-3 h-3 stroke-[3]" /> Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <AlertCircle className="w-3 h-3" /> Not Configured
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-800 mt-1">
                {activeBaseline.referenceDescription || (activeBaseline.date ? `Record from ${activeBaseline.date} ${activeBaseline.time || ''}` : 'No description')}
              </p>
            </div>

            {activeBaseline.isConfigured && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white p-2.5 rounded border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Real Power</span>
                  <span className="font-bold text-slate-900">{activeBaseline.realPower?.toFixed(2)} MW</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PR (Ratio)</span>
                  <span className="font-mono font-bold text-slate-900">{activeBaseline.PR?.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">P3.0</span>
                  <span className="font-bold text-slate-900">{activeBaseline.P3_0?.toFixed(2)} PSIA</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">NPHR</span>
                  <span className="font-bold text-slate-900">{activeBaseline.nphr?.toLocaleString()} kcal</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab Switching */}
        <div className="px-6 border-b border-slate-200 bg-white">
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'records'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Select from Recorded Data ({displayedRecords.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'manual'
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Manual / OEM Design Values</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'records' ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-600">
                  Click <strong>"Set as Active Baseline"</strong> on any operational record below.
                  All deteriorations are calculated relative to that reference.
                </p>
              </div>

              {displayedRecords.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded text-xs text-slate-500">
                  No records recorded yet. Input your first reading or import a dataset to select a baseline.
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedRecords.map((r, idx) => {
                    const isCurrent = isRecordActiveBaseline(r);
                    return (
                      <div
                        key={r.id}
                        className={`p-3 rounded-md border text-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isCurrent
                            ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-400'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">
                              #{idx + 1} • {r.date}
                            </span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-600 text-white shadow-2xs">
                                <Star className="w-2.5 h-2.5 fill-white" />
                                CURRENT ACTIVE BASELINE
                              </span>
                            )}
                            {r.isWaterWashEvent && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                                WW Event
                              </span>
                            )}
                          </div>
                          <div className="text-slate-600 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                            <span>Power: <strong className="text-slate-800">{r.realPower.toFixed(2)} MW</strong></span>
                            <span>PR: <strong className="text-slate-800 font-mono">{r.pr.toFixed(4)}</strong></span>
                            <span>P3.0: <strong className="text-slate-800">{r.P3_0.toFixed(2)} PSIA</strong></span>
                            <span>NPHR: <strong className="text-slate-800">{r.nphr.toLocaleString()} kcal</strong></span>
                          </div>
                          {r.notes && (
                            <p className="text-[11px] text-slate-500 italic">
                              {r.notes}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold text-emerald-800 bg-emerald-100/80">
                              <Check className="w-3.5 h-3.5 stroke-[3]" /> Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplyRecordBaseline(r)}
                              className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors shadow-2xs flex items-center gap-1"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              Set as Baseline
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveManualBaseline} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <p className="text-xs text-slate-600">
                Enter manufacturer OEM rated design values or calibrated performance baseline parameters directly.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Compressor Inlet Press (P1.7) [PSIA]
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualP1_7}
                    onChange={(e) => setManualP1_7(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Discharge Press (P3.0) [PSIA]
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualP3_0}
                    onChange={(e) => setManualP3_0(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Real Power [MW]
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualPower}
                    onChange={(e) => setManualPower(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Net Plant Heat Rate (NPHR) [kcal/kWh]
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={manualNphr}
                    onChange={(e) => setManualNphr(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Calculated Pressure Ratio (PR)
                  </label>
                  <div className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700">
                    {parseFloat(manualP1_7) > 0 && parseFloat(manualP3_0) > 0
                      ? (parseFloat(manualP3_0) / parseFloat(manualP1_7)).toFixed(4)
                      : '—'}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference Description / Label
                  </label>
                  <input
                    type="text"
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                    placeholder="e.g., OEM Rated Commissioning Baseline"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors shadow-xs"
                >
                  Save Custom Baseline
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            💡 Tip: You can also click <strong>"Set as Baseline"</strong> on any row directly in the <strong>Input Data</strong> table.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
