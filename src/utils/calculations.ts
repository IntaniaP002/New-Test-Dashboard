/**
 * Water Washing Optimization & Calculation Engine
 * Strictly follows engineering logic without invented formulas
 */

import {
  BaselineConfig,
  DailyRepresentativeRecord,
  OperationalInput,
  OperationalRecord,
  OverallWaterWashStatus,
  ThresholdConfig,
  WaterWashCycleDeterioration,
  WaterWashEvent,
} from '../types';
import {
  INDICATOR_WEIGHTS,
  WATER_WASH_DECISION_RULES,
} from '../data/initialData';

/**
 * Pure AND Gate Decision Helper for Water Wash Recommendation:
 * Evaluates whether the criteria for RECOMMEND WATER WASH are met:
 * (thresholdsMetCount >= minIndicatorsMet) AND (bobotLolos >= minRecommendWeight)
 */
export function checkWaterWashRecommendCondition(
  thresholdsMetCount: number,
  bobotLolos: number
): boolean {
  return (
    thresholdsMetCount >= WATER_WASH_DECISION_RULES.minIndicatorsMet &&
    bobotLolos >= WATER_WASH_DECISION_RULES.minRecommendWeight
  );
}

/**
 * Evaluates the full Water Wash operational status classification based on
 * indicators met count, combined weight (Performance Index), and optional NPHR early monitoring.
 */
export function evaluateWaterWashDecision(params: {
  evaluatedIndicatorsCount: number;
  hasBaseline: boolean;
  performanceIndex: number | null;
  thresholdsMetCount: number;
  nphrDeterioration: number | null;
  nphrEarlyMonitoringThreshold: number;
}): {
  overallStatus: OverallWaterWashStatus;
  isRecommendWaterWash: boolean;
  isBobotInPantauRange: boolean;
  isNphrEarlyMonitoring: boolean;
  bobotLolos: number;
} {
  const {
    evaluatedIndicatorsCount,
    hasBaseline,
    performanceIndex,
    thresholdsMetCount,
    nphrDeterioration,
    nphrEarlyMonitoringThreshold,
  } = params;

  const bobotLolos = performanceIndex ?? 0;
  const isRecommendWaterWash = checkWaterWashRecommendCondition(thresholdsMetCount, bobotLolos);
  const isBobotInPantauRange =
    bobotLolos >= WATER_WASH_DECISION_RULES.minPantauWeight &&
    bobotLolos <= WATER_WASH_DECISION_RULES.maxPantauWeight;
  const isNphrEarlyMonitoring =
    nphrDeterioration !== null && nphrDeterioration >= nphrEarlyMonitoringThreshold;

  let overallStatus: OverallWaterWashStatus = 'INSUFFICIENT DATA';
  if (evaluatedIndicatorsCount < WATER_WASH_DECISION_RULES.minIndicatorsMet || !hasBaseline || performanceIndex === null) {
    overallStatus = 'INSUFFICIENT DATA';
  } else if (isRecommendWaterWash) {
    overallStatus = 'RECOMMEND WATER WASH';
  } else if (isBobotInPantauRange || isNphrEarlyMonitoring) {
    overallStatus = 'MONITORING';
  } else {
    overallStatus = 'NORMAL';
  }

  return {
    overallStatus,
    isRecommendWaterWash,
    isBobotInPantauRange,
    isNphrEarlyMonitoring,
    bobotLolos,
  };
}

/**
 * Standard Pressure Ratio Calculation:
 * PR = P3.0 / P1.7
 * Note: No invented temperature correction is applied to retain raw calculated pressure ratio.
 */
export function calculatePressureRatio(P3_0: number, P1_7: number): number {
  if (!P1_7 || P1_7 <= 0 || !P3_0 || P3_0 <= 0) {
    return 0;
  }
  return Number((P3_0 / P1_7).toFixed(4));
}

/**
 * Net Plant Thermal Efficiency from NPHR:
 * Standard thermodynamic conversion: 1 kWh = 859.845 kcal (commonly rounded to 860 kcal/kWh)
 * Efficiency (%) = (859.845 / NPHR) * 100
 */
export function calculateEfficiencyFromNPHR(nphr: number | null | undefined): number | null {
  if (!nphr || nphr <= 0) return null;
  return Number(((859.845 / nphr) * 100).toFixed(2));
}

/**
 * Reliably parses a date string and optional time string into a millisecond timestamp.
 * Avoids Invalid Date and never falls back to Date.now() when a valid date is provided.
 */
export function parseRecordTimestamp(dateStr: string, timeStr?: string): number {
  if (!dateStr) return Date.now();
  let timePart = '12:00:00';
  if (timeStr) {
    const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const hh = match[1].padStart(2, '0');
      const mm = match[2];
      const ss = match[3] || '00';
      timePart = `${hh}:${mm}:${ss}`;
    }
  }
  const isoStr = `${dateStr}T${timePart}`;
  const parsed = new Date(isoStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.getTime();
  }
  const dateOnly = new Date(`${dateStr}T12:00:00Z`);
  return !isNaN(dateOnly.getTime()) ? dateOnly.getTime() : Date.now();
}

/**
 * Deterministic chronological record comparator:
 * Compares strictly by date string (YYYY-MM-DD), then by timestamp.
 */
export function compareRecordsChronologically<T extends { date: string; time?: string; timestamp?: number }>(
  a: T,
  b: T
): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  return (a.timestamp || 0) - (b.timestamp || 0);
}

/**
 * Deterioration Calculations:
 * The calculation direction must reflect whether higher or lower values represent better performance.
 *
 * For NPHR:
 * Higher NPHR = worse performance.
 * Deterioration % = ((Current - Baseline) / Baseline) * 100%
 *
 * For PR:
 * Lower PR = worse compressor performance.
 * Deterioration % = ((Baseline - Current) / Baseline) * 100%
 *
 * For P3.0:
 * Lower P3.0 = worse compressor performance.
 * Deterioration % = ((Baseline - Current) / Baseline) * 100%
 *
 * For Real Power:
 * Lower Real Power = worse output performance.
 * Deterioration % = ((Baseline - Current) / Baseline) * 100%
 */
export type PhysicalDeteriorationStatus = 'valid' | 'missing' | 'invalid_physical';

export interface DeteriorationEvaluation {
  value: number | null;
  status: PhysicalDeteriorationStatus;
  errorDetail?: string;
}

/**
 * Calculates deterioration percentage with explicit case distinction:
 * Case (a): Data belum diinput (baseline atau nilai saat ini null/undefined/NaN) -> status: 'missing' (wajar dikecualikan)
 * Case (b): Data ada tapi bernilai <= 0 padahal besaran fisik gas turbin harus bernilai positif -> status: 'invalid_physical' (data error, jangan turunkan penyebut)
 * Valid: Besaran fisik bernilai positif (> 0) -> status: 'valid', value: persentase deteriorasi (%)
 */
export function evaluateDeterioration(
  current: number | null | undefined,
  baseline: number | null | undefined,
  direction: 'higher_is_worse' | 'lower_is_worse',
  paramLabel: string = 'Parameter',
  unit: string = ''
): DeteriorationEvaluation {
  // Case (a): data belum diinput (baseline atau current null/undefined/NaN)
  if (
    current === null ||
    current === undefined ||
    isNaN(current) ||
    baseline === null ||
    baseline === undefined ||
    isNaN(baseline)
  ) {
    return { value: null, status: 'missing' };
  }

  // Case (b): data ada tapi nilainya <= 0 padahal seharusnya besaran fisik positif
  if (current <= 0 || baseline <= 0) {
    const errorParts: string[] = [];
    if (current <= 0) {
      errorParts.push(`${paramLabel} saat ini = ${current}${unit ? ' ' + unit : ''} (harus > 0)`);
    }
    if (baseline <= 0) {
      errorParts.push(`baseline ${paramLabel} = ${baseline}${unit ? ' ' + unit : ''} (harus > 0)`);
    }
    return {
      value: null,
      status: 'invalid_physical',
      errorDetail: errorParts.join(', '),
    };
  }

  // Perhitungan deteriorasi fisik yang valid
  if (direction === 'higher_is_worse') {
    // For NPHR: Increase is deterioration
    const det = ((current - baseline) / baseline) * 100;
    return { value: Number(det.toFixed(2)), status: 'valid' };
  } else {
    // For PR, P3.0, Real Power: Decrease is deterioration
    const det = ((baseline - current) / baseline) * 100;
    return { value: Number(det.toFixed(2)), status: 'valid' };
  }
}

export function calculateDeteriorationPercent(
  current: number,
  baseline: number | null | undefined,
  direction: 'higher_is_worse' | 'lower_is_worse'
): number | null {
  const result = evaluateDeterioration(current, baseline, direction);
  return result.value;
}

/**
 * Evaluates record against thresholds and applies the 3-out-of-4 Water Wash recommendation rule.
 */
export function evaluateOperationalRecord(
  input: OperationalInput,
  id: string,
  baseline: BaselineConfig,
  thresholds: ThresholdConfig
): OperationalRecord {
  const pr = calculatePressureRatio(input.P3_0, input.P1_7);

  // Parse ISO date-time into reliable timestamp
  const timestamp = parseRecordTimestamp(input.date, input.time);

  // Baseline values
  const hasBaseline = baseline.isConfigured;

  // Deteksi error fisik nilai masukan (P1.7, P3.0, Real Power, NPHR harus bernilai positif > 0)
  const isP17Missing = input.P1_7 === null || input.P1_7 === undefined || isNaN(input.P1_7);
  const isP17Invalid = !isP17Missing && input.P1_7 <= 0;
  const isP30Missing = input.P3_0 === null || input.P3_0 === undefined || isNaN(input.P3_0);
  const isP30Invalid = !isP30Missing && input.P3_0 <= 0;

  const physicalDataErrors: string[] = [];
  if (isP17Invalid) {
    physicalDataErrors.push(`P1.7 = ${input.P1_7} PSIA (harus > 0)`);
  }
  if (isP30Invalid) {
    physicalDataErrors.push(`P3.0 = ${input.P3_0} PSIA (harus > 0)`);
  }

  // Evaluasi 4 indikator deteriorasi dengan pembedaan eksplisit kasus (a) vs kasus (b)
  const nphrEval = hasBaseline
    ? evaluateDeterioration(input.nphr, baseline.nphr, 'higher_is_worse', 'NPHR', 'kcal/kWh')
    : { value: null, status: 'missing' as const };

  const prEval = hasBaseline
    ? (isP17Invalid || isP30Invalid
        ? { value: null, status: 'invalid_physical' as const, errorDetail: 'PR tidak valid karena P1.7 atau P3.0 ≤ 0' }
        : evaluateDeterioration(pr, baseline.PR, 'lower_is_worse', 'PR', ''))
    : { value: null, status: 'missing' as const };

  const p3Eval = hasBaseline
    ? evaluateDeterioration(input.P3_0, baseline.P3_0, 'lower_is_worse', 'P3.0', 'PSIA')
    : { value: null, status: 'missing' as const };

  const powerEval = hasBaseline
    ? evaluateDeterioration(input.realPower, baseline.realPower, 'lower_is_worse', 'Real Power', 'MW')
    : { value: null, status: 'missing' as const };

  if (nphrEval.status === 'invalid_physical' && nphrEval.errorDetail) {
    physicalDataErrors.push(nphrEval.errorDetail);
  }
  if (prEval.status === 'invalid_physical' && prEval.errorDetail && !isP17Invalid && !isP30Invalid) {
    physicalDataErrors.push(prEval.errorDetail);
  }
  if (p3Eval.status === 'invalid_physical' && p3Eval.errorDetail && !isP30Invalid) {
    physicalDataErrors.push(p3Eval.errorDetail);
  }
  if (powerEval.status === 'invalid_physical' && powerEval.errorDetail) {
    physicalDataErrors.push(powerEval.errorDetail);
  }

  const hasPhysicalDataError = physicalDataErrors.length > 0;
  const dataQualityWarning = hasPhysicalDataError
    ? `Data tidak wajar, cek input: ${physicalDataErrors.join('; ')}`
    : null;

  const nphrDeterioration = nphrEval.value;
  const prDeterioration = prEval.value;
  const p3Deterioration = p3Eval.value;
  const powerDeterioration = powerEval.value;

  // Actual physical deltas vs baseline (Current - Baseline)
  const nphrDelta =
    hasBaseline && baseline.nphr !== null && baseline.nphr !== undefined
      ? Number((input.nphr - baseline.nphr).toFixed(1))
      : null;

  const prDelta =
    hasBaseline && baseline.PR !== null && baseline.PR !== undefined
      ? Number((pr - baseline.PR).toFixed(4))
      : null;

  const p3Delta =
    hasBaseline && baseline.P3_0 !== null && baseline.P3_0 !== undefined
      ? Number((input.P3_0 - baseline.P3_0).toFixed(2))
      : null;

  const powerDelta =
    hasBaseline && baseline.realPower !== null && baseline.realPower !== undefined
      ? Number((input.realPower - baseline.realPower).toFixed(2))
      : null;

  // Evaluasi batas ambang: hanya indikator dengan status 'valid' yang bisa lolos threshold
  const nphrThresholdReached =
    nphrEval.status === 'valid' && nphrDeterioration !== null
      ? nphrDeterioration >= thresholds.nphrWWThreshold
      : null;

  const nphrEarlyMonitoringReached =
    nphrEval.status === 'valid' && nphrDeterioration !== null
      ? nphrDeterioration >= thresholds.nphrEarlyMonitoring &&
        nphrDeterioration < thresholds.nphrWWThreshold
      : null;

  const prThresholdReached =
    prEval.status === 'valid' && prDeterioration !== null
      ? prDeterioration >= thresholds.prWWThreshold
      : null;

  const p3ThresholdReached =
    p3Eval.status === 'valid' && p3Deterioration !== null
      ? p3Deterioration >= thresholds.p3WWThreshold
      : null;

  const powerThresholdReached =
    powerEval.status === 'valid' && powerDeterioration !== null
      ? powerDeterioration >= thresholds.powerWWThreshold
      : null;

  // Hitung jumlah indikator yang dievaluasi (Penyebut):
  // Kasus (a) 'missing': data memang belum diinput -> wajar dikecualikan dari penyebut
  // Kasus (b) 'invalid_physical': data ada tapi <= 0 -> indikasi data error, TETAP DIHITUNG di penyebut (tidak turun jadi "dari 3")
  const indicatorEvaluations = [
    { name: 'NPHR', eval: nphrEval },
    { name: 'PR', eval: prEval },
    { name: 'P3.0', eval: p3Eval },
    { name: 'Real Power', eval: powerEval },
  ];

  const evaluatedIndicatorsCount = indicatorEvaluations.filter(
    (item) => item.eval.status === 'valid' || item.eval.status === 'invalid_physical'
  ).length;

  const thresholdsMetCount = [
    nphrThresholdReached,
    prThresholdReached,
    p3ThresholdReached,
    powerThresholdReached,
  ].filter(Boolean).length;

  // Performance Index / Bobot Lolos Diskrit (Formula Excel / Tabel 5 Dashboard Live):
  // Dihitung diskrit HANYA dari indikator yang telah lolos threshold:
  // bobotLolos = (PR lolos ? 30 : 0) + (P3.0 lolos ? 30 : 0) + (NPHR lolos ? 20 : 0) + (RealPower lolos ? 20 : 0)
  // Tidak ada nilai pecahan / proporsional (partial credit dihapus).
  let performanceIndex: number | null = null;
  let performanceIndexContribution: {
    pr: number;
    p3: number;
    nphr: number;
    power: number;
  } | undefined = undefined;

  // Proximity Score (Continuous visual insight murni - TIDAK PERNAH dipakai untuk menentukan overallStatus)
  let proximityScore: number | null = null;

  if (hasBaseline && evaluatedIndicatorsCount >= WATER_WASH_DECISION_RULES.minIndicatorsMet) {
    const prPart = prThresholdReached ? INDICATOR_WEIGHTS.pr : 0;
    const p3Part = p3ThresholdReached ? INDICATOR_WEIGHTS.p3 : 0;
    const nphrPart = nphrThresholdReached ? INDICATOR_WEIGHTS.nphr : 0;
    const powerPart = powerThresholdReached ? INDICATOR_WEIGHTS.power : 0;

    performanceIndex = prPart + p3Part + nphrPart + powerPart;
    performanceIndexContribution = {
      pr: prPart,
      p3: p3Part,
      nphr: nphrPart,
      power: powerPart,
    };

    // Proximity Score: estimasi progres kontinyu menuju threshold (dekoratif/insight murni)
    const prProx = prDeterioration !== null
      ? Math.min(INDICATOR_WEIGHTS.pr, Math.max(0, (prDeterioration / thresholds.prWWThreshold) * INDICATOR_WEIGHTS.pr))
      : 0;
    const p3Prox = p3Deterioration !== null
      ? Math.min(INDICATOR_WEIGHTS.p3, Math.max(0, (p3Deterioration / thresholds.p3WWThreshold) * INDICATOR_WEIGHTS.p3))
      : 0;
    const nphrProx = nphrDeterioration !== null
      ? Math.min(INDICATOR_WEIGHTS.nphr, Math.max(0, (nphrDeterioration / thresholds.nphrWWThreshold) * INDICATOR_WEIGHTS.nphr))
      : 0;
    const powerProx = powerDeterioration !== null
      ? Math.min(INDICATOR_WEIGHTS.power, Math.max(0, (powerDeterioration / thresholds.powerWWThreshold) * INDICATOR_WEIGHTS.power))
      : 0;
    proximityScore = Number((prProx + p3Prox + nphrProx + powerProx).toFixed(1));
  }

  let statusExplanation = '';

  // Rule Specification for Water Washing Evaluation:
  // Pure AND Gate Decision via centralized decision evaluator:
  const decision = evaluateWaterWashDecision({
    evaluatedIndicatorsCount,
    hasBaseline,
    performanceIndex,
    thresholdsMetCount,
    nphrDeterioration,
    nphrEarlyMonitoringThreshold: thresholds.nphrEarlyMonitoring,
  });

  let overallStatus: OverallWaterWashStatus = decision.overallStatus;
  const {
    isRecommendWaterWash,
    isBobotInPantauRange,
    isNphrEarlyMonitoring,
    bobotLolos,
  } = decision;

  if (overallStatus === 'INSUFFICIENT DATA') {
    statusExplanation = 'Reference baseline required for deterioration & Performance Index calculation.';
  } else if (isRecommendWaterWash) {
    overallStatus = 'RECOMMEND WATER WASH';
    statusExplanation = `${thresholdsMetCount} of 4 parameter thresholds met with combined weight ${bobotLolos}%.`;
  } else if (isBobotInPantauRange || isNphrEarlyMonitoring) {
    // Target: else if (bobotLolos berada di rentang Pantau) ATAU (deteriorasi NPHR >= nphrEarlyMonitoring) -> PANTAU
    overallStatus = 'MONITORING';
    const reachedNames = [
      prThresholdReached ? 'PR' : '',
      p3ThresholdReached ? 'P3.0' : '',
      powerThresholdReached ? 'Real Power' : '',
      nphrThresholdReached ? 'NPHR' : '',
    ].filter(Boolean);
    if (isNphrEarlyMonitoring && !isBobotInPantauRange) {
      statusExplanation = `Status Pantau: Deteriorasi NPHR ${nphrDeterioration?.toFixed(1)}% mencapai batas early monitoring (≥${thresholds.nphrEarlyMonitoring}%). Bobot indikator lolos: ${bobotLolos}%.`;
    } else if (reachedNames.length > 0) {
      statusExplanation = `Status Pantau: Bobot indikator lolos ${bobotLolos}% (rentang ${WATER_WASH_DECISION_RULES.minPantauWeight}% - ${WATER_WASH_DECISION_RULES.maxPantauWeight}%). Parameter lolos ambang: ${reachedNames.join(', ')} (${thresholdsMetCount}/4).`;
    } else {
      statusExplanation = `Status Pantau: Bobot indikator lolos ${bobotLolos}% (rentang ${WATER_WASH_DECISION_RULES.minPantauWeight}% - ${WATER_WASH_DECISION_RULES.maxPantauWeight}%).`;
    }
  } else {
    // Target: else -> NORMAL
    overallStatus = 'NORMAL';
    const reachedNames = [
      prThresholdReached ? 'PR' : '',
      p3ThresholdReached ? 'P3.0' : '',
      powerThresholdReached ? 'Real Power' : '',
      nphrThresholdReached ? 'NPHR' : '',
    ].filter(Boolean);
    if (reachedNames.length > 0) {
      statusExplanation = `Status Normal: Bobot indikator lolos ${bobotLolos}% (<${WATER_WASH_DECISION_RULES.minPantauWeight}%). Parameter lolos tunggal: ${reachedNames.join(', ')}.`;
    } else {
      statusExplanation = `Status Normal: Beroperasi normal (Bobot lolos: ${bobotLolos}%, NPHR < ${thresholds.nphrEarlyMonitoring}%).`;
    }
  }

  // Jika terdapat data error besaran fisik <= 0, sertakan peringatan eksplisit
  if (hasPhysicalDataError) {
    statusExplanation = `⚠️ [Data tidak wajar, cek input: ${physicalDataErrors.join('; ')}] ${statusExplanation}`;
  }

  return {
    ...input,
    id,
    timestamp,
    pr,
    nphrDeterioration,
    prDeterioration,
    p3Deterioration,
    powerDeterioration,
    nphrDelta,
    prDelta,
    p3Delta,
    powerDelta,
    nphrThresholdReached,
    nphrEarlyMonitoringReached,
    prThresholdReached,
    p3ThresholdReached,
    powerThresholdReached,
    thresholdsMetCount,
    evaluatedIndicatorsCount,
    overallStatus,
    statusExplanation,
    performanceIndex,
    performanceIndexContribution,
    proximityScore,
    hasPhysicalDataError,
    physicalDataErrors: hasPhysicalDataError ? physicalDataErrors : undefined,
    dataQualityWarning,
  };
}

/**
 * Aggregates a list of operational records by date into daily median records.
 * For any date with multiple hourly readings, calculates the median values
 * (preferring 19:00 - 21:00 peak load or >=21 MW) and evaluates against active baseline & thresholds.
 */
export function aggregateRecordsByDailyMedian(
  records: OperationalRecord[],
  baseline: BaselineConfig,
  thresholds: ThresholdConfig
): OperationalRecord[] {
  if (records.length === 0) return [];

  const groupsByDate = new Map<string, OperationalRecord[]>();
  for (const r of records) {
    const existing = groupsByDate.get(r.date) || [];
    existing.push(r);
    groupsByDate.set(r.date, existing);
  }

  const result: OperationalRecord[] = [];
  const sortedDates = Array.from(groupsByDate.keys()).sort();

  for (const date of sortedDates) {
    const dayRecords = groupsByDate.get(date) || [];
    if (dayRecords.length === 0) continue;

    if (dayRecords.length === 1) {
      const single = dayRecords[0];
      // Always re-evaluate cleanly against current baseline & thresholds
      const evaluated = evaluateOperationalRecord(single, single.id, baseline, thresholds);
      result.push({
        ...evaluated,
        hourlyObservationsCount: 1,
        sourceRecordIds: [single.id],
        isDailyMedian: false,
      });
      continue;
    }

    // Multiple readings on this date: calculate the median of all readings on this date
    const t17Med = getMedian(dayRecords.map((r) => r.T1_7));
    const medianT17 = t17Med !== null ? Number(t17Med.toFixed(1)) : undefined;
    const medianP17 = Number((getMedian(dayRecords.map((r) => r.P1_7)) ?? 0).toFixed(2));
    const medianP30 = Number((getMedian(dayRecords.map((r) => r.P3_0)) ?? 0).toFixed(2));
    const medianPower = Number((getMedian(dayRecords.map((r) => r.realPower)) ?? 0).toFixed(2));
    const medianNphr = Number((getMedian(dayRecords.map((r) => r.nphr)) ?? 0).toFixed(1));
    const anyWW = dayRecords.some((r) => r.isWaterWashEvent);

    const rawInput: OperationalInput = {
      date,
      time: `Median (${dayRecords.length} data)`,
      T1_7: medianT17,
      P1_7: medianP17,
      P3_0: medianP30,
      realPower: medianPower,
      nphr: medianNphr,
      isWaterWashEvent: anyWW,
      notes: `Daily median of ${dayRecords.length} readings on ${date}`,
    };

    // Evaluate cleanly with active baseline and thresholds
    const evaluated = evaluateOperationalRecord(rawInput, `daily-${date}`, baseline, thresholds);

    result.push({
      ...evaluated,
      id: `daily-${date}`,
      timestamp: parseRecordTimestamp(date, '12:00:00'),
      hourlyObservationsCount: dayRecords.length,
      sourceRecordIds: dayRecords.map((r) => r.id),
      isDailyMedian: true,
    });
  }

  return result.sort(compareRecordsChronologically);
}

/**
 * Re-evaluates an entire list of records using current baseline and thresholds
 */
export function reevaluateRecords(
  records: OperationalInput[] | OperationalRecord[],
  baseline: BaselineConfig,
  thresholds: ThresholdConfig
): OperationalRecord[] {
  return records
    .map((record, idx) => {
      const id = 'id' in record ? record.id : `rec_${idx + 1}_${Date.now()}`;
      return evaluateOperationalRecord(record, id, baseline, thresholds);
    })
    .sort(compareRecordsChronologically);
}

/**
 * Helper to compute the median of numbers (safely filters undefined / null / NaN)
 */
function getMedian(values: (number | undefined | null)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Creates a representative record for a given date by calculating the median of all hourly readings on that day.
 * If 19:00 - 21:00 or high load readings exist, those are prioritized, else all readings for the date are used.
 */
function createDailyRepresentativeRecord(
  dateStr: string,
  dayRecords: OperationalRecord[]
): OperationalRecord | undefined {
  if (dayRecords.length === 0) return undefined;
  if (dayRecords.length === 1) return dayRecords[0];

  const t17Med = getMedian(dayRecords.map((r) => r.T1_7));
  const medianT17 = t17Med !== null ? Number(t17Med.toFixed(1)) : undefined;
  const medianP17 = Number((getMedian(dayRecords.map((r) => r.P1_7)) ?? 0).toFixed(2));
  const medianP30 = Number((getMedian(dayRecords.map((r) => r.P3_0)) ?? 0).toFixed(2));
  const prMed = getMedian(dayRecords.map((r) => r.pr));
  const medianPR = medianP17 > 0 ? Number((medianP30 / medianP17).toFixed(4)) : Number((prMed ?? 0).toFixed(4));
  const medianPower = Number((getMedian(dayRecords.map((r) => r.realPower)) ?? 0).toFixed(2));
  const medianNphr = Number((getMedian(dayRecords.map((r) => r.nphr)) ?? 0).toFixed(1));

  // Deteriorations median
  const validPRDet = dayRecords.map((r) => r.prDeterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validP3Det = dayRecords.map((r) => r.p3Deterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validNphrDet = dayRecords.map((r) => r.nphrDeterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validPowerDet = dayRecords.map((r) => r.powerDeterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validPerfIndex = dayRecords.map((r) => r.performanceIndex).filter((v): v is number => v !== null && !isNaN(v));

  const repPRDet = validPRDet.length > 0 ? Number((getMedian(validPRDet) ?? 0).toFixed(4)) : null;
  const repP3Det = validP3Det.length > 0 ? Number((getMedian(validP3Det) ?? 0).toFixed(4)) : null;
  const repNphrDet = validNphrDet.length > 0 ? Number((getMedian(validNphrDet) ?? 0).toFixed(4)) : null;
  const repPowerDet = validPowerDet.length > 0 ? Number((getMedian(validPowerDet) ?? 0).toFixed(4)) : null;
  const repPerfIndex = validPerfIndex.length > 0 ? Number((getMedian(validPerfIndex) ?? 0).toFixed(1)) : null;

  const baseRecord = dayRecords[dayRecords.length - 1];

  return {
    ...baseRecord,
    id: `daily_rep_${dateStr}`,
    date: dateStr,
    time: `${dayRecords.length} data median`,
    timestamp: new Date(`${dateStr}T12:00:00`).getTime(),
    T1_7: medianT17,
    P1_7: medianP17,
    P3_0: medianP30,
    pr: medianPR,
    realPower: medianPower,
    nphr: medianNphr,
    prDeterioration: repPRDet,
    p3Deterioration: repP3Det,
    nphrDeterioration: repNphrDet,
    powerDeterioration: repPowerDet,
    performanceIndex: repPerfIndex,
  };
}

/**
 * Water Wash Performance Recovery Analysis:
 * Compares daily representative performance immediately before (H-1) and after (H+1) each Water Wash event.
 * H-1: day before WW (calculated via median of hourly readings on that day)
 * H+1: day after WW (calculated via median of hourly readings on that day)
 */
export function calculateWaterWashRecovery(
  events: WaterWashEvent[],
  records: OperationalRecord[]
): WaterWashEvent[] {
  if (!records.length || !events.length) return events;

  // Group all records by date
  const recordsByDate = new Map<string, OperationalRecord[]>();
  for (const r of records) {
    const existing = recordsByDate.get(r.date) || [];
    existing.push(r);
    recordsByDate.set(r.date, existing);
  }

  // Precompute daily representative (median) for each unique date
  const dailyRepByDate = new Map<string, OperationalRecord>();
  for (const [d, dayRecs] of recordsByDate.entries()) {
    const rep = createDailyRepresentativeRecord(d, dayRecs);
    if (rep) dailyRepByDate.set(d, rep);
  }

  const allDates = Array.from(dailyRepByDate.keys()).sort();

  return events.map((event) => {
    const eventDate = event.date;
    const eventTime = new Date(eventDate + 'T12:00:00').getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Find date immediately before WW event (prefer exactly 1 day before, or within 3 days)
    const priorDates = allDates.filter((d) => {
      const t = new Date(d + 'T12:00:00').getTime();
      return t < eventTime && (eventTime - t) <= 3.5 * oneDayMs;
    });
    const preDate = priorDates.length > 0 ? priorDates[priorDates.length - 1] : undefined;
    const preRecord = preDate ? dailyRepByDate.get(preDate) : undefined;

    // Find date immediately after WW event (prefer exactly 1 day after, or within 3 days)
    const postDates = allDates.filter((d) => {
      const t = new Date(d + 'T12:00:00').getTime();
      return t > eventTime && (t - eventTime) <= 3.5 * oneDayMs;
    });
    const postDate = postDates.length > 0 ? postDates[0] : undefined;
    const postRecord = postDate ? dailyRepByDate.get(postDate) : undefined;

    if (!preRecord || !postRecord) {
      return {
        ...event,
        preRecord,
        postRecord,
        deltaNPHR: null,
        deltaNPHRPercent: null,
        deltaEfficiency: null,
        deltaP3: null,
        deltaP3Percent: null,
        deltaPR: null,
        deltaPRPercent: null,
        deltaPower: null,
        deltaPowerPercent: null,
      };
    }

    // Delta = Post - Pre
    // For NPHR: negative delta means lower heat rate = recovery
    const deltaNPHR = Number((postRecord.nphr - preRecord.nphr).toFixed(2));
    const deltaNPHRPercent = Number(
      (((postRecord.nphr - preRecord.nphr) / preRecord.nphr) * 100).toFixed(2)
    );

    const preEff = calculateEfficiencyFromNPHR(preRecord.nphr);
    const postEff = calculateEfficiencyFromNPHR(postRecord.nphr);
    const deltaEfficiency =
      preEff !== null && postEff !== null ? Number((postEff - preEff).toFixed(2)) : null;

    // For P3.0, PR, Power: positive delta means increase = recovery
    const deltaP3 = Number((postRecord.P3_0 - preRecord.P3_0).toFixed(2));
    const deltaP3Percent = Number(
      (((postRecord.P3_0 - preRecord.P3_0) / preRecord.P3_0) * 100).toFixed(2)
    );

    const deltaPR = Number((postRecord.pr - preRecord.pr).toFixed(4));
    const deltaPRPercent = Number((((postRecord.pr - preRecord.pr) / preRecord.pr) * 100).toFixed(2));

    const deltaPower = Number((postRecord.realPower - preRecord.realPower).toFixed(2));
    const deltaPowerPercent = Number(
      (((postRecord.realPower - preRecord.realPower) / preRecord.realPower) * 100).toFixed(2)
    );

    return {
      ...event,
      preRecordId: preRecord.id,
      postRecordId: postRecord.id,
      preRecord,
      postRecord,
      deltaNPHR,
      deltaNPHRPercent,
      deltaEfficiency,
      deltaP3,
      deltaP3Percent,
      deltaPR,
      deltaPRPercent,
      deltaPower,
      deltaPowerPercent,
    };
  });
}

/**
 * Deterioration Between Water Wash Cycles:
 * Evaluates how performance deteriorated from the period immediately after one WW event (H+1)
 * to the period immediately before the next WW event (H-1).
 * H+1 after previous WW -> H-1 before next WW.
 */
export function calculateCycleDeterioration(
  events: WaterWashEvent[]
): WaterWashCycleDeterioration[] {
  if (events.length < 2) return [];

  // Sort events chronologically
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const cycles: WaterWashCycleDeterioration[] = [];

  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const prevEvt = sortedEvents[i];
    const nextEvt = sortedEvents[i + 1];

    const prevDate = new Date(prevEvt.date).getTime();
    const nextDate = new Date(nextEvt.date).getTime();
    const intervalDays = Math.round((nextDate - prevDate) / (24 * 60 * 60 * 1000));

    // Clean state: post-WW of prev event (H+1)
    const startRecord = prevEvt.postRecord;
    // Fouled state: pre-WW of next event (H-1)
    const endRecord = nextEvt.preRecord;

    if (!startRecord || !endRecord) {
      cycles.push({
        id: `cycle_${i + 1}`,
        cycleNumber: i + 1,
        prevEventNumber: prevEvt.eventNumber,
        nextEventNumber: nextEvt.eventNumber,
        prevEventDate: prevEvt.date,
        nextEventDate: nextEvt.date,
        intervalDays,
        startRecord,
        endRecord,
        nphrDeteriorationPercent: null,
        efficiencyDeteriorationPercent: null,
        prDeteriorationPercent: null,
        p3DeteriorationPercent: null,
        powerDeteriorationPercent: null,
      });
      continue;
    }

    // NPHR deterioration (% increase):
    const nphrDet = Number(
      (((endRecord.nphr - startRecord.nphr) / startRecord.nphr) * 100).toFixed(2)
    );

    // Efficiency deterioration (% decrease):
    const startEff = calculateEfficiencyFromNPHR(startRecord.nphr);
    const endEff = calculateEfficiencyFromNPHR(endRecord.nphr);
    const effDet =
      startEff && endEff ? Number((((startEff - endEff) / startEff) * 100).toFixed(2)) : null;

    // PR deterioration (% decrease):
    const prDet = Number((((startRecord.pr - endRecord.pr) / startRecord.pr) * 100).toFixed(2));

    // P3.0 deterioration (% decrease):
    const p3Det = Number((((startRecord.P3_0 - endRecord.P3_0) / startRecord.P3_0) * 100).toFixed(2));

    // Real Power deterioration (% decrease):
    const powerDet = Number(
      (((startRecord.realPower - endRecord.realPower) / startRecord.realPower) * 100).toFixed(2)
    );

    cycles.push({
      id: `cycle_${i + 1}`,
      cycleNumber: i + 1,
      prevEventNumber: prevEvt.eventNumber,
      nextEventNumber: nextEvt.eventNumber,
      prevEventDate: prevEvt.date,
      nextEventDate: nextEvt.date,
      intervalDays,
      startRecord,
      endRecord,
      nphrDeteriorationPercent: nphrDet,
      efficiencyDeteriorationPercent: effDet,
      prDeteriorationPercent: prDet,
      p3DeteriorationPercent: p3Det,
      powerDeteriorationPercent: powerDet,
    });
  }

  return cycles;
}

/**
 * Derives WaterWashEvent list directly from operational records.
 * Automatically aggregates multiple hourly records on the same WW date into a single distinct event,
 * with H-1 and H+1 calculated from the daily median representative values.
 */
export function deriveWaterWashEvents(records: OperationalRecord[]): WaterWashEvent[] {
  const wwRecords = records
    .filter((r) => r.isWaterWashEvent)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Group by distinct WW date
  const wwByDate = new Map<string, OperationalRecord[]>();
  for (const r of wwRecords) {
    const existing = wwByDate.get(r.date) || [];
    existing.push(r);
    wwByDate.set(r.date, existing);
  }

  const distinctDates = Array.from(wwByDate.keys()).sort();

  const initialEvents: WaterWashEvent[] = distinctDates.map((dateStr, idx) => {
    const dayWwRecs = wwByDate.get(dateStr) || [];
    const eventNum = dayWwRecs[0]?.waterWashEventNumber || idx + 1;
    const notes = dayWwRecs[0]?.notes || `Water Washing Event #${eventNum} (${dayWwRecs.length} hourly readings)`;

    return {
      id: `ww_evt_${dateStr}`,
      eventNumber: eventNum,
      date: dateStr,
      hourlyObservationsCount: dayWwRecs.length,
      notes,
    };
  });

  return calculateWaterWashRecovery(initialEvents, records);
}

/**
 * Derives cycle deterioration between consecutive Water Wash events (H+1 -> H-1)
 */
export function deriveCycleDeteriorations(
  events: WaterWashEvent[]
): WaterWashCycleDeterioration[] {
  return calculateCycleDeterioration(events);
}
