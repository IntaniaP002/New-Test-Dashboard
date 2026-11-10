import React, { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { OperatorInputView } from './components/OperatorInputView';
import { PBSynthesisView } from './components/PBSynthesisView';
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
  aggregateRecordsByDailyAverage,
  compareRecordsChronologically,
  deriveWaterWashEvents,
  evaluateOperationalRecord,
  isTimeInRange19to21,
} from './utils/calculations';
import {
  calculateOverallForecast,
} from './utils/forecastEngine';
import { standardizeDate } from './utils/dataNormalizer';

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
    if (saved === 'dashboard' || saved === 'input' || saved === 'pbSynthesis') {
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
        const b = JSON.parse(saved);
        if (b && typeof b.date === 'string') {
          b.date = standardizeDate(b.date);
        }
        return b;
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
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // If all or majority (>60%) of records were marked as WW due to the previous filename ("WW1") bug,
          // reset them so when data is first displayed, it starts with "+ Tag WW" and lets user choose manually
          if (parsed.length > 2 && parsed.filter((r: any) => r.isWaterWashEvent).length > parsed.length * 0.6) {
            parsed = parsed.map((r: any) => ({
              ...r,
              isWaterWashEvent: false,
              notes: r.notes === 'Water Wash Event' ? undefined : r.notes,
            }));
          }

          // Auto-correct any dates (including previously inverted DD/MM dates like 2026-01-11..2026-05-11 -> 2026-11-01..2026-11-05 and 2026-01-10..2026-05-10 -> 2026-10-01..2026-10-05)
          parsed = parsed.map((r: any) => {
            if (typeof r.date === 'string') {
              const fixedDate = standardizeDate(r.date);
              if (fixedDate !== r.date) {
                return {
                  ...r,
                  date: fixedDate,
                  id: typeof r.id === 'string' ? r.id.replace(r.date, fixedDate) : r.id,
                  notes: typeof r.notes === 'string' ? r.notes.replace(r.date, fixedDate) : r.notes,
                };
              }
            }
            return r;
          });

          // Sort chronologically
          parsed.sort((a: any, b: any) => {
            const cmp = (a.date || '').localeCompare(b.date || '');
            if (cmp !== 0) return cmp;
            return (a.time || '').localeCompare(b.time || '');
          });

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

  // Selected Record for PB Synthesis Inspection
  const [selectedPbRecordId, setSelectedPbRecordId] = useState<string | null>(null);

  const handleSelectRecordForPbSynthesis = (recordId: string | null) => {
    setSelectedPbRecordId(recordId);
    setActiveTab('pbSynthesis');
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
    return aggregateRecordsByDailyAverage(evaluatedRecords, baseline, thresholds);
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

  // Updates PB Synthesis for a specific record
  const handleUpdateRecordPBSynthesis = (
    recordId: string,
    pbSynthesis: number | null,
    pbSynthesisDB?: number | null,
    fNH?: number | null,
    pt006?: number | null,
    nhSpeed?: number | null,
    x1?: number | null,
    y1?: number | null,
    x2?: number | null,
    y2?: number | null,
    upperMultiplier?: number | null,
    lowerMultiplier?: number | null
  ) => {
    const isDaily = recordId.startsWith('daily-');
    const targetDate = isDaily ? recordId.replace('daily-', '') : null;

    setRecords((prev) =>
      prev.map((r) => {
        if (r.id === recordId || (targetDate && r.date === targetDate)) {
          const updatedInput: OperationalInput = {
            ...r,
            pbSynthesis: pbSynthesis !== null && pbSynthesis > 0 ? pbSynthesis : r.pbSynthesis,
            pbSynthesisDB: pbSynthesisDB !== null && pbSynthesisDB !== undefined && pbSynthesisDB > 0 ? pbSynthesisDB : r.pbSynthesisDB,
            fNH: fNH !== null && fNH !== undefined ? fNH : r.fNH,
            pt006: pt006 !== null && pt006 !== undefined ? pt006 : (r.pt006 || r.P1_7),
            nhSpeed: nhSpeed !== null && nhSpeed !== undefined ? nhSpeed : r.nhSpeed,
            x1: x1 !== null && x1 !== undefined ? x1 : r.x1,
            y1: y1 !== null && y1 !== undefined ? y1 : r.y1,
            x2: x2 !== null && x2 !== undefined ? x2 : r.x2,
            y2: y2 !== null && y2 !== undefined ? y2 : r.y2,
            upperMultiplier: upperMultiplier ?? r.upperMultiplier ?? 1.2,
            lowerMultiplier: lowerMultiplier ?? r.lowerMultiplier ?? 0.8,
          };
          return evaluateOperationalRecord(updatedInput, r.id, baseline, thresholds);
        }
        return r;
      })
    );
  };

  // Updates PB Synthesis for records matching date and optional time (or creates a record if none exists)
  const handleUpdateDatePBSynthesis = (
    date: string,
    time: string | undefined,
    pbSynthesis: number | null,
    manualPbAktual?: number | null,
    pbSynthesisDB?: number | null,
    fNH?: number | null,
    pt006?: number | null,
    nhSpeed?: number | null,
    x1?: number | null,
    y1?: number | null,
    x2?: number | null,
    y2?: number | null,
    upperMultiplier?: number | null,
    lowerMultiplier?: number | null,
    setAsPbBaseline?: boolean
  ) => {
    setRecords((prev) => {
      const cleanTime = time?.trim().slice(0, 5);
      let matchedCount = 0;

      // If this record should be set as the active PB baseline, reset any previous baseline flags
      const shouldBeBaseline = !!setAsPbBaseline;

      // 1. Try to match both date and exact time first
      let updatedList = prev.map((r) => {
        const isDateMatch = r.date === date;
        const rTimeClean = r.time?.trim().slice(0, 5);
        const isTimeMatch = !cleanTime || rTimeClean === cleanTime || r.time?.includes('Average');

        if (isDateMatch && isTimeMatch) {
          matchedCount++;
          const p3Val = manualPbAktual && manualPbAktual > 0 ? manualPbAktual : r.P3_0;
          const p1Val = pt006 && pt006 > 0 ? pt006 : r.P1_7;
          const updatedInput: OperationalInput = {
            ...r,
            P1_7: p1Val,
            P3_0: p3Val,
            pbSynthesis: pbSynthesis !== null && pbSynthesis > 0 ? pbSynthesis : r.pbSynthesis,
            pbSynthesisDB: pbSynthesisDB !== null && pbSynthesisDB !== undefined && pbSynthesisDB > 0 ? pbSynthesisDB : r.pbSynthesisDB,
            fNH: fNH !== null && fNH !== undefined ? fNH : r.fNH,
            pt006: pt006 !== null && pt006 !== undefined ? pt006 : (r.pt006 || r.P1_7),
            nhSpeed: nhSpeed !== null && nhSpeed !== undefined ? nhSpeed : r.nhSpeed,
            x1: x1 !== null && x1 !== undefined ? x1 : r.x1,
            y1: y1 !== null && y1 !== undefined ? y1 : r.y1,
            x2: x2 !== null && x2 !== undefined ? x2 : r.x2,
            y2: y2 !== null && y2 !== undefined ? y2 : r.y2,
            upperMultiplier: upperMultiplier ?? r.upperMultiplier ?? 1.2,
            lowerMultiplier: lowerMultiplier ?? r.lowerMultiplier ?? 0.8,
            isPbBaseline: shouldBeBaseline ? true : r.isPbBaseline,
          };
          return evaluateOperationalRecord(updatedInput, r.id, baseline, thresholds);
        } else if (shouldBeBaseline && r.isPbBaseline) {
          // Reset other records' baseline status
          const updatedInput: OperationalInput = {
            ...r,
            isPbBaseline: false,
          };
          return evaluateOperationalRecord(updatedInput, r.id, baseline, thresholds);
        }
        return r;
      });

      // 2. If no exact time matched, update all records on that date
      if (matchedCount === 0 && prev.some((r) => r.date === date)) {
        updatedList = prev.map((r) => {
          if (r.date === date) {
            matchedCount++;
            const p3Val = manualPbAktual && manualPbAktual > 0 ? manualPbAktual : r.P3_0;
            const p1Val = pt006 && pt006 > 0 ? pt006 : r.P1_7;
            const updatedInput: OperationalInput = {
              ...r,
              P1_7: p1Val,
              P3_0: p3Val,
              pbSynthesis: pbSynthesis !== null && pbSynthesis > 0 ? pbSynthesis : r.pbSynthesis,
              pbSynthesisDB: pbSynthesisDB !== null && pbSynthesisDB !== undefined && pbSynthesisDB > 0 ? pbSynthesisDB : r.pbSynthesisDB,
              fNH: fNH !== null && fNH !== undefined ? fNH : r.fNH,
              pt006: pt006 !== null && pt006 !== undefined ? pt006 : (r.pt006 || r.P1_7),
              nhSpeed: nhSpeed !== null && nhSpeed !== undefined ? nhSpeed : r.nhSpeed,
              x1: x1 !== null && x1 !== undefined ? x1 : r.x1,
              y1: y1 !== null && y1 !== undefined ? y1 : r.y1,
              x2: x2 !== null && x2 !== undefined ? x2 : r.x2,
              y2: y2 !== null && y2 !== undefined ? y2 : r.y2,
              upperMultiplier: upperMultiplier ?? r.upperMultiplier ?? 1.2,
              lowerMultiplier: lowerMultiplier ?? r.lowerMultiplier ?? 0.8,
              isPbBaseline: shouldBeBaseline ? true : r.isPbBaseline,
            };
            return evaluateOperationalRecord(updatedInput, r.id, baseline, thresholds);
          } else if (shouldBeBaseline && r.isPbBaseline) {
            const updatedInput: OperationalInput = {
              ...r,
              isPbBaseline: false,
            };
            return evaluateOperationalRecord(updatedInput, r.id, baseline, thresholds);
          }
          return r;
        });
      }

      // 3. If no records existed for that date at all, create a new record so it immediately appears in PB Synthesis monitoring!
      if (
        matchedCount === 0 &&
        ((pbSynthesis !== null && pbSynthesis > 0) ||
          (pbSynthesisDB !== null && pbSynthesisDB > 0) ||
          (fNH !== null && fNH !== undefined && fNH > 0) ||
          (nhSpeed !== null && nhSpeed !== undefined && nhSpeed > 0))
      ) {
        const p3Val = manualPbAktual && manualPbAktual > 0 ? manualPbAktual : (pbSynthesis || pbSynthesisDB || 240);
        const resolvedPT006 = pt006 && pt006 > 0 ? pt006 : 14.7;
        const newRecordInput: OperationalInput = {
          date,
          time: cleanTime || '20:00',
          P1_7: resolvedPT006,
          P3_0: p3Val,
          realPower: 35.0,
          nphr: 2500,
          pbSynthesis: pbSynthesis ?? undefined,
          pbSynthesisDB: pbSynthesisDB ?? undefined,
          fNH: fNH ?? undefined,
          nhSpeed: nhSpeed ?? undefined,
          x1: x1 ?? undefined,
          y1: y1 ?? undefined,
          x2: x2 ?? undefined,
          y2: y2 ?? undefined,
          upperMultiplier: upperMultiplier ?? 1.2,
          lowerMultiplier: lowerMultiplier ?? 0.8,
          pt006: resolvedPT006,
          isPbBaseline: shouldBeBaseline,
          notes: 'PB Synthesis & Driveback logged',
        };
        const newRecord = evaluateOperationalRecord(
          newRecordInput,
          `rec-pbsyn-${Date.now()}`,
          baseline,
          thresholds
        );
        return [...updatedList, newRecord];
      }

      return updatedList;
    });
  };

  // Explicit handler to set any record as the active PB Synthesis / Driveback baseline
  const handleSetPbBaselineRecord = (recordId: string) => {
    setRecords((prev) =>
      prev.map((r) => {
        const updatedInput: OperationalInput = {
          ...r,
          isPbBaseline: r.id === recordId,
        };
        return evaluateOperationalRecord(updatedInput, r.id, baseline, thresholds);
      })
    );
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
    localStorage.removeItem('pb_synthesis_uploaded_records_v6');
    setIsClearConfirmOpen(false);
    setActiveTab('input');
  };

  // Import dataset handler
  const handleImportData = (rawInputs: OperationalInput[], setAsBaseline?: boolean) => {
    // When data is first imported/displayed, do NOT mark as WW Event.
    // Let user choose manually which date is WW (+ Tag WW first).
    const sanitizedInputs = rawInputs.map((input) => ({
      ...input,
      date: standardizeDate(input.date),
      isWaterWashEvent: false,
      notes: input.notes === 'Water Wash Event' ? undefined : input.notes,
    }));

    const newInputs = [...sanitizedInputs].sort((a, b) => a.date.localeCompare(b.date));
    let activeBaseline = baseline;

    if (setAsBaseline && newInputs.length > 0) {
      const firstDate = newInputs[0].date;
      const allFirstDay = newInputs.filter((i) => i.date === firstDate);
      const window19to21 = allFirstDay.filter((i) => isTimeInRange19to21(i.time));
      const power20to24 = allFirstDay.filter((i) => i.realPower >= 20.0 && i.realPower <= 24.0);
      const firstDayInputs =
        window19to21.length > 0
          ? window19to21
          : power20to24.length > 0
          ? power20to24
          : allFirstDay;

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
        time: firstDayInputs.length > 1 ? 'Daily Average' : newInputs[0].time,
        referenceDescription:
          firstDayInputs.length > 1
            ? `Imported daily average baseline (${firstDate}, ${firstDayInputs.length} readings)`
            : `Imported baseline (${firstDate} ${newInputs[0].time})`,
        setAt: new Date().toISOString(),
      };
      setBaseline(activeBaseline);
    }

    const timestampNow = Date.now();
    const evaluated = newInputs.map((input, idx) =>
      evaluateOperationalRecord(
        input,
        `imp-${timestampNow}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        activeBaseline,
        thresholds
      )
    );

    setSelectedRecordId(null);

    // Append newly imported records to existing records (increasing input history total)
    setRecords((prev) => {
      const combined = [...prev, ...evaluated];
      combined.sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp;
        return (a.time || '').localeCompare(b.time || '');
      });
      return combined;
    });
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

    const isAvg = record.isDailyAverage || record.isDailyMedian || record.time?.toLowerCase().includes('average') || record.time?.toLowerCase().includes('median');
    const desc = isAvg
      ? `Daily average baseline from ${record.date}${
          record.hourlyObservationsCount && record.hourlyObservationsCount > 1
            ? ` (${record.hourlyObservationsCount} readings)`
            : ''
        }`
      : `Operational baseline established from record on ${record.date} ${record.time}`;

    const newBaseline: BaselineConfig = {
      isConfigured: true,
      sourceRecordId: record.id,
      date: record.date,
      time: isAvg ? 'Daily Average' : record.time,
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
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-3 sm:p-5 lg:p-6">
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
            selectedPbRecordId={selectedPbRecordId}
            onSelectRecordForPbSynthesis={handleSelectRecordForPbSynthesis}
            onNavigate={setActiveTab}
            onToggleWaterWash={handleToggleWaterWashRecord}
            onClearAllWaterWash={handleClearAllWaterWash}
            onDeleteRecord={handleDeleteRecord}
            onClearAllData={handleClearData}
            onSetBaselineRecord={handleSetBaselineRecord}
            onOpenBaselineConfig={() => setIsBaselineModalOpen(true)}
            onOpenImport={() => setIsImportModalOpen(true)}
          />
        )}
        {activeTab === 'pbSynthesis' && (
          <PBSynthesisView
            records={evaluatedRecords}
            inputHistoryRecords={inputHistoryRecords}
            selectedRecordId={selectedPbRecordId}
            onSelectRecord={setSelectedPbRecordId}
            onNavigateToInput={() => setActiveTab('input')}
            onUpdateRecordPBSynthesis={handleUpdateRecordPBSynthesis}
            onUpdateDatePBSynthesis={handleUpdateDatePBSynthesis}
            onSetPbBaselineRecord={handleSetPbBaselineRecord}
            onDeleteRecord={handleDeleteRecord}
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
        existingRecords={records}
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
                  <h3 className="text-base font-bold text-slate-900">Hapus Semua Data Operasional?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Permanent reset of all Input History &amp; Baseline</p>
                </div>
              </div>
              <div className="space-y-3 mb-5 text-xs text-slate-600">
                <p className="leading-relaxed bg-rose-50/80 p-3 rounded-lg border border-rose-200 text-rose-900">
                  Apakah Anda yakin ingin menghapus <strong>seluruh data operasional ({records.length} data entri)</strong>? Seluruh data riwayat input harian dan pembacaan PB Synthesis akan dihapus secara permanen. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Semua kalibrasi baseline dan catatan log operasional akan di-reset ke kondisi awal.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClearConfirmOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearData}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Hapus Semua Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Engineering Footer */}
      <footer className="border-t border-slate-200 bg-white py-3.5 px-4 text-center text-xs text-slate-500">
        <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
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
