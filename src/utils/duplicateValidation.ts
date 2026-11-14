import {
  OperationalInput,
  OperationalRecord,
  BaselineConfig,
  ThresholdConfig,
} from '../types';
import { standardizeDate } from './dataNormalizer';
import { evaluateOperationalRecord } from './calculations';

export interface ExactDuplicateMatch {
  existingRecord: OperationalRecord;
  reason: string;
}

export interface ImportClassification {
  newRows: { row: OperationalInput; index: number }[];
  updatedRows: { row: OperationalInput; existingRecord: OperationalRecord; index: number }[];
  identicalRows: { row: OperationalInput; existingRecord: OperationalRecord; index: number }[];
}

/**
 * Normalizes time string to HH:MM or HH:MM:SS for reliable comparison
 */
export function normalizeTimeString(t?: string | null): string {
  if (!t) return '19:00';
  const clean = t.trim();
  const parts = clean.split(':');
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    if (parts.length >= 3 && parts[2]) {
      const ss = parts[2].padStart(2, '0');
      // If seconds are ':00', normalize to HH:MM for easy matching with non-seconds data
      if (ss === '00') {
        return `${hh}:${mm}`;
      }
      return `${hh}:${mm}:${ss}`;
    }
    return `${hh}:${mm}`;
  }
  return clean.slice(0, 5);
}

/**
 * Checks whether two operational readings share the exact same timestamp (Date and Time).
 * Handles flexible formats (e.g. 19:00 vs 19:00:00).
 */
export function isSameOperationalTimestamp(
  date1?: string | null,
  time1?: string | null,
  date2?: string | null,
  time2?: string | null
): boolean {
  if (!date1 || !date2) return false;
  const d1 = standardizeDate(date1).trim();
  const d2 = standardizeDate(date2).trim();
  if (d1 !== d2) return false;

  const t1 = (time1 || '19:00').trim();
  const t2 = (time2 || '19:00').trim();
  if (t1 === t2) return true;

  const norm1 = normalizeTimeString(t1);
  const norm2 = normalizeTimeString(t2);
  if (norm1 === norm2) return true;

  // Also check if one has seconds and the other doesn't, but HH:MM match
  const hhmm1 = norm1.slice(0, 5);
  const hhmm2 = norm2.slice(0, 5);
  return hhmm1 === hhmm2;
}

/**
 * Checks if two operational records/inputs have identical physical values:
 * Real Power, P1.7, P3.0, T1.7, and NH Speed.
 */
export function areOperationalParametersIdentical(
  a: { realPower?: number; P1_7?: number; P3_0?: number; T1_7?: number | null; nhSpeed?: number | null },
  b: { realPower?: number; P1_7?: number; P3_0?: number; T1_7?: number | null; nhSpeed?: number | null }
): boolean {
  const powerDiff = Math.abs((a.realPower ?? 0) - (b.realPower ?? 0));
  const p1Diff = Math.abs((a.P1_7 ?? 0) - (b.P1_7 ?? 0));
  const p3Diff = Math.abs((a.P3_0 ?? 0) - (b.P3_0 ?? 0));

  const t1A = a.T1_7 !== undefined && a.T1_7 !== null ? a.T1_7 : null;
  const t1B = b.T1_7 !== undefined && b.T1_7 !== null ? b.T1_7 : null;
  const t1Diff = t1A !== null && t1B !== null ? Math.abs(t1A - t1B) : 0;

  const nhA = a.nhSpeed !== undefined && a.nhSpeed !== null ? a.nhSpeed : null;
  const nhB = b.nhSpeed !== undefined && b.nhSpeed !== null ? b.nhSpeed : null;
  const nhDiff = nhA !== null && nhB !== null ? Math.abs(nhA - nhB) : 0;

  return (
    powerDiff < 0.01 &&
    p1Diff < 0.01 &&
    p3Diff < 0.01 &&
    t1Diff < 0.1 &&
    nhDiff < 5
  );
}

/**
 * Checks if candidate operational data matches an existing record "exact in everything":
 * 1. Date matches
 * 2. Time matches (exact or normalized HH:MM)
 * 3. Real Power (Beban) matches
 * 4. P1.7 (PT006) matches
 * 5. P3.0 (PT007) matches
 */
export function findExactDuplicate(
  candidate: {
    date: string;
    time: string;
    realPower: number;
    P1_7: number;
    P3_0: number;
    T1_7?: number | null;
    nhSpeed?: number | null;
  },
  existingRecords: OperationalRecord[]
): ExactDuplicateMatch | null {
  if (!candidate.date || !existingRecords || existingRecords.length === 0) {
    return null;
  }

  const targetDate = candidate.date.trim();
  const targetTimeNorm = normalizeTimeString(candidate.time);

  for (const existing of existingRecords) {
    // 1. Date comparison
    if (existing.date !== targetDate) continue;

    // 2. Time comparison (normalized or exact)
    const existingTimeNorm = normalizeTimeString(existing.time);
    const timeMatches =
      targetTimeNorm === existingTimeNorm ||
      (existing.time && candidate.time && existing.time.trim() === candidate.time.trim());

    if (!timeMatches) continue;

    // 3. Compare numeric operational values (exact in everything)
    const powerDiff = Math.abs(existing.realPower - candidate.realPower);
    const p1Diff = Math.abs(existing.P1_7 - candidate.P1_7);
    const p3Diff = Math.abs(existing.P3_0 - candidate.P3_0);

    const isExactValues =
      powerDiff < 0.01 &&
      p1Diff < 0.01 &&
      p3Diff < 0.01;

    if (isExactValues) {
      // If T1.7 or nhSpeed are provided and differ, not exact duplicate
      if (
        candidate.T1_7 !== undefined &&
        candidate.T1_7 !== null &&
        existing.T1_7 !== undefined &&
        existing.T1_7 !== null &&
        Math.abs(existing.T1_7 - candidate.T1_7) > 0.5
      ) {
        continue;
      }

      if (
        candidate.nhSpeed !== undefined &&
        candidate.nhSpeed !== null &&
        existing.nhSpeed !== undefined &&
        existing.nhSpeed !== null &&
        Math.abs(existing.nhSpeed - candidate.nhSpeed) > 5
      ) {
        continue;
      }

      return {
        existingRecord: existing,
        reason: `Ditemukan data tercatat pada ${existing.date} ${existing.time || ''} dengan Beban ${existing.realPower.toFixed(2)} MW, P1.7 ${existing.P1_7.toFixed(2)} PSIA, P3.0 ${existing.P3_0.toFixed(2)} PSIA yang sama persis.`,
      };
    }
  }

  return null;
}

function makeTimestampKey(date?: string | null, time?: string | null): string {
  if (!date) return '';
  const d = standardizeDate(date).trim();
  const norm = normalizeTimeString(time || '19:00');
  return `${d}__${norm.slice(0, 5)}`;
}

/**
 * Classifies an incoming list of rows into:
 * - New rows (not found in existing records)
 * - Updated rows (found matching timestamp, but operational values differ)
 * - Identical rows (found matching timestamp and identical values)
 * Uses O(N + M) Map indexing for instant performance on large Excel sheets.
 */
export function classifyImportRows(
  candidateRows: OperationalInput[],
  existingRecords: OperationalRecord[]
): ImportClassification {
  const newRows: { row: OperationalInput; index: number }[] = [];
  const updatedRows: { row: OperationalInput; existingRecord: OperationalRecord; index: number }[] = [];
  const identicalRows: { row: OperationalInput; existingRecord: OperationalRecord; index: number }[] = [];

  const existingByKey = new Map<string, OperationalRecord>();
  for (const existing of existingRecords) {
    const key = makeTimestampKey(existing.date, existing.time);
    if (key && !existingByKey.has(key)) {
      existingByKey.set(key, existing);
    }
  }

  candidateRows.forEach((row, index) => {
    const key = makeTimestampKey(row.date, row.time);
    const match = key ? existingByKey.get(key) : undefined;

    if (!match) {
      newRows.push({ row, index });
    } else {
      if (areOperationalParametersIdentical(row, match)) {
        identicalRows.push({ row, existingRecord: match, index });
      } else {
        updatedRows.push({ row, existingRecord: match, index });
      }
    }
  });

  return { newRows, updatedRows, identicalRows };
}

/**
 * Merges incoming rows into existing records using Smart Upsert (O(N + M)):
 * 1. Deduplicates multiple copies inside the incoming batch itself.
 * 2. If a record matches an existing Date & Time:
 *    - If parameters are identical: Kept as-is, never duplicated! (identicalCount++)
 *    - If parameters changed in the Excel: Updated in-place with new values and re-evaluated! (updatedCount++)
 * 3. If a record has a new Date & Time: Appended as a new record! (addedCount++)
 * 4. Chronologically sorted.
 */
export function smartMergeOperationalRecords(
  incomingInputs: OperationalInput[],
  existingRecords: OperationalRecord[],
  baseline: BaselineConfig,
  thresholds: ThresholdConfig
): {
  mergedRecords: OperationalRecord[];
  addedCount: number;
  updatedCount: number;
  identicalCount: number;
} {
  // Step 1: Deduplicate within the incoming batch itself in O(N) (keeping latest occurrence in the file)
  const dedupedByKey = new Map<string, OperationalInput>();
  for (let i = 0; i < incomingInputs.length; i++) {
    const input = incomingInputs[i];
    const key = makeTimestampKey(input.date, input.time) || `__row_${i}`;
    dedupedByKey.set(key, input);
  }
  const dedupedIncoming = Array.from(dedupedByKey.values());

  // Step 2: Merge with existing records in O(N + M)
  const result: OperationalRecord[] = [...existingRecords];
  const existingIdxByKey = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    const key = makeTimestampKey(result[i].date, result[i].time);
    if (key && !existingIdxByKey.has(key)) {
      existingIdxByKey.set(key, i);
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  let identicalCount = 0;
  const timestampNow = Date.now();

  for (let idx = 0; idx < dedupedIncoming.length; idx++) {
    const input = dedupedIncoming[idx];
    const key = makeTimestampKey(input.date, input.time);
    const existingIdx = key ? existingIdxByKey.get(key) : undefined;

    if (existingIdx !== undefined) {
      const existing = result[existingIdx];
      if (areOperationalParametersIdentical(input, existing)) {
        // Exactly identical: keep existing, do NOT double
        identicalCount++;
      } else {
        // Values were updated in Excel: re-evaluate with new input, preserving existing ID and WW tag
        const updatedRecord = evaluateOperationalRecord(
          {
            ...input,
            isWaterWashEvent: existing.isWaterWashEvent,
            notes: existing.notes || input.notes,
          },
          existing.id,
          baseline,
          thresholds
        );
        result[existingIdx] = updatedRecord;
        updatedCount++;
      }
    } else {
      // New record: evaluate and append
      const newRecord = evaluateOperationalRecord(
        input,
        `imp-${timestampNow}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        baseline,
        thresholds
      );
      const newIndex = result.length;
      result.push(newRecord);
      if (key) {
        existingIdxByKey.set(key, newIndex);
      }
      addedCount++;
    }
  }

  // Step 3: Sort chronologically
  result.sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    return (a.time || '').localeCompare(b.time || '');
  });

  return {
    mergedRecords: result,
    addedCount,
    updatedCount,
    identicalCount,
  };
}

/**
 * Removes any redundant duplicated records already residing in the database/history.
 * Groups by date & time, keeping only 1 record per unique timestamp.
 */
export function deduplicateExistingRecords(records: OperationalRecord[]): {
  cleanedRecords: OperationalRecord[];
  removedCount: number;
} {
  const seen = new Map<string, OperationalRecord>();
  let removedCount = 0;

  for (const r of records) {
    const key = `${standardizeDate(r.date)}__${normalizeTimeString(r.time)}`;
    if (seen.has(key)) {
      removedCount++;
      // If the duplicate has WW marked, prioritize keeping the WW marked one
      const existing = seen.get(key)!;
      if (!existing.isWaterWashEvent && r.isWaterWashEvent) {
        seen.set(key, r);
      }
    } else {
      seen.set(key, r);
    }
  }

  const cleanedRecords = Array.from(seen.values()).sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    return (a.time || '').localeCompare(b.time || '');
  });

  return {
    cleanedRecords,
    removedCount,
  };
}
