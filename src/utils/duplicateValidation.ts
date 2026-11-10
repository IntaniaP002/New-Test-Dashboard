import { OperationalRecord } from '../types';

export interface ExactDuplicateMatch {
  existingRecord: OperationalRecord;
  reason: string;
}

/**
 * Normalizes time string to HH:MM for reliable comparison (e.g. "19:00:00" -> "19:00", "19:00" -> "19:00")
 */
export function normalizeTimeString(t?: string | null): string {
  if (!t) return '';
  const clean = t.trim();
  const parts = clean.split(':');
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return clean.slice(0, 5);
}

/**
 * Checks if candidate operational data matches an existing record "exact in everything":
 * 1. Date matches
 * 2. Time matches (exact or normalized HH:MM)
 * 3. Real Power (Beban) matches
 * 4. P1.7 (PT006) matches
 * 5. P3.0 (PT007) matches
 * 6. NPHR matches
 */
export function findExactDuplicate(
  candidate: {
    date: string;
    time: string;
    realPower: number;
    P1_7: number;
    P3_0: number;
    nphr: number;
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
    const nphrDiff = Math.abs(existing.nphr - candidate.nphr);

    const isExactValues =
      powerDiff < 0.01 &&
      p1Diff < 0.01 &&
      p3Diff < 0.01 &&
      nphrDiff < 0.1;

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
        reason: `Ditemukan data tercatat pada ${existing.date} ${existing.time || ''} dengan Beban ${existing.realPower.toFixed(2)} MW, P1.7 ${existing.P1_7.toFixed(2)} PSIA, P3.0 ${existing.P3_0.toFixed(2)} PSIA, NPHR ${existing.nphr.toFixed(1)} kcal/kWh yang sama persis.`,
      };
    }
  }

  return null;
}
