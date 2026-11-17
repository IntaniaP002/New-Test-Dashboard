import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, WORKSPACE_ID } from '../firebase';
import { DEFAULT_BASELINE, DEFAULT_THRESHOLDS } from '../data/initialData';
import {
  BaselineConfig,
  OperationalInput,
  OperationalRecord,
  ThresholdConfig,
} from '../types';
import { standardizeDate } from '../utils/dataNormalizer';
import { parseRecordTimestamp } from '../utils/calculations';

const COLLECTION_RECORDS = 'operational_records';
const COLLECTION_BASELINES = 'plant_baselines';
const COLLECTION_THRESHOLDS = 'plant_thresholds';
const ACTIVE_DOC_ID = 'active';
const BATCH_CHUNK_SIZE = 400;

export function sanitizeDocId(rawId: string): string {
  const cleaned = String(rawId || `rec-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : `rec-${Date.now()}`;
}

function safeFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.min(1000000, Math.max(-100000, val));
  }
  return fallback;
}

function safeOptionalNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.min(10000000, Math.max(-1000000, val));
  }
  return null;
}

function safeOptionalString(val: unknown, maxLen: number): string | null {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLen);
  }
  return null;
}

function safeIsoDate(val: unknown): string {
  const std = standardizeDate(typeof val === 'string' ? val : '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(std)) {
    return std;
  }
  return new Date().toISOString().slice(0, 10);
}

function safeTime(val: unknown): string {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim().slice(0, 32);
  }
  return '19:00:00';
}

export interface StoredOperationalInput extends OperationalInput {
  id: string;
  timestamp: number;
  createdByUid?: string;
}

function buildOperationalUpdatablePayload(input: OperationalInput, uid: string) {
  const date = safeIsoDate(input.date);
  const time = safeTime(input.time);
  const timestamp = Math.max(0, parseRecordTimestamp(date, time) || Date.now());

  return {
    date,
    time,
    timestamp,
    T1_7: safeOptionalNumber(input.T1_7),
    P1_7: safeFiniteNumber(input.P1_7, 0),
    P3_0: safeFiniteNumber(input.P3_0, 0),
    realPower: safeFiniteNumber(input.realPower, 0),
    pbSynthesis: safeOptionalNumber(input.pbSynthesis),
    pbSynthesisDB: safeOptionalNumber(input.pbSynthesisDB),
    fNH: safeOptionalNumber(input.fNH),
    nhSpeed: safeOptionalNumber(input.nhSpeed),
    x1: safeOptionalNumber(input.x1),
    y1: safeOptionalNumber(input.y1),
    x2: safeOptionalNumber(input.x2),
    y2: safeOptionalNumber(input.y2),
    upperMultiplier: safeOptionalNumber(input.upperMultiplier),
    lowerMultiplier: safeOptionalNumber(input.lowerMultiplier),
    pt006: safeOptionalNumber(input.pt006),
    isDrivebackWWRecommended: Boolean(input.isDrivebackWWRecommended ?? false),
    isPbBaseline: Boolean(input.isPbBaseline ?? false),
    isWaterWashEvent: Boolean(input.isWaterWashEvent ?? false),
    waterWashEventNumber: safeOptionalNumber(input.waterWashEventNumber),
    notes: safeOptionalString(input.notes, 500),
    updatedByUid: sanitizeDocId(uid),
    updatedAt: serverTimestamp(),
  };
}

function buildOperationalCreatePayload(id: string, input: OperationalInput, uid: string) {
  const safeId = sanitizeDocId(id);
  const safeUid = sanitizeDocId(uid);
  return {
    id: safeId,
    workspaceId: WORKSPACE_ID,
    ...buildOperationalUpdatablePayload(input, safeUid),
    createdByUid: safeUid,
    createdAt: serverTimestamp(),
  };
}

function buildBaselineUpdatablePayload(baseline: BaselineConfig, uid: string) {
  return {
    isConfigured: Boolean(baseline.isConfigured),
    T1_7: safeOptionalNumber(baseline.T1_7),
    P1_7: safeOptionalNumber(baseline.P1_7),
    P3_0: safeOptionalNumber(baseline.P3_0),
    PR: safeOptionalNumber(baseline.PR),
    realPower: safeOptionalNumber(baseline.realPower),
    referenceDescription: safeOptionalString(baseline.referenceDescription, 500),
    setAt: safeOptionalString(baseline.setAt, 64),
    sourceRecordId: safeOptionalString(baseline.sourceRecordId, 128),
    date: safeOptionalString(baseline.date ? safeIsoDate(baseline.date) : null, 20),
    time: safeOptionalString(baseline.time, 32),
    updatedByUid: sanitizeDocId(uid),
    updatedAt: serverTimestamp(),
  };
}

function buildThresholdsUpdatablePayload(thresholds: ThresholdConfig, uid: string) {
  const clampPct = (v: number, fallback: number) => {
    const n = safeFiniteNumber(v, fallback);
    return Math.min(100, Math.max(0, n));
  };
  return {
    prWWThreshold: clampPct(thresholds.prWWThreshold, DEFAULT_THRESHOLDS.prWWThreshold),
    p3WWThreshold: clampPct(thresholds.p3WWThreshold, DEFAULT_THRESHOLDS.p3WWThreshold),
    powerWWThreshold: clampPct(thresholds.powerWWThreshold, DEFAULT_THRESHOLDS.powerWWThreshold),
    updatedByUid: sanitizeDocId(uid),
    updatedAt: serverTimestamp(),
  };
}

export function subscribeOperationalRecords(
  onData: (records: StoredOperationalInput[]) => void,
  onFatalError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION_RECORDS),
    where('workspaceId', '==', WORKSPACE_ID)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: StoredOperationalInput[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const date = safeIsoDate(d.date);
        const time = safeTime(d.time);
        list.push({
          id: typeof d.id === 'string' ? d.id : docSnap.id,
          date,
          time,
          timestamp: typeof d.timestamp === 'number' ? d.timestamp : parseRecordTimestamp(date, time),
          T1_7: d.T1_7 ?? undefined,
          P1_7: Number(d.P1_7 ?? 0),
          P3_0: Number(d.P3_0 ?? 0),
          realPower: Number(d.realPower ?? 0),
          pbSynthesis: d.pbSynthesis ?? undefined,
          pbSynthesisDB: d.pbSynthesisDB ?? undefined,
          fNH: d.fNH ?? undefined,
          nhSpeed: d.nhSpeed ?? undefined,
          x1: d.x1 ?? undefined,
          y1: d.y1 ?? undefined,
          x2: d.x2 ?? undefined,
          y2: d.y2 ?? undefined,
          upperMultiplier: d.upperMultiplier ?? undefined,
          lowerMultiplier: d.lowerMultiplier ?? undefined,
          pt006: d.pt006 ?? undefined,
          isDrivebackWWRecommended: Boolean(d.isDrivebackWWRecommended),
          isPbBaseline: Boolean(d.isPbBaseline),
          isWaterWashEvent: Boolean(d.isWaterWashEvent),
          waterWashEventNumber: d.waterWashEventNumber ?? undefined,
          notes: typeof d.notes === 'string' ? d.notes : undefined,
          createdByUid: typeof d.createdByUid === 'string' ? d.createdByUid : undefined,
        });
      });

      list.sort((a, b) => {
        const cmp = (a.date || '').localeCompare(b.date || '');
        if (cmp !== 0) return cmp;
        return (a.time || '').localeCompare(b.time || '');
      });

      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_RECORDS);
      } catch (wrapped) {
        onFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribePlantBaseline(
  onData: (baseline: BaselineConfig) => void,
  onFatalError: (err: Error) => void
): Unsubscribe {
  const path = `${COLLECTION_BASELINES}/${ACTIVE_DOC_ID}`;
  const docRef = doc(db, COLLECTION_BASELINES, ACTIVE_DOC_ID);

  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_BASELINE);
        return;
      }
      const d = snap.data();
      onData({
        isConfigured: Boolean(d.isConfigured),
        T1_7: d.T1_7 ?? null,
        P1_7: d.P1_7 ?? null,
        P3_0: d.P3_0 ?? null,
        PR: d.PR ?? null,
        realPower: d.realPower ?? null,
        referenceDescription: typeof d.referenceDescription === 'string' ? d.referenceDescription : undefined,
        setAt: typeof d.setAt === 'string' ? d.setAt : undefined,
        sourceRecordId: typeof d.sourceRecordId === 'string' ? d.sourceRecordId : undefined,
        date: typeof d.date === 'string' ? safeIsoDate(d.date) : undefined,
        time: typeof d.time === 'string' ? d.time : undefined,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribePlantThresholds(
  onData: (thresholds: ThresholdConfig) => void,
  onFatalError: (err: Error) => void
): Unsubscribe {
  const path = `${COLLECTION_THRESHOLDS}/${ACTIVE_DOC_ID}`;
  const docRef = doc(db, COLLECTION_THRESHOLDS, ACTIVE_DOC_ID);

  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_THRESHOLDS);
        return;
      }
      const d = snap.data();
      onData({
        prWWThreshold: typeof d.prWWThreshold === 'number' ? d.prWWThreshold : DEFAULT_THRESHOLDS.prWWThreshold,
        p3WWThreshold: typeof d.p3WWThreshold === 'number' ? d.p3WWThreshold : DEFAULT_THRESHOLDS.p3WWThreshold,
        powerWWThreshold: typeof d.powerWWThreshold === 'number' ? d.powerWWThreshold : DEFAULT_THRESHOLDS.powerWWThreshold,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createOperationalRecordInCloud(
  recordId: string,
  input: OperationalInput,
  uid: string
): Promise<void> {
  const safeId = sanitizeDocId(recordId);
  const path = `${COLLECTION_RECORDS}/${safeId}`;
  try {
    await setDoc(doc(db, COLLECTION_RECORDS, safeId), buildOperationalCreatePayload(safeId, input, uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function savePlantBaselineInCloud(
  baseline: BaselineConfig,
  uid: string
): Promise<void> {
  const path = `${COLLECTION_BASELINES}/${ACTIVE_DOC_ID}`;
  const docRef = doc(db, COLLECTION_BASELINES, ACTIVE_DOC_ID);
  try {
    const snap = await getDoc(docRef);
    const updatable = buildBaselineUpdatablePayload(baseline, uid);
    if (!snap.exists()) {
      await setDoc(docRef, {
        workspaceId: WORKSPACE_ID,
        ...updatable,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, updatable);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePlantThresholdsInCloud(
  thresholds: ThresholdConfig,
  uid: string
): Promise<void> {
  const path = `${COLLECTION_THRESHOLDS}/${ACTIVE_DOC_ID}`;
  const docRef = doc(db, COLLECTION_THRESHOLDS, ACTIVE_DOC_ID);
  try {
    const snap = await getDoc(docRef);
    const updatable = buildThresholdsUpdatablePayload(thresholds, uid);
    if (!snap.exists()) {
      await setDoc(docRef, {
        workspaceId: WORKSPACE_ID,
        ...updatable,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, updatable);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateWaterWashTagsInCloud(
  updates: { id: string; isWaterWashEvent: boolean; notes: string | null }[],
  uid: string
): Promise<void> {
  if (updates.length === 0) return;
  const safeUid = sanitizeDocId(uid);

  for (let i = 0; i < updates.length; i += BATCH_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      const safeId = sanitizeDocId(item.id);
      batch.update(doc(db, COLLECTION_RECORDS, safeId), {
        isWaterWashEvent: item.isWaterWashEvent,
        notes: safeOptionalString(item.notes, 500),
        updatedByUid: safeUid,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_RECORDS);
    }
  }
}

export async function updateRecordPBSynthesisBatchInCloud(
  updates: {
    id: string;
    P1_7?: number;
    P3_0?: number;
    pbSynthesis?: number | null;
    pbSynthesisDB?: number | null;
    fNH?: number | null;
    pt006?: number | null;
    nhSpeed?: number | null;
    x1?: number | null;
    y1?: number | null;
    x2?: number | null;
    y2?: number | null;
    upperMultiplier?: number | null;
    lowerMultiplier?: number | null;
    isPbBaseline?: boolean;
  }[],
  uid: string
): Promise<void> {
  if (updates.length === 0) return;
  const safeUid = sanitizeDocId(uid);

  for (let i = 0; i < updates.length; i += BATCH_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const u of chunk) {
      const safeId = sanitizeDocId(u.id);
      const patch: Record<string, unknown> = {
        updatedByUid: safeUid,
        updatedAt: serverTimestamp(),
      };
      if (u.P1_7 !== undefined) patch.P1_7 = safeFiniteNumber(u.P1_7, 0);
      if (u.P3_0 !== undefined) patch.P3_0 = safeFiniteNumber(u.P3_0, 0);
      if (u.pbSynthesis !== undefined) patch.pbSynthesis = safeOptionalNumber(u.pbSynthesis);
      if (u.pbSynthesisDB !== undefined) patch.pbSynthesisDB = safeOptionalNumber(u.pbSynthesisDB);
      if (u.fNH !== undefined) patch.fNH = safeOptionalNumber(u.fNH);
      if (u.pt006 !== undefined) patch.pt006 = safeOptionalNumber(u.pt006);
      if (u.nhSpeed !== undefined) patch.nhSpeed = safeOptionalNumber(u.nhSpeed);
      if (u.x1 !== undefined) patch.x1 = safeOptionalNumber(u.x1);
      if (u.y1 !== undefined) patch.y1 = safeOptionalNumber(u.y1);
      if (u.x2 !== undefined) patch.x2 = safeOptionalNumber(u.x2);
      if (u.y2 !== undefined) patch.y2 = safeOptionalNumber(u.y2);
      if (u.upperMultiplier !== undefined) patch.upperMultiplier = safeOptionalNumber(u.upperMultiplier);
      if (u.lowerMultiplier !== undefined) patch.lowerMultiplier = safeOptionalNumber(u.lowerMultiplier);
      if (u.isPbBaseline !== undefined) patch.isPbBaseline = Boolean(u.isPbBaseline);

      batch.update(doc(db, COLLECTION_RECORDS, safeId), patch);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_RECORDS);
    }
  }
}

export async function setPbBaselineFlagsInCloud(
  allRecords: OperationalRecord[],
  targetRecordId: string,
  uid: string
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const changed = allRecords.filter((r) => Boolean(r.isPbBaseline) !== (r.id === targetRecordId));
  if (changed.length === 0) return;

  for (let i = 0; i < changed.length; i += BATCH_CHUNK_SIZE) {
    const chunk = changed.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const r of chunk) {
      const safeId = sanitizeDocId(r.id);
      batch.update(doc(db, COLLECTION_RECORDS, safeId), {
        isPbBaseline: r.id === targetRecordId,
        updatedByUid: safeUid,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_RECORDS);
    }
  }
}

export async function upsertOperationalRecordsBatchInCloud(
  creates: { id: string; input: OperationalInput }[],
  updates: { id: string; input: OperationalInput }[],
  uid: string
): Promise<void> {
  const ops: Array<
    | { kind: 'create'; id: string; input: OperationalInput }
    | { kind: 'update'; id: string; input: OperationalInput }
  > = [
    ...creates.map((c) => ({ kind: 'create' as const, id: c.id, input: c.input })),
    ...updates.map((u) => ({ kind: 'update' as const, id: u.id, input: u.input })),
  ];

  if (ops.length === 0) return;

  for (let i = 0; i < ops.length; i += BATCH_CHUNK_SIZE) {
    const chunk = ops.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const safeId = sanitizeDocId(op.id);
      const ref = doc(db, COLLECTION_RECORDS, safeId);
      if (op.kind === 'create') {
        batch.set(ref, buildOperationalCreatePayload(safeId, op.input, uid));
      } else {
        batch.update(ref, buildOperationalUpdatablePayload(op.input, uid));
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_RECORDS);
    }
  }
}

export async function deleteOperationalRecordsInCloud(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;

  if (recordIds.length === 1) {
    const safeId = sanitizeDocId(recordIds[0]);
    const path = `${COLLECTION_RECORDS}/${safeId}`;
    try {
      await deleteDoc(doc(db, COLLECTION_RECORDS, safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
    return;
  }

  for (let i = 0; i < recordIds.length; i += BATCH_CHUNK_SIZE) {
    const chunk = recordIds.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(db, COLLECTION_RECORDS, sanitizeDocId(id)));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_RECORDS);
    }
  }
}
