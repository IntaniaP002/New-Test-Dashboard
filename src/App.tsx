import React, { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { OperatorInputView } from './components/OperatorInputView';
import { DatasetImportModal } from './components/DatasetImportModal';
import { BaselineConfigModal } from './components/BaselineConfigModal';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  ActiveNavTab,
  BaselineConfig,
  OperationalInput,
  OperationalRecord,
  ThresholdConfig,
} from './types';
import {
  DEFAULT_BASELINE,
  DEFAULT_THRESHOLDS,
  WATER_WASH_DECISION_RULES,
} from './data/initialData';
import {
  aggregateRecordsByDailyMedian,
  compareRecordsChronologically,
  deriveWaterWashEvents,
  evaluateOperationalRecord,
} from './utils/calculations';
import {
  calculateOverallForecast,
} from './utils/forecastEngine';

const STORAGE_KEYS = {
  RECORDS: 'gt_ww_records_v5',
  BASELINE: 'gt_ww_baseline_v5',
  THRESHOLDS: 'gt_ww_thresholds_v5',
  ACTIVE_TAB: 'gt_ww_active_tab_v5',
};

export default function App() {
  // Navigation State - strictly 2 pages: 'dashboard' | 'input'
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
    if (saved === 'dashboard' || saved === 'input') {
      return saved;
    }
    return 'input';
  });

  // Thresholds State
  const [thresholds, setThresholds] = useState<ThresholdConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THRESHOLDS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_THRESHOLDS,
          ...parsed,
          prWWThreshold: parsed.prWWThreshold === 3.0 ? DEFAULT_THRESHOLDS.prWWThreshold : (parsed.prWWThreshold ?? DEFAULT_THRESHOLDS.prWWThreshold),
          p3WWThreshold: parsed.p3WWThreshold === 3.0 ? DEFAULT_THRESHOLDS.p3WWThreshold : (parsed.p3WWThreshold ?? DEFAULT_THRESHOLDS.p3WWThreshold),
        };
      } catch {
        /* fallback */
      }
    }
    return DEFAULT_THRESHOLDS;
  });

  // Baseline State - completely empty/unconfigured
  const [baseline, setBaseline] = useState<BaselineConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BASELINE);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* fallback */
      }
    }
    return DEFAULT_BASELINE;
  });

  // Records State - completely empty
  const [records, setRecords] = useState<OperationalRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // If all or majority (>60%) of records were marked as WW due to the previous filename ("WW1") bug,
          // reset them so when data is first displayed, it starts with "+ Tag WW" and lets user choose manually
          if (parsed.length > 2 && parsed.filter((r: any) => r.isWaterWashEvent).length > parsed.length * 0.6) {
            return parsed.map((r: any) => ({
              ...r,
              isWaterWashEvent: false,
              notes: r.notes === 'Water Wash Event' ? undefined : r.notes,
            }));
          }
          return parsed;
        }
      } catch {
        /* fallback */
      }
    }
    return [];
  });

  // Modals State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBaselineModalOpen, setIsBaselineModalOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Selected Historical Record for Dashboard Inspection
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const handleSelectRecordForDashboard = (recordId: string | null) => {
    setSelectedRecordId(recordId);
    setActiveTab('dashboard');
  };

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THRESHOLDS, JSON.stringify(thresholds));
  }, [thresholds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BASELINE, JSON.stringify(baseline));
  }, [baseline]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
  }, [records]);

  // Derived Analytics & Dynamic Evaluation against current thresholds
  const evaluatedRecords = useMemo(() => {
    if (records.length === 0) return [];
    if (!baseline.isConfigured) return records;
    return records.map((r) => evaluateOperationalRecord(r, r.id, baseline, thresholds));
  }, [records, baseline, thresholds]);

  const derivedEvents = useMemo(() => {
    return deriveWaterWashEvents(evaluatedRecords);
  }, [evaluatedRecords]);

  // "Input History" table dataset: single representative daily record per date
  const inputHistoryRecords = useMemo(() => {
    return aggregateRecordsByDailyMedian(evaluatedRecords, baseline, thresholds);
  }, [evaluatedRecords, baseline, thresholds]);

  // Water Washing evaluation is based on the latest input history data
  const latestRecord = useMemo(() => {
    if (inputHistoryRecords.length > 0) {
      const sorted = [...inputHistoryRecords].sort(compareRecordsChronologically);
      return sorted[sorted.length - 1];
    }
    if (evaluatedRecords.length === 0) return null;
    const sorted = [...evaluatedRecords].sort(compareRecordsChronologically);
    return sorted[sorted.length - 1];
  }, [inputHistoryRecords, evaluatedRecords]);

  // Forecast engine uses the "Input History" table daily dataset directly
  const forecastSummary = useMemo(() => {
    return calculateOverallForecast(inputHistoryRecords, baseline, thresholds);
  }, [inputHistoryRecords, baseline, thresholds]);

  // Record Submission Handler
  const handleRecordSubmitted = async (
    input: OperationalInput,
    setAsBaseline?: boolean
  ): Promise<{ success: boolean; message: string }> => {
    let activeBaseline = baseline;

    // Automatically configure or update baseline if requested or if none exists
    if (setAsBaseline || !baseline.isConfigured) {
      const pr = input.P1_7 > 0 ? Number((input.P3_0 / input.P1_7).toFixed(4)) : null;
      activeBaseline = {
        isConfigured: true,
        T1_7: input.T1_7,
        P1_7: input.P1_7,
        P3_0: input.P3_0,
        PR: pr,
        realPower: input.realPower,
        nphr: input.nphr,
        referenceDescription: `Operational baseline established on ${input.date}`,
        setAt: new Date().toISOString(),
      };
      setBaseline(activeBaseline);
    }

    const newId = `rec-${Date.now()}`;
    const evaluated = evaluateOperationalRecord(input, newId, activeBaseline, thresholds);

    const updated = [...records, evaluated];
    setRecords(updated);

    return { success: true, message: 'Data successfully recorded and saved.' };
  };

  // Clear all data triggers in-app confirmation modal (safely runs in sandboxed iframes)
  const handleClearData = () => {
    setIsClearConfirmOpen(true);
  };

  // Confirmed execution of complete clear
  const handleConfirmClearData = () => {
    setSelectedRecordId(null);
    setRecords([]);
    setBaseline(DEFAULT_BASELINE);
    localStorage.removeItem(STORAGE_KEYS.RECORDS);
    localStorage.removeItem(STORAGE_KEYS.BASELINE);
    setIsClearConfirmOpen(false);
    setActiveTab('input');
  };

  // Import dataset handler
  const handleImportData = (rawInputs: OperationalInput[], setAsBaseline?: boolean) => {
    // When data is first imported/displayed, do NOT mark as WW Event.
    // Let user choose manually which date is WW (+ Tag WW first).
    const sanitizedInputs = rawInputs.map((input) => ({
      ...input,
      isWaterWashEvent: false,
      notes: input.notes === 'Water Wash Event' ? undefined : input.notes,
    }));

    const newInputs = [...sanitizedInputs].sort((a, b) => a.date.localeCompare(b.date));
    let activeBaseline = baseline;

    if (setAsBaseline && newInputs.length > 0) {
      const firstDate = newInputs[0].date;
      const firstDayInputs = newInputs.filter((i) => i.date === firstDate);

      let t1 = newInputs[0].T1_7;
      let p1 = newInputs[0].P1_7;
      let p3 = newInputs[0].P3_0;
      let pw = newInputs[0].realPower;
      let hr = newInputs[0].nphr;

      if (firstDayInputs.length > 1) {
        const getMed = (arr: (number | undefined | null)[]) => {
          const valid = arr.filter((x): x is number => typeof x === 'number' && !isNaN(x));
          if (valid.length === 0) return null;
          const s = [...valid].sort((a, b) => a - b);
          const m = Math.floor(s.length / 2);
          return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
        };
        const medT1 = getMed(firstDayInputs.map((i) => i.T1_7));
        t1 = medT1 !== null ? Number(medT1.toFixed(1)) : undefined;
        p1 = Number((getMed(firstDayInputs.map((i) => i.P1_7)) ?? p1).toFixed(2));
        p3 = Number((getMed(firstDayInputs.map((i) => i.P3_0)) ?? p3).toFixed(2));
        pw = Number((getMed(firstDayInputs.map((i) => i.realPower)) ?? pw).toFixed(2));
        hr = Number((getMed(firstDayInputs.map((i) => i.nphr)) ?? hr).toFixed(1));
      }

      const pr = p1 > 0 ? Number((p3 / p1).toFixed(4)) : null;

      activeBaseline = {
        isConfigured: true,
        T1_7: t1,
        P1_7: p1,
        P3_0: p3,
        PR: pr,
        realPower: pw,
        nphr: hr,
        date: firstDate,
        time: firstDayInputs.length > 1 ? 'Daily Median' : newInputs[0].time,
        referenceDescription:
          firstDayInputs.length > 1
            ? `Imported daily median baseline (${firstDate}, ${firstDayInputs.length} readings)`
            : `Imported baseline (${firstDate} ${newInputs[0].time})`,
        setAt: new Date().toISOString(),
      };
      setBaseline(activeBaseline);
    }

    const evaluated = newInputs.map((input, idx) =>
      evaluateOperationalRecord(input, `imp-${Date.now()}-${idx}`, activeBaseline, thresholds)
    );

    setSelectedRecordId(null);
    setRecords(evaluated);
    setActiveTab('dashboard');
  };

  // Clear all WW tags back to '+ Tag WW'
  const handleClearAllWaterWash = () => {
    setRecords((prev) =>
      prev.map((r) => ({
        ...r,
        isWaterWashEvent: false,
        notes: r.notes === 'Water Wash Event' ? undefined : r.notes,
      }))
    );
  };

  // Toggle Water Wash status of an existing record or daily median group
  const handleToggleWaterWashRecord = (recordId: string) => {
    setRecords((prev) => {
      // If daily median ID was passed
      if (recordId.startsWith('daily-')) {
        const targetDate = recordId.replace('daily-', '');
        const anyWW = prev.some((r) => r.date === targetDate && r.isWaterWashEvent);
        const nextWW = !anyWW;
        return prev.map((r) => {
          if (r.date !== targetDate) return r;
          return {
            ...r,
            isWaterWashEvent: nextWW,
            notes: nextWW ? 'Water Wash Event' : undefined,
          };
        });
      }

      // If single record ID
      const target = prev.find((r) => r.id === recordId);
      if (!target) return prev;
      const nextWW = !target.isWaterWashEvent;

      // Update all records on the same date for consistency
      return prev.map((r) => {
        if (r.date === target.date) {
          return {
            ...r,
            isWaterWashEvent: nextWW,
            notes: nextWW ? 'Water Wash Event' : undefined,
          };
        }
        return r;
      });
    });
  };

  // Delete a specific record or all records for a date
  const handleDeleteRecord = (recordId: string) => {
    if (recordId.startsWith('daily-')) {
      const targetDate = recordId.replace('daily-', '');
      setRecords((prev) => prev.filter((r) => r.date !== targetDate));
      return;
    }

    setRecords((prev) => prev.filter((r) => r.id !== recordId));
  };

  // Set an existing operational record as the active baseline
  const handleSetBaselineRecord = (record: OperationalRecord) => {
    const p1 = record.P1_7;
    const p3 = record.P3_0;
    const pr = p1 > 0 ? Number((p3 / p1).toFixed(4)) : null;

    const isMedian = record.isDailyMedian || record.time?.toLowerCase().includes('median');
    const desc = isMedian
      ? `Daily median baseline from ${record.date}${
          record.hourlyObservationsCount && record.hourlyObservationsCount > 1
            ? ` (${record.hourlyObservationsCount} readings)`
            : ''
        }`
      : `Operational baseline established from record on ${record.date} ${record.time}`;

    const newBaseline: BaselineConfig = {
      isConfigured: true,
      sourceRecordId: record.id,
      date: record.date,
      time: isMedian ? 'Daily Median' : record.time,
      T1_7: record.T1_7,
      P1_7: p1,
      P3_0: p3,
      PR: pr,
      realPower: record.realPower,
      nphr: record.nphr,
      referenceDescription: desc,
      setAt: new Date().toISOString(),
    };

    setBaseline(newBaseline);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Application Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        latestRecord={latestRecord ?? undefined}
        recordsCount={evaluatedRecords.length}
        onClearData={handleClearData}
        onOpenBaselineConfig={() => setIsBaselineModalOpen(true)}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            latestRecord={latestRecord ?? undefined}
            baseline={baseline}
            thresholds={thresholds}
            events={derivedEvents}
            recordsCount={evaluatedRecords.length}
            forecastSummary={forecastSummary}
            inputHistoryRecords={inputHistoryRecords}
            selectedRecordId={selectedRecordId}
            onSelectRecord={setSelectedRecordId}
            onNavigate={setActiveTab}
            onOpenImport={() => setIsImportModalOpen(true)}
            onOpenBaselineConfig={() => setIsBaselineModalOpen(true)}
          />
        )}

        {activeTab === 'input' && (
          <OperatorInputView
            onRecordSubmitted={handleRecordSubmitted}
            baseline={baseline}
            thresholds={thresholds}
            records={evaluatedRecords}
            inputHistoryRecords={inputHistoryRecords}
            selectedRecordId={selectedRecordId}
            onSelectRecordForDashboard={handleSelectRecordForDashboard}
            onNavigate={setActiveTab}
            onToggleWaterWash={handleToggleWaterWashRecord}
            onClearAllWaterWash={handleClearAllWaterWash}
            onDeleteRecord={handleDeleteRecord}
            onSetBaselineRecord={handleSetBaselineRecord}
            onOpenBaselineConfig={() => setIsBaselineModalOpen(true)}
            onOpenImport={() => setIsImportModalOpen(true)}
          />
        )}
      </main>

      {/* Baseline Reference Calibration Modal */}
      <BaselineConfigModal
        isOpen={isBaselineModalOpen}
        onClose={() => setIsBaselineModalOpen(false)}
        baseline={baseline}
        currentBaseline={baseline}
        records={evaluatedRecords}
        onUpdateBaseline={setBaseline}
        onSaveBaseline={setBaseline}
      />

      {/* Dataset Import Modal */}
      <DatasetImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportData={handleImportData}
      />

      {/* In-App Clear Data Confirmation Modal (100% reliable inside sandbox iframes) */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-3.5 mb-3.5">
                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-full shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Clear All Operational Data?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Permanent reset of Input History and Baseline</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-5 leading-relaxed bg-slate-50 p-3 rounded border border-slate-200">
                Are you sure you want to clear all operational data and reset the baseline calibration? All records in <strong>Input History</strong> will be deleted permanently. This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClearConfirmOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearData}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors shadow-xs"
                >
                  Yes, Clear All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Engineering Footer */}
      <footer className="border-t border-slate-200 bg-white py-3.5 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Water Washing Monitoring • Decision Logic: {WATER_WASH_DECISION_RULES.minIndicatorsMet}-out-of-4 Parameter Rule
          </span>
          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span>
              Thresholds: NPHR ≥ {thresholds.nphrWWThreshold}% | PR ≥ {thresholds.prWWThreshold}% | P3.0 ≥ {thresholds.p3WWThreshold}% | Real Power ≥ {thresholds.powerWWThreshold}%
            </span>
            <span>•</span>
            <span>Early Monitoring: NPHR {thresholds.nphrEarlyMonitoring}%</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
