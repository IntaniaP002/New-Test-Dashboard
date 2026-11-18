import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithPopup, User } from 'firebase/auth';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { OperatorInputView } from './components/OperatorInputView';
import { PBSynthesisView } from './components/PBSynthesisView';
import { DatasetImportModal } from './components/DatasetImportModal';
import { BaselineConfigModal } from './components/BaselineConfigModal';
import {
  Trash2,
  CheckCircle2,
  Sparkles,
  X,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  ExternalLink,
  LogIn,
} from 'lucide-react';
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
import { calculateOverallForecast } from './utils/forecastEngine';
import { standardizeDate } from './utils/dataNormalizer';
import {
  classifyImportRows,
  deduplicateExistingRecords,
  normalizeTimeString,
} from './utils/duplicateValidation';
import { auth, firebaseConfig, googleProvider } from './firebase';
import {
  createOperationalRecordInCloud,
  deleteOperationalRecordsInCloud,
  sanitizeDocId,
  savePlantBaselineInCloud,
  setPbBaselineFlagsInCloud,
  StoredOperationalInput,
  subscribeOperationalRecords,
  subscribePlantBaseline,
  subscribePlantThresholds,
  updateOperationalRecordInCloud,
  updateRecordPBSynthesisBatchInCloud,
  updateWaterWashTagsInCloud,
  upsertOperationalRecordsBatchInCloud,
} from './services/firestoreSync';

const LEGACY_STORAGE_KEYS = {
  RECORDS: 'gt_ww_records_v5',
  BASELINE: 'gt_ww_baseline_v5',
  THRESHOLDS: 'gt_ww_thresholds_v5',
  ACTIVE_TAB: 'gt_ww_active_tab_v5',
  MIGRATION_DISMISSED: 'gt_ww_cloud_migration_dismissed_v1',
};

function loadLegacyLocalRecords(): OperationalInput[] {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEYS.RECORDS);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.date === 'string' && typeof r.P1_7 === 'number' && typeof r.P3_0 === 'number')
      .map((r) => ({
        date: standardizeDate(r.date),
        time: typeof r.time === 'string' ? r.time : '19:00:00',
        T1_7: r.T1_7 ?? undefined,
        P1_7: Number(r.P1_7),
        P3_0: Number(r.P3_0),
        realPower: Number(r.realPower ?? 0),
        pbSynthesis: r.pbSynthesis ?? undefined,
        pbSynthesisDB: r.pbSynthesisDB ?? undefined,
        fNH: r.fNH ?? undefined,
        nhSpeed: r.nhSpeed ?? undefined,
        x1: r.x1 ?? undefined,
        y1: r.y1 ?? undefined,
        x2: r.x2 ?? undefined,
        y2: r.y2 ?? undefined,
        upperMultiplier: r.upperMultiplier ?? undefined,
        lowerMultiplier: r.lowerMultiplier ?? undefined,
        pt006: r.pt006 ?? undefined,
        isDrivebackWWRecommended: Boolean(r.isDrivebackWWRecommended),
        isPbBaseline: Boolean(r.isPbBaseline),
        isWaterWashEvent: Boolean(r.isWaterWashEvent),
        waterWashEventNumber: r.waterWashEventNumber ?? undefined,
        notes: typeof r.notes === 'string' ? r.notes : undefined,
      }));
  } catch {
    return [];
  }
}

function loadLegacyLocalBaseline(): BaselineConfig | null {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEYS.BASELINE);
    if (!saved) return null;
    const b = JSON.parse(saved);
    if (b && b.isConfigured) {
      return {
        ...b,
        date: typeof b.date === 'string' ? standardizeDate(b.date) : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  // Per-browser navigation state
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(() => {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEYS.ACTIVE_TAB);
    if (saved === 'dashboard' || saved === 'input' || saved === 'pbSynthesis') {
      return saved;
    }
    return 'input';
  });

  const [showInstructions, setShowInstructions] = useState<boolean>(true);

  // Firebase Auth & Sync State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [anonymousSetupNeeded, setAnonymousSetupNeeded] = useState<boolean>(false);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [cloudRecordsLoaded, setCloudRecordsLoaded] = useState<boolean>(false);
  const [fatalSyncError, setFatalSyncError] = useState<Error | null>(null);

  // Cloud-synced shared operational state
  const [rawCloudRecords, setRawCloudRecords] = useState<StoredOperationalInput[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [baseline, setBaseline] = useState<BaselineConfig>(DEFAULT_BASELINE);

  // Legacy local migration prompt (for data stored in localStorage before cloud sync)
  const [legacyRecords, setLegacyRecords] = useState<OperationalInput[]>(() => {
    if (localStorage.getItem(LEGACY_STORAGE_KEYS.MIGRATION_DISMISSED) === '1') return [];
    return loadLegacyLocalRecords();
  });
  const [isMigratingLocal, setIsMigratingLocal] = useState<boolean>(false);

  // Modals State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBaselineModalOpen, setIsBaselineModalOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Selected Historical Records
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedPbRecordId, setSelectedPbRecordId] = useState<string | null>(null);

  // Floating Notification
  const [importNotification, setImportNotification] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    details?: string;
  } | null>(null);

  useEffect(() => {
    if (importNotification) {
      const timer = setTimeout(() => {
        setImportNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [importNotification]);

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_STORAGE_KEYS.ACTIVE_TAB, activeTab);
    } catch {
      /* ignore storage errors */
    }
  }, [activeTab]);

  // Silent Anonymous Auth initialization (zero login friction for operators)
  const attemptAnonymousAuth = useCallback(async () => {
    setAuthErrorMessage(null);
    try {
      await signInAnonymously(auth);
      setAnonymousSetupNeeded(false);
    } catch (err: any) {
      const code = err?.code || '';
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/admin-restricted-operation'
      ) {
        setAnonymousSetupNeeded(true);
      } else {
        setAuthErrorMessage(err?.message || 'Gagal menyambungkan sesi sinkronisasi cloud.');
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
        setAuthReady(true);
        setAnonymousSetupNeeded(false);
        setAuthErrorMessage(null);
      } else {
        setAuthUser(null);
        setAuthReady(true);
        void attemptAnonymousAuth();
      }
    });
    return () => unsubscribe();
  }, [attemptAnonymousAuth]);

  const handleFallbackGoogleSignIn = async () => {
    setAuthErrorMessage(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setAnonymousSetupNeeded(false);
    } catch (err: any) {
      setAuthErrorMessage(err?.message || 'Gagal masuk dengan Google.');
    }
  };

  // Attach real-time Firestore listeners once authenticated
  useEffect(() => {
    if (!authReady || !authUser) return;

    const unsubRecords = subscribeOperationalRecords(
      (list) => {
        setRawCloudRecords(list);
        setCloudRecordsLoaded(true);
      },
      (err) => {
        setFatalSyncError(err);
      }
    );

    const unsubBaseline = subscribePlantBaseline(
      (b) => {
        setBaseline(b);
      },
      (err) => {
        setFatalSyncError(err);
      }
    );

    const unsubThresholds = subscribePlantThresholds(
      (t) => {
        setThresholds(t);
      },
      (err) => {
        setFatalSyncError(err);
      }
    );

    return () => {
      unsubRecords();
      unsubBaseline();
      unsubThresholds();
    };
  }, [authReady, authUser]);

  // Surface Firestore fatal/permission errors to ErrorBoundary
  if (fatalSyncError) {
    throw fatalSyncError;
  }

  const handleCloudMutationError = (err: unknown, fallbackMessage: string) => {
    const msg = err instanceof Error ? err.message : String(err);
    const isQuota = msg.toLowerCase().includes('quota exceeded');
    setImportNotification({
      type: 'error',
      text: isQuota ? 'Kuota Harian Firestore Tercapai' : fallbackMessage,
      details: isQuota
        ? 'Batas baca/tulis harian gratis tercapai dan akan di-reset besok, atau cek paket proyek Firebase Anda.'
        : 'Pastikan koneksi internet aktif dan sesi database sudah tersambung.',
    });
  };

  const ensureOperatorUid = (): string | null => {
    if (authUser?.uid) return authUser.uid;
    setImportNotification({
      type: 'error',
      text: 'Koneksi Cloud Database Belum Siap',
      details: anonymousSetupNeeded
        ? 'Aktifkan Anonymous Sign-In di Firebase Console atau masuk sementara dengan Google terlebih dahulu.'
        : 'Menunggu sesi sinkronisasi tersambung. Silakan coba lagi beberapa detik.',
    });
    return null;
  };

  // Evaluate raw cloud records against active baseline & thresholds
  const evaluatedRecords = useMemo<OperationalRecord[]>(() => {
    if (rawCloudRecords.length === 0) return [];
    return rawCloudRecords.map((r) =>
      evaluateOperationalRecord(r, r.id, baseline, thresholds)
    );
  }, [rawCloudRecords, baseline, thresholds]);

  const derivedEvents = useMemo(() => {
    return deriveWaterWashEvents(evaluatedRecords);
  }, [evaluatedRecords]);

  const inputHistoryRecords = useMemo(() => {
    return aggregateRecordsByDailyAverage(evaluatedRecords, baseline, thresholds);
  }, [evaluatedRecords, baseline, thresholds]);

  const latestRecord = useMemo(() => {
    if (inputHistoryRecords.length > 0) {
      const sorted = [...inputHistoryRecords].sort(compareRecordsChronologically);
      return sorted[sorted.length - 1];
    }
    if (evaluatedRecords.length === 0) return null;
    const sorted = [...evaluatedRecords].sort(compareRecordsChronologically);
    return sorted[sorted.length - 1];
  }, [inputHistoryRecords, evaluatedRecords]);

  const forecastSummary = useMemo(() => {
    return calculateOverallForecast(inputHistoryRecords, baseline, thresholds);
  }, [inputHistoryRecords, baseline, thresholds]);

  const handleSelectRecordForDashboard = (recordId: string | null) => {
    setSelectedRecordId(recordId);
    setActiveTab('dashboard');
  };

  const handleSelectRecordForPbSynthesis = (recordId: string | null) => {
    setSelectedPbRecordId(recordId);
    setActiveTab('pbSynthesis');
  };

  // One-click upload of pre-existing local browser data to Firestore
  const handleMigrateLegacyLocalData = async () => {
    const uid = ensureOperatorUid();
    if (!uid || legacyRecords.length === 0) return;
    setIsMigratingLocal(true);
    try {
      const localBaseline = loadLegacyLocalBaseline();
      if (localBaseline && !baseline.isConfigured) {
        await savePlantBaselineInCloud(localBaseline, uid);
      }

      const timestampNow = Date.now();
      const creates = legacyRecords.map((input, idx) => ({
        id: `mig-${timestampNow}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        input,
      }));
      await upsertOperationalRecordsBatchInCloud(creates, [], uid);

      localStorage.setItem(LEGACY_STORAGE_KEYS.MIGRATION_DISMISSED, '1');
      setLegacyRecords([]);
      setImportNotification({
        type: 'success',
        text: `${creates.length} data lokal berhasil disinkronkan ke Cloud Database!`,
        details: 'Semua perangkat lain yang membuka dashboard ini sekarang akan melihat data yang sama.',
      });
    } catch (err) {
      handleCloudMutationError(err, 'Gagal mengunggah data lokal ke cloud.');
    } finally {
      setIsMigratingLocal(false);
    }
  };

  const handleDismissLegacyMigration = () => {
    localStorage.setItem(LEGACY_STORAGE_KEYS.MIGRATION_DISMISSED, '1');
    setLegacyRecords([]);
  };

  // Record Submission Handler (writes directly to Firestore -> syncs all devices)
  const handleRecordSubmitted = async (
    input: OperationalInput,
    setAsBaseline?: boolean
  ): Promise<{ success: boolean; message: string }> => {
    const uid = ensureOperatorUid();
    if (!uid) {
      return {
        success: false,
        message: 'Database cloud belum terhubung. Selesaikan aktivasi koneksi terlebih dahulu.',
      };
    }

    try {
      if (setAsBaseline || !baseline.isConfigured) {
        const pr = input.P1_7 > 0 ? Number((input.P3_0 / input.P1_7).toFixed(4)) : null;
        const activeBaseline: BaselineConfig = {
          isConfigured: true,
          T1_7: input.T1_7,
          P1_7: input.P1_7,
          P3_0: input.P3_0,
          PR: pr,
          realPower: input.realPower,
          referenceDescription: `Operational baseline established on ${input.date}`,
          setAt: new Date().toISOString(),
          date: input.date,
          time: input.time,
        };
        await savePlantBaselineInCloud(activeBaseline, uid);
      }

      const newId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await createOperationalRecordInCloud(newId, input, uid);

      return { success: true, message: 'Data berhasil disimpan dan disinkronkan ke semua perangkat.' };
    } catch (err) {
      handleCloudMutationError(err, 'Gagal menyimpan data ke cloud.');
      return { success: false, message: 'Gagal menyimpan data ke cloud database.' };
    }
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
    const uid = ensureOperatorUid();
    if (!uid) return;

    const isDaily = recordId.startsWith('daily-');
    const targetDate = isDaily ? recordId.replace('daily-', '') : null;

    const matching = evaluatedRecords.filter(
      (r) => r.id === recordId || (targetDate && r.date === targetDate)
    );
    if (matching.length === 0) return;

    const updates = matching.map((r) => ({
      id: r.id,
      pbSynthesis: pbSynthesis !== null && pbSynthesis > 0 ? pbSynthesis : (r.pbSynthesis ?? null),
      pbSynthesisDB:
        pbSynthesisDB !== null && pbSynthesisDB !== undefined && pbSynthesisDB > 0
          ? pbSynthesisDB
          : (r.pbSynthesisDB ?? null),
      fNH: fNH !== null && fNH !== undefined ? fNH : (r.fNH ?? null),
      pt006: pt006 !== null && pt006 !== undefined ? pt006 : (r.pt006 ?? r.P1_7),
      nhSpeed: nhSpeed !== null && nhSpeed !== undefined ? nhSpeed : (r.nhSpeed ?? null),
      x1: x1 !== null && x1 !== undefined ? x1 : (r.x1 ?? null),
      y1: y1 !== null && y1 !== undefined ? y1 : (r.y1 ?? null),
      x2: x2 !== null && x2 !== undefined ? x2 : (r.x2 ?? null),
      y2: y2 !== null && y2 !== undefined ? y2 : (r.y2 ?? null),
      upperMultiplier: upperMultiplier ?? r.upperMultiplier ?? 1.2,
      lowerMultiplier: lowerMultiplier ?? r.lowerMultiplier ?? 0.8,
    }));

    void updateRecordPBSynthesisBatchInCloud(updates, uid).catch((err) =>
      handleCloudMutationError(err, 'Gagal memperbarui data PB Synthesis di cloud.')
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
    const uid = ensureOperatorUid();
    if (!uid) return;

    const normClean = (t?: string | null) => {
      if (!t || !t.trim()) return '';
      const parts = t.trim().split(/[:.]/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        const hh = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const ss = parts.length >= 3 && parts[2] && /^\d+$/.test(parts[2]) ? parts[2].padStart(2, '0') : '00';
        return `${hh}:${mm}:${ss}`;
      }
      return t.trim();
    };
    const cleanTime = normClean(time);
    const shouldBeBaseline = !!setAsPbBaseline;

    let targets = evaluatedRecords.filter((r) => {
      const isDateMatch = r.date === date;
      const rTimeClean = normClean(r.time);
      const isTimeMatch = !cleanTime || rTimeClean === cleanTime || r.time?.includes('Average');
      return isDateMatch && isTimeMatch;
    });

    if (targets.length === 0) {
      targets = evaluatedRecords.filter((r) => r.date === date);
    }

    if (targets.length > 0) {
      const targetIds = new Set(targets.map((t) => t.id));
      const updates: Parameters<typeof updateRecordPBSynthesisBatchInCloud>[0] = targets.map((r) => ({
        id: r.id,
        P1_7: pt006 && pt006 > 0 ? pt006 : r.P1_7,
        P3_0: manualPbAktual && manualPbAktual > 0 ? manualPbAktual : r.P3_0,
        pbSynthesis: pbSynthesis !== null && pbSynthesis > 0 ? pbSynthesis : (r.pbSynthesis ?? null),
        pbSynthesisDB:
          pbSynthesisDB !== null && pbSynthesisDB !== undefined && pbSynthesisDB > 0
            ? pbSynthesisDB
            : (r.pbSynthesisDB ?? null),
        fNH: fNH !== null && fNH !== undefined ? fNH : (r.fNH ?? null),
        pt006: pt006 !== null && pt006 !== undefined ? pt006 : (r.pt006 ?? r.P1_7),
        nhSpeed: nhSpeed !== null && nhSpeed !== undefined ? nhSpeed : (r.nhSpeed ?? null),
        x1: x1 !== null && x1 !== undefined ? x1 : (r.x1 ?? null),
        y1: y1 !== null && y1 !== undefined ? y1 : (r.y1 ?? null),
        x2: x2 !== null && x2 !== undefined ? x2 : (r.x2 ?? null),
        y2: y2 !== null && y2 !== undefined ? y2 : (r.y2 ?? null),
        upperMultiplier: upperMultiplier ?? r.upperMultiplier ?? 1.2,
        lowerMultiplier: lowerMultiplier ?? r.lowerMultiplier ?? 0.8,
        isPbBaseline: shouldBeBaseline ? true : Boolean(r.isPbBaseline),
      }));

      if (shouldBeBaseline) {
        evaluatedRecords.forEach((r) => {
          if (!targetIds.has(r.id) && r.isPbBaseline) {
            updates.push({ id: r.id, isPbBaseline: false });
          }
        });
      }

      void updateRecordPBSynthesisBatchInCloud(updates, uid).catch((err) =>
        handleCloudMutationError(err, 'Gagal memperbarui PB Synthesis di cloud.')
      );
      return;
    }

    if (
      (pbSynthesis !== null && pbSynthesis > 0) ||
      (pbSynthesisDB !== null && pbSynthesisDB > 0) ||
      (fNH !== null && fNH !== undefined && fNH > 0) ||
      (nhSpeed !== null && nhSpeed !== undefined && nhSpeed > 0)
    ) {
      const p3Val = manualPbAktual && manualPbAktual > 0 ? manualPbAktual : (pbSynthesis || pbSynthesisDB || 240);
      const resolvedPT006 = pt006 && pt006 > 0 ? pt006 : 14.7;
      const newRecordInput: OperationalInput = {
        date,
        time: cleanTime || '20:00:00',
        P1_7: resolvedPT006,
        P3_0: p3Val,
        realPower: 35.0,
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

      const resetOthers = shouldBeBaseline
        ? evaluatedRecords.filter((r) => r.isPbBaseline).map((r) => ({ id: r.id, isPbBaseline: false }))
        : [];

      void Promise.all([
        createOperationalRecordInCloud(`rec-pbsyn-${Date.now()}`, newRecordInput, uid),
        resetOthers.length > 0 ? updateRecordPBSynthesisBatchInCloud(resetOthers, uid) : Promise.resolve(),
      ]).catch((err) => handleCloudMutationError(err, 'Gagal menyimpan record PB Synthesis ke cloud.'));
    }
  };

  // Explicit handler to set any record as the active PB Synthesis / Driveback baseline
  const handleSetPbBaselineRecord = (recordId: string) => {
    const uid = ensureOperatorUid();
    if (!uid) return;
    void setPbBaselineFlagsInCloud(evaluatedRecords, recordId, uid).catch((err) =>
      handleCloudMutationError(err, 'Gagal mengubah PB Baseline di cloud.')
    );
  };

  const handleClearData = () => {
    setIsClearConfirmOpen(true);
  };

  const handleConfirmClearData = async () => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    const allIds = evaluatedRecords.map((r) => r.id);
    try {
      await Promise.all([
        deleteOperationalRecordsInCloud(allIds),
        savePlantBaselineInCloud(DEFAULT_BASELINE, uid),
      ]);
      localStorage.removeItem(LEGACY_STORAGE_KEYS.RECORDS);
      localStorage.removeItem(LEGACY_STORAGE_KEYS.BASELINE);
      localStorage.removeItem('pb_synthesis_uploaded_records_v6');
      localStorage.setItem(LEGACY_STORAGE_KEYS.MIGRATION_DISMISSED, '1');
      setLegacyRecords([]);
      setSelectedRecordId(null);
      setIsClearConfirmOpen(false);
      setActiveTab('input');
    } catch (err) {
      handleCloudMutationError(err, 'Gagal menghapus seluruh data dari cloud.');
    }
  };

  // Import dataset handler -> Smart Upsert directly into Firestore
  const handleImportData = async (rawInputs: OperationalInput[], setAsBaseline?: boolean) => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    const sanitizedInputs = rawInputs.map((input) => ({
      ...input,
      date: standardizeDate(input.date),
      isWaterWashEvent: false,
      notes: input.notes === 'Water Wash Event' ? undefined : input.notes,
    }));

    const newInputs = [...sanitizedInputs].sort((a, b) => a.date.localeCompare(b.date));

    try {
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
        }

        const pr = p1 > 0 ? Number((p3 / p1).toFixed(4)) : null;

        const nextBaseline: BaselineConfig = {
          isConfigured: true,
          T1_7: t1,
          P1_7: p1,
          P3_0: p3,
          PR: pr,
          realPower: pw,
          date: firstDate,
          time: firstDayInputs.length > 1 ? 'Daily Average' : newInputs[0].time,
          referenceDescription:
            firstDayInputs.length > 1
              ? `Imported daily average baseline (${firstDate}, ${firstDayInputs.length} readings)`
              : `Imported baseline (${firstDate} ${newInputs[0].time})`,
          setAt: new Date().toISOString(),
        };
        await savePlantBaselineInCloud(nextBaseline, uid);
      }

      setSelectedRecordId(null);

      // Deduplicate within the incoming Excel batch
      const dedupedByKey = new Map<string, OperationalInput>();
      sanitizedInputs.forEach((input, idx) => {
        const key = `${standardizeDate(input.date)}__${normalizeTimeString(input.time || '19:00:00')}` || `__row_${idx}`;
        dedupedByKey.set(key, input);
      });
      const dedupedIncoming = Array.from(dedupedByKey.values());

      const { newRows, updatedRows, identicalRows } = classifyImportRows(dedupedIncoming, evaluatedRecords);

      const timestampNow = Date.now();
      const creates = newRows.map(({ row, index }) => ({
        id: `imp-${timestampNow}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        input: row,
      }));
      const updates = updatedRows.map(({ row, existingRecord }) => ({
        id: existingRecord.id,
        input: {
          ...row,
          isWaterWashEvent: existingRecord.isWaterWashEvent,
          notes: existingRecord.notes || row.notes,
        },
      }));

      await upsertOperationalRecordsBatchInCloud(creates, updates, uid);

      const addedCount = creates.length;
      const updatedCount = updates.length;
      const identicalCount = identicalRows.length;

      if (addedCount > 0 || updatedCount > 0) {
        setImportNotification({
          type: 'success',
          text: `Sinkronisasi Cloud & Excel Berhasil: ${addedCount} data baru ditambahkan, ${updatedCount} data diperbarui.`,
          details:
            identicalCount > 0
              ? `${identicalCount} data identik dipertahankan tanpa membuat duplikasi ganda.`
              : 'Perubahan otomatis terlihat di semua perangkat.',
        });
      } else if (identicalCount > 0) {
        setImportNotification({
          type: 'info',
          text: `Semua ${identicalCount} baris data dari berkas Excel sudah ada di sistem.`,
          details: 'Tidak ada data ganda yang dibuat.',
        });
      }
    } catch (err) {
      handleCloudMutationError(err, 'Gagal mengimpor dataset ke cloud database.');
    }
  };

  // Deduplicate existing cloud records
  const handleDeduplicateRecords = () => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    const { cleanedRecords, removedCount } = deduplicateExistingRecords(evaluatedRecords);
    if (removedCount === 0) {
      setImportNotification({
        type: 'info',
        text: 'Riwayat data sudah bersih dan tidak memiliki rekaman ganda.',
      });
      return;
    }

    const keptIds = new Set(cleanedRecords.map((r) => r.id));
    const duplicateIds = evaluatedRecords.filter((r) => !keptIds.has(r.id)).map((r) => r.id);
    const originalById = new Map<string, OperationalRecord>(
      evaluatedRecords.map((r): [string, OperationalRecord] => [r.id, r])
    );
    const wwUpdates = cleanedRecords
      .filter((r) => {
        const orig = originalById.get(r.id);
        return orig && Boolean(orig.isWaterWashEvent) !== Boolean(r.isWaterWashEvent);
      })
      .map((r) => ({
        id: r.id,
        isWaterWashEvent: Boolean(r.isWaterWashEvent),
        notes: r.isWaterWashEvent ? 'Water Wash Event' : null,
      }));

    void Promise.all([
      deleteOperationalRecordsInCloud(duplicateIds),
      updateWaterWashTagsInCloud(wwUpdates, uid),
    ])
      .then(() => {
        setImportNotification({
          type: 'success',
          text: `Berhasil membersihkan ${removedCount} data ganda dari cloud database!`,
          details: `Sekarang tersisa ${cleanedRecords.length} rekaman operasional unik.`,
        });
      })
      .catch((err) => handleCloudMutationError(err, 'Gagal membersihkan data ganda di cloud.'));
  };

  // Clear all WW tags back to '+ Tag WW'
  const handleClearAllWaterWash = () => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    const wwRecords = evaluatedRecords.filter((r) => r.isWaterWashEvent || r.notes === 'Water Wash Event');
    if (wwRecords.length === 0) return;

    const updates = wwRecords.map((r) => ({
      id: r.id,
      isWaterWashEvent: false,
      notes: r.notes === 'Water Wash Event' ? null : (r.notes ?? null),
    }));

    void updateWaterWashTagsInCloud(updates, uid).catch((err) =>
      handleCloudMutationError(err, 'Gagal menghapus tag Water Wash di cloud.')
    );
  };

  // Toggle Water Wash status of an existing record or daily median group
  const handleToggleWaterWashRecord = (recordId: string) => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    let targetDate: string | null = null;
    let nextWW = false;

    if (recordId.startsWith('daily-')) {
      targetDate = recordId.replace('daily-', '');
      const anyWW = evaluatedRecords.some((r) => r.date === targetDate && r.isWaterWashEvent);
      nextWW = !anyWW;
    } else {
      const target = evaluatedRecords.find((r) => r.id === recordId);
      if (!target) return;
      targetDate = target.date;
      nextWW = !target.isWaterWashEvent;
    }

    const updates = evaluatedRecords
      .filter((r) => r.date === targetDate)
      .map((r) => ({
        id: r.id,
        isWaterWashEvent: nextWW,
        notes: nextWW ? 'Water Wash Event' : null,
      }));

    void updateWaterWashTagsInCloud(updates, uid).catch((err) =>
      handleCloudMutationError(err, 'Gagal memperbarui Tag WW di cloud.')
    );
  };

  // Delete a specific record or all records for a date
  const handleDeleteRecord = (recordId: string) => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    const idsToDelete = recordId.startsWith('daily-')
      ? evaluatedRecords.filter((r) => r.date === recordId.replace('daily-', '')).map((r) => r.id)
      : [recordId];

    if (idsToDelete.length === 0) return;

    void deleteOperationalRecordsInCloud(idsToDelete).catch((err) =>
      handleCloudMutationError(err, 'Gagal menghapus rekaman dari cloud.')
    );
  };

  // Edit an existing operational record and sync to cloud
  const handleEditRecord = async (
    recordId: string,
    updatedInput: OperationalInput
  ): Promise<{ success: boolean; message: string }> => {
    const uid = ensureOperatorUid();
    if (!uid) {
      return {
        success: false,
        message: 'Database cloud belum terhubung. Selesaikan aktivasi koneksi terlebih dahulu.',
      };
    }

    try {
      await updateOperationalRecordInCloud(recordId, updatedInput, uid);

      if (baseline.isConfigured && baseline.sourceRecordId === recordId) {
        const pr =
          updatedInput.P1_7 > 0 ? Number((updatedInput.P3_0 / updatedInput.P1_7).toFixed(4)) : null;
        await savePlantBaselineInCloud(
          {
            ...baseline,
            date: updatedInput.date,
            time: updatedInput.time,
            T1_7: updatedInput.T1_7,
            P1_7: updatedInput.P1_7,
            P3_0: updatedInput.P3_0,
            PR: pr,
            realPower: updatedInput.realPower,
            referenceDescription: `Operational baseline established from record on ${updatedInput.date} ${updatedInput.time}`,
            setAt: new Date().toISOString(),
          },
          uid
        );
      }

      setImportNotification({
        type: 'success',
        text: `Data operasional (${updatedInput.date} ${updatedInput.time}) berhasil diperbarui!`,
        details: 'Perubahan otomatis tersinkronisasi di Performa Kompresor, PB Synthesis, dan semua perangkat.',
      });
      return { success: true, message: 'Data berhasil diperbarui.' };
    } catch (err) {
      handleCloudMutationError(err, 'Gagal memperbarui data di cloud database.');
      return { success: false, message: 'Gagal memperbarui data di cloud database.' };
    }
  };

  // Set an existing operational record as the active baseline
  const handleSetBaselineRecord = (record: OperationalRecord) => {
    const uid = ensureOperatorUid();
    if (!uid) return;

    const p1 = record.P1_7;
    const p3 = record.P3_0;
    const pr = p1 > 0 ? Number((p3 / p1).toFixed(4)) : null;

    const isAvg =
      record.isDailyAverage ||
      record.isDailyMedian ||
      record.time?.toLowerCase().includes('average') ||
      record.time?.toLowerCase().includes('median');
    const desc = isAvg
      ? `Daily average baseline from ${record.date}${
          record.hourlyObservationsCount && record.hourlyObservationsCount > 1
            ? ` (${record.hourlyObservationsCount} readings)`
            : ''
        }`
      : `Operational baseline established from record on ${record.date} ${record.time}`;

    const newBaseline: BaselineConfig = {
      isConfigured: true,
      sourceRecordId: sanitizeDocId(record.id),
      date: record.date,
      time: isAvg ? 'Daily Average' : record.time,
      T1_7: record.T1_7,
      P1_7: p1,
      P3_0: p3,
      PR: pr,
      realPower: record.realPower,
      referenceDescription: desc,
      setAt: new Date().toISOString(),
    };

    void savePlantBaselineInCloud(newBaseline, uid).catch((err) =>
      handleCloudMutationError(err, 'Gagal menyimpan Baseline ke cloud.')
    );
  };

  const handleSaveBaselineFromModal = (newBaseline: BaselineConfig) => {
    const uid = ensureOperatorUid();
    if (!uid) return;
    void savePlantBaselineInCloud(newBaseline, uid).catch((err) =>
      handleCloudMutationError(err, 'Gagal menyimpan kalibrasi Baseline ke cloud.')
    );
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
        showInstructions={showInstructions}
        onToggleInstructions={() => setShowInstructions((v) => !v)}
      />

      {/* Notification Toast for Smart Import & Deduplication */}
      {importNotification && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md w-full p-4 bg-white rounded-xl shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                importNotification.type === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : importNotification.type === 'error'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              {importNotification.type === 'success' ? (
                <Sparkles className="w-5 h-5" />
              ) : importNotification.type === 'error' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 text-xs">
              <strong className="font-bold text-slate-900 block text-xs sm:text-sm">
                {importNotification.text}
              </strong>
              {importNotification.details && (
                <p className="text-slate-600 mt-1 leading-relaxed">
                  {importNotification.details}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setImportNotification(null)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[2400px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-5 space-y-4">
        {/* One-time helper banner if Anonymous Sign-In hasn't been flipped ON in Firebase Console yet */}
        {anonymousSetupNeeded && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-amber-950">
                  Aktifkan Mode Tanpa Login (Anonymous) di Firebase Console agar Semua Perangkat Otomatis Sinkron
                </p>
                <p className="text-amber-900 leading-relaxed">
                  Buka{' '}
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline inline-flex items-center gap-1 hover:text-amber-700"
                  >
                    Firebase Authentication &rarr; Sign-in method
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  , klik <strong>Add new provider &rarr; Anonymous &rarr; Enable &rarr; Save</strong>, lalu klik <strong>Coba Sambungkan Ulang</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => void attemptAnonymousAuth()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white rounded-lg cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Sambungkan Ulang</span>
              </button>
              <button
                type="button"
                onClick={() => void handleFallbackGoogleSignIn()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg cursor-pointer transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk dengan Google (Sementara)</span>
              </button>
            </div>
          </div>
        )}

        {authErrorMessage && !anonymousSetupNeeded && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center justify-between gap-3">
            <span>{authErrorMessage}</span>
            <button
              type="button"
              onClick={() => void attemptAnonymousAuth()}
              className="px-3 py-1 font-semibold bg-rose-700 text-white rounded hover:bg-rose-800 cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* One-click migration banner if browser has legacy local data and cloud is currently empty */}
        {cloudRecordsLoaded && rawCloudRecords.length === 0 && legacyRecords.length > 0 && (
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <UploadCloud className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">
                  Ditemukan {legacyRecords.length} data tersimpan di browser ini
                </p>
                <p className="text-slate-600 mt-0.5">
                  Unggah data lama Anda ke Cloud Database agar otomatis tampil di semua perangkat lain.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isMigratingLocal}
                onClick={() => void handleMigrateLegacyLocalData()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white rounded-lg cursor-pointer transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isMigratingLocal ? 'Mengunggah...' : 'Upload ke Cloud'}</span>
              </button>
              <button
                type="button"
                onClick={handleDismissLegacyMigration}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Abaikan
              </button>
            </div>
          </div>
        )}

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
            onEditRecord={handleEditRecord}
            onDeleteRecord={handleDeleteRecord}
            onClearAllData={handleClearData}
            onDeduplicateRecords={handleDeduplicateRecords}
            onSetBaselineRecord={handleSetBaselineRecord}
            onOpenBaselineConfig={() => setIsBaselineModalOpen(true)}
            onOpenImport={() => setIsImportModalOpen(true)}
            showInstructions={showInstructions}
            onSetShowInstructions={setShowInstructions}
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
        onUpdateBaseline={handleSaveBaselineFromModal}
        onSaveBaseline={handleSaveBaselineFromModal}
      />

      {/* Dataset Import Modal */}
      <DatasetImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportData={handleImportData}
        existingRecords={evaluatedRecords}
      />

      {/* In-App Clear Data Confirmation Modal */}
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
                  <p className="text-xs text-slate-500 mt-0.5">Permanent reset across all synced devices</p>
                </div>
              </div>
              <div className="space-y-3 mb-5 text-xs text-slate-600">
                <p className="leading-relaxed bg-rose-50/80 p-3 rounded-lg border border-rose-200 text-rose-900">
                  Apakah Anda yakin ingin menghapus <strong>seluruh data operasional ({evaluatedRecords.length} data entri)</strong>? Seluruh data riwayat input harian dan pembacaan PB Synthesis akan dihapus dari Cloud Database untuk semua perangkat. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
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
                  onClick={() => void handleConfirmClearData()}
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
      <footer className="border-t border-slate-200 bg-white py-3.5 px-4 sm:px-6 lg:px-10 text-center text-xs text-slate-500">
        <div className="max-w-[2400px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Water Washing Monitoring • Decision Logic: {WATER_WASH_DECISION_RULES.minIndicatorsMet}-out-of-3 Parameter Rule
          </span>
          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span>
              Thresholds: PR ≥ {thresholds.prWWThreshold}% | P3.0 ≥ {thresholds.p3WWThreshold}% | Real Power ≥ {thresholds.powerWWThreshold}%
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
