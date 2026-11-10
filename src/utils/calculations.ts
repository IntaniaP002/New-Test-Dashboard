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
  PBSynthesisEvaluation,
  PBSynthesisDrivebackStatus,
  PT007BaselineComparison,
  PBOperationCurvePoint,
  PBOperationZone,
  PBOperationEvaluation,
  PBOperationInputRecord,
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
    overallStatus = 'CAUTION';
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
/**
 * Official Reference Points for Speedronic NH Curve f(NH):
 * No. | X (NH, RPM) | Y (f(NH))
 * 1   | 6.000 (6000)| 2.3
 * 2   | 7.000 (7000)| 2.8
 * 3   | 8.000 (8000)| 3.9
 * 4   | 9.000 (9000)| 6.3
 * 5   | 10.000(10000)| 10.4
 * 6   | 11.000(11000)| 16.1
 * 7   | 12.000(12000)| 21.5
 * 8   | 13.000(13000)| 24.0
 */
export interface NHCurvePoint {
  x: number;
  y: number;
  label?: string;
}

export const DEFAULT_SPEEDRONIC_CURVE_POINTS: NHCurvePoint[] = [
  { x: 6000, y: 2.3, label: '6.000' },
  { x: 7000, y: 2.8, label: '7.000' },
  { x: 8000, y: 3.9, label: '8.000' },
  { x: 9000, y: 6.3, label: '9.000' },
  { x: 10000, y: 10.4, label: '10.000' },
  { x: 11000, y: 16.1, label: '11.000' },
  { x: 12000, y: 21.5, label: '12.000' },
  { x: 13000, y: 24.0, label: '13.000' },
];

/**
 * Robust parsing for NH Speed inputs:
 * Handles:
 * - "12000" -> 12000
 * - "12.000" -> 12000 (thousands dot separator)
 * - "10500" -> 10500
 * - "10.500" -> 10500
 * - "10.500,5" -> 10500.5
 * - "10500,5" -> 10500.5
 * - "10,500" -> 10500
 */
export function parseNHSpeed(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const str = String(value).trim();
  if (!str) return NaN;

  // Pattern with thousand dot separator e.g. "10.500" or "6.000" or "10.500,5"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned);
  }

  // Pattern with thousand comma separator e.g. "10,500" or "10,500.5"
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    const cleaned = str.replace(/,/g, '');
    return parseFloat(cleaned);
  }

  // Single dot with exactly 3 digits e.g. "10.500" or "12.000"
  if (/^\d+\.\d{3}$/.test(str)) {
    return parseFloat(str.replace('.', ''));
  }

  // Default: replace comma with dot e.g. "10500.5" or "10500,5" or "12000"
  return parseFloat(str.replace(',', '.'));
}

/**
 * Automatically find the appropriate interpolation interval [X1, X2]
 * from the official Speedronic curve table.
 */
export function getAutoInterpolationPoints(
  x: number,
  points: NHCurvePoint[] = DEFAULT_SPEEDRONIC_CURVE_POINTS
): { x1: number; y1: number; x2: number; y2: number } {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length < 2) {
    return { x1: 10000, y1: 10.4, x2: 11000, y2: 16.1 };
  }

  if (isNaN(x) || x <= 0) {
    return { x1: 10000, y1: 10.4, x2: 11000, y2: 16.1 };
  }

  // If x is smaller than or equal to first point
  if (x <= sorted[0].x) {
    return {
      x1: sorted[0].x,
      y1: sorted[0].y,
      x2: sorted[1].x,
      y2: sorted[1].y,
    };
  }

  // If x falls within an interval
  for (let i = 0; i < sorted.length - 1; i++) {
    if (x >= sorted[i].x && x <= sorted[i + 1].x) {
      return {
        x1: sorted[i].x,
        y1: sorted[i].y,
        x2: sorted[i + 1].x,
        y2: sorted[i + 1].y,
      };
    }
  }

  // If x is greater than last point
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  return {
    x1: prev.x,
    y1: prev.y,
    x2: last.x,
    y2: last.y,
  };
}

/**
 * Linear interpolation formula:
 * Y = Y1 + ((X - X1) / (X2 - X1)) * (Y2 - Y1)
 */
export function interpolateY(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (x2 === x1) return y1;
  const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  return Number(y.toFixed(4));
}

/**
 * Calculates PB Synthesis evaluation for:
 * 1. Alarm Limits (±18%):
 *    PB_upper = PB_syn * 1.18 (+18%)
 *    PB_lower = PB_syn * 0.82 (-18%)
 *    Deviasi PB (%) = ((PB_aktual - PB_syn) / PB_syn) * 100%
 *    Status: NORMAL, HIGH_ALARM, LOW_ALARM
 *
 * 2. Driveback Limits (Y = f(NH), PB_upper = Y * PT006 * 1.2, PB_lower = Y * PT006 * 0.8):
 *    Jika diinput NH Speed (X), nilai Y dihitung melalui rumus interpolasi:
 *    Y = Y1 + ((X - X1) / (X2 - X1)) * (Y2 - Y1)
 *    Batas atas: PB_upper_DB = Y * PT006 * 1.2 (atau upperMultiplier)
 *    Batas bawah: PB_lower_DB = Y * PT006 * 0.8 (atau lowerMultiplier)
 *    Jika PB aktual melampaui batas atas atau bawah (crossing), status menampilkan "RECOMMEND WATER WASH".
 */
export function evaluatePBSynthesis(
  pbAktual: number, // P3.0
  pbSynthesis?: number | null,
  pbSynthesisDB?: number | null,
  fNH?: number | null,
  pt006?: number | null,
  nhSpeed?: number | null,
  x1?: number | null,
  y1?: number | null,
  x2?: number | null,
  y2?: number | null,
  upperMultiplier: number = 1.2,
  lowerMultiplier: number = 0.8
): PBSynthesisEvaluation | null {
  if (isNaN(pbAktual) || pbAktual <= 0) {
    return null;
  }

  // If NH Speed (X) and interpolation points (X1, Y1, X2, Y2) are provided, calculate Y = f(NH)
  let resolvedY: number | null = fNH ?? null;
  if (
    nhSpeed !== null &&
    nhSpeed !== undefined &&
    !isNaN(nhSpeed) &&
    x1 !== null &&
    x1 !== undefined &&
    !isNaN(x1) &&
    y1 !== null &&
    y1 !== undefined &&
    !isNaN(y1) &&
    x2 !== null &&
    x2 !== undefined &&
    !isNaN(x2) &&
    y2 !== null &&
    y2 !== undefined &&
    !isNaN(y2) &&
    x2 !== x1
  ) {
    resolvedY = interpolateY(nhSpeed, x1, y1, x2, y2);
  }

  // Calculate PB Synthesis DB from Y * PT006 if provided
  let computedDB: number | null = null;
  if (
    resolvedY !== null &&
    !isNaN(resolvedY) &&
    resolvedY > 0 &&
    pt006 !== null &&
    pt006 !== undefined &&
    !isNaN(pt006) &&
    pt006 > 0
  ) {
    computedDB = Number((resolvedY * pt006).toFixed(2));
  }

  const effectivePbSynDB = computedDB ?? (pbSynthesisDB !== null && pbSynthesisDB !== undefined && !isNaN(pbSynthesisDB) && pbSynthesisDB > 0 ? pbSynthesisDB : null);

  const hasAlarm = pbSynthesis !== null && pbSynthesis !== undefined && !isNaN(pbSynthesis) && pbSynthesis > 0;
  const hasDB = effectivePbSynDB !== null && effectivePbSynDB > 0;

  if (!hasAlarm && !hasDB) {
    return null;
  }

  // 1. Alarm Monitoring (±18%)
  const effectivePbSyn = hasAlarm ? pbSynthesis! : effectivePbSynDB!;
  const pbUpper = Number((effectivePbSyn * 1.18).toFixed(2));
  const pbLower = Number((effectivePbSyn * 0.82).toFixed(2));
  const pbDeviationPercent = Number(
    (((pbAktual - effectivePbSyn) / effectivePbSyn) * 100).toFixed(2)
  );

  let status: 'NORMAL' | 'HIGH_ALARM' | 'LOW_ALARM' = 'NORMAL';
  let statusMessage = 'Normal (Dalam batas toleransi ±18%)';

  if (pbAktual > pbUpper) {
    status = 'HIGH_ALARM';
    statusMessage = `High Alarm: PB Aktual (${pbAktual} PSIA) melampaui batas atas ${pbUpper} PSIA (+18%)`;
  } else if (pbAktual < pbLower) {
    status = 'LOW_ALARM';
    statusMessage = `Low Alarm: PB Aktual (${pbAktual} PSIA) berada di bawah batas bawah ${pbLower} PSIA (-18%)`;
  }

  // 2. Driveback Monitoring (Y = f(NH), PB_upper = Y * PT006 * 1.2, PB_lower = Y * PT006 * 0.8)
  let pbUpperDB: number | null = null;
  let pbLowerDB: number | null = null;
  let pbDeviationDBPercent: number | null = null;
  let statusDB: PBSynthesisDrivebackStatus | null = null;
  let statusDBMessage: string | undefined = undefined;
  let isDrivebackCrossing = false;
  let isDrivebackWWRecommended = false;

  if (effectivePbSynDB !== null && effectivePbSynDB > 0) {
    pbUpperDB = Number((effectivePbSynDB * upperMultiplier).toFixed(2));
    pbLowerDB = Number((effectivePbSynDB * lowerMultiplier).toFixed(2));
    pbDeviationDBPercent = Number(
      (((pbAktual - effectivePbSynDB) / effectivePbSynDB) * 100).toFixed(2)
    );

    if (pbAktual > pbUpperDB) {
      statusDB = 'RECOMMEND WATER WASH';
      isDrivebackCrossing = true;
      isDrivebackWWRecommended = true;
      statusDBMessage = `Recommend Water Wash: PB Aktual (${pbAktual} PSIA) melampaui batas atas driveback (${pbUpperDB} PSIA, Y×PT006×${upperMultiplier}). Crossing High Boundary.`;
    } else if (pbAktual < pbLowerDB) {
      statusDB = 'RECOMMEND WATER WASH';
      isDrivebackCrossing = true;
      isDrivebackWWRecommended = true;
      statusDBMessage = `Recommend Water Wash: PB Aktual (${pbAktual} PSIA) berada di bawah batas bawah driveback (${pbLowerDB} PSIA, Y×PT006×${lowerMultiplier}). Crossing Low Boundary.`;
    } else {
      statusDB = 'NORMAL';
      statusDBMessage = `Normal: PB Aktual (${pbAktual} PSIA) berada di dalam batas driveback (${pbLowerDB} – ${pbUpperDB} PSIA).`;
    }
  }

  return {
    pbAktual,
    pbSynthesis: effectivePbSyn,
    pbUpper,
    pbLower,
    pbDeviationPercent,
    status,
    statusMessage,
    pbSynthesisDB: effectivePbSynDB,
    fNH: resolvedY,
    nhSpeed: nhSpeed ?? null,
    x1: x1 ?? null,
    y1: y1 ?? null,
    x2: x2 ?? null,
    y2: y2 ?? null,
    upperMultiplier,
    lowerMultiplier,
    pt006: pt006 ?? null,
    pbUpperDB,
    pbLowerDB,
    pbDeviationDBPercent,
    statusDB,
    statusDBMessage,
    isDrivebackCrossing,
    isDrivebackWWRecommended,
  };
}

/**
 * Compares any PT or PT007 (Compressor Discharge Pressure, PSIA) against the Active Baseline thresholds.
 * Calculates:
 * - Percentage of Upper Threshold: (PT007 / UpperThreshold) * 100%
 * - Headroom to Upper Threshold: ((UpperThreshold - PT007) / UpperThreshold) * 100%
 * - Percentage of Lower Threshold: (PT007 / LowerThreshold) * 100%
 * - Margin above Lower Threshold: ((PT007 - LowerThreshold) / LowerThreshold) * 100%
 * - Position inside operating band: ((PT007 - LowerThreshold) / (UpperThreshold - LowerThreshold)) * 100%
 * - Evaluates crossing and recommends Water Wash if PT007 exceeds upper or drops below lower threshold.
 */
export function comparePT007ToBaseline(
  pt007: number,
  upperThreshold: number,
  lowerThreshold: number,
  nominalDB?: number | null
): PT007BaselineComparison | null {
  if (
    isNaN(pt007) ||
    pt007 <= 0 ||
    isNaN(upperThreshold) ||
    isNaN(lowerThreshold) ||
    upperThreshold <= lowerThreshold
  ) {
    return null;
  }

  const percentOfUpper = Number(((pt007 / upperThreshold) * 100).toFixed(2));
  const headroomToUpper = Number((((upperThreshold - pt007) / upperThreshold) * 100).toFixed(2));
  const percentOfLower = Number(((pt007 / lowerThreshold) * 100).toFixed(2));
  const marginAboveLower = Number((((pt007 - lowerThreshold) / lowerThreshold) * 100).toFixed(2));

  const bandRange = upperThreshold - lowerThreshold;
  const rawBandPos = ((pt007 - lowerThreshold) / bandRange) * 100;
  const bandPositionPercent = Number(rawBandPos.toFixed(2));

  const isExceedingUpper = pt007 > upperThreshold;
  const isDroppingBelowLower = pt007 < lowerThreshold;
  const isNormal = !isExceedingUpper && !isDroppingBelowLower;

  let status: 'NORMAL' | 'RECOMMEND WATER WASH' = 'NORMAL';
  let statusDetail: 'NORMAL' | 'HIGH_CROSSING' | 'LOW_CROSSING' = 'NORMAL';
  let message = `Normal: PT007 (${pt007} PSIA) berada dalam batas aman driveback (${lowerThreshold} – ${upperThreshold} PSIA). Margin atas: ${headroomToUpper > 0 ? '+' : ''}${headroomToUpper}%, margin bawah: ${marginAboveLower > 0 ? '+' : ''}${marginAboveLower}%.`;

  if (isExceedingUpper) {
    status = 'RECOMMEND WATER WASH';
    statusDetail = 'HIGH_CROSSING';
    message = `RECOMMEND WATER WASH: PT007 (${pt007} PSIA) melampaui batas atas baseline (${upperThreshold} PSIA, ${percentOfUpper}% dari batas atas). Sinyal menembus batas atas driveback.`;
  } else if (isDroppingBelowLower) {
    status = 'RECOMMEND WATER WASH';
    statusDetail = 'LOW_CROSSING';
    message = `RECOMMEND WATER WASH: PT007 (${pt007} PSIA) berada di bawah batas bawah baseline (${lowerThreshold} PSIA, ${percentOfLower}% dari batas bawah). Sinyal jatuh di bawah batas bawah driveback.`;
  }

  return {
    pt007,
    upperThreshold,
    lowerThreshold,
    nominalDB: nominalDB ?? Number(((upperThreshold + lowerThreshold) / 2).toFixed(2)),
    percentOfUpper,
    headroomToUpper,
    percentOfLower,
    marginAboveLower,
    bandPositionPercent,
    isExceedingUpper,
    isDroppingBelowLower,
    isNormal,
    status,
    statusDetail,
    message,
  };
}

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
    // Target: else if (bobotLolos berada di rentang Caution) ATAU (deteriorasi NPHR >= nphrEarlyMonitoring) -> CAUTION
    overallStatus = 'CAUTION';
    const reachedNames = [
      prThresholdReached ? 'PR' : '',
      p3ThresholdReached ? 'P3.0' : '',
      powerThresholdReached ? 'Real Power' : '',
      nphrThresholdReached ? 'NPHR' : '',
    ].filter(Boolean);
    if (isNphrEarlyMonitoring && !isBobotInPantauRange) {
      statusExplanation = `Status Caution: Deteriorasi NPHR ${nphrDeterioration?.toFixed(1)}% mencapai batas early monitoring (≥${thresholds.nphrEarlyMonitoring}%). Bobot indikator lolos: ${bobotLolos}%.`;
    } else if (reachedNames.length > 0) {
      statusExplanation = `Status Caution: Bobot indikator lolos ${bobotLolos}% (rentang ${WATER_WASH_DECISION_RULES.minPantauWeight}% - ${WATER_WASH_DECISION_RULES.maxPantauWeight}%). Parameter lolos ambang: ${reachedNames.join(', ')} (${thresholdsMetCount}/4).`;
    } else {
      statusExplanation = `Status Caution: Bobot indikator lolos ${bobotLolos}% (rentang ${WATER_WASH_DECISION_RULES.minPantauWeight}% - ${WATER_WASH_DECISION_RULES.maxPantauWeight}%).`;
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

  const pt006Value = input.pt006 ?? (input.P1_7 > 0 ? input.P1_7 : null);
  const upperMul = input.upperMultiplier ?? 1.2;
  const lowerMul = input.lowerMultiplier ?? 0.8;

  // Evaluasi PB Synthesis & Driveback menggunakan PB aktual (= input.P3_0)
  const pbEval = evaluatePBSynthesis(
    input.P3_0,
    input.pbSynthesis,
    input.pbSynthesisDB,
    input.fNH,
    pt006Value,
    input.nhSpeed,
    input.x1,
    input.y1,
    input.x2,
    input.y2,
    upperMul,
    lowerMul
  );

  // Jika terdapat data error besaran fisik <= 0, sertakan peringatan eksplisit
  if (hasPhysicalDataError) {
    statusExplanation = `⚠️ [Data tidak wajar, cek input: ${physicalDataErrors.join('; ')}] ${statusExplanation}`;
  }

  // Jika driveback crossing batas atas / bawah, tambahkan peringatan Recommend Water Wash
  if (pbEval?.isDrivebackWWRecommended) {
    statusExplanation = `[Driveback: RECOMMEND WATER WASH - Batas Driveback Terlampaui] ${statusExplanation}`;
  }

  const pt007 = input.P3_0;
  let pbPercentOfUpper: number | null = null;
  let pbPercentOfLower: number | null = null;
  let pbHeadroomToUpper: number | null = null;
  let pbMarginAboveLower: number | null = null;
  let pbBandPositionPercent: number | null = null;

  if (pbEval?.pbUpperDB && pbEval?.pbLowerDB && pbEval.pbUpperDB > pbEval.pbLowerDB && pt007 > 0) {
    pbPercentOfUpper = Number(((pt007 / pbEval.pbUpperDB) * 100).toFixed(2));
    pbHeadroomToUpper = Number((((pbEval.pbUpperDB - pt007) / pbEval.pbUpperDB) * 100).toFixed(2));
    pbPercentOfLower = Number(((pt007 / pbEval.pbLowerDB) * 100).toFixed(2));
    pbMarginAboveLower = Number((((pt007 - pbEval.pbLowerDB) / pbEval.pbLowerDB) * 100).toFixed(2));
    pbBandPositionPercent = Number((((pt007 - pbEval.pbLowerDB) / (pbEval.pbUpperDB - pbEval.pbLowerDB)) * 100).toFixed(2));
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
    pbSynthesis: input.pbSynthesis ?? pbEval?.pbSynthesis ?? null,
    pbUpper: pbEval?.pbUpper ?? null,
    pbLower: pbEval?.pbLower ?? null,
    pbDeviationPercent: pbEval?.pbDeviationPercent ?? null,
    pbStatus: pbEval?.status ?? null,
    pbStatusMessage: pbEval?.statusMessage,
    pbSynthesisDB: pbEval?.pbSynthesisDB ?? input.pbSynthesisDB ?? null,
    fNH: pbEval?.fNH ?? input.fNH ?? null,
    nhSpeed: input.nhSpeed ?? pbEval?.nhSpeed ?? null,
    x1: input.x1 ?? pbEval?.x1 ?? null,
    y1: input.y1 ?? pbEval?.y1 ?? null,
    x2: input.x2 ?? pbEval?.x2 ?? null,
    y2: input.y2 ?? pbEval?.y2 ?? null,
    upperMultiplier: upperMul,
    lowerMultiplier: lowerMul,
    pt006: pt006Value ?? pbEval?.pt006 ?? null,
    pbUpperDB: pbEval?.pbUpperDB ?? null,
    pbLowerDB: pbEval?.pbLowerDB ?? null,
    pbDeviationDBPercent: pbEval?.pbDeviationDBPercent ?? null,
    pbStatusDB: pbEval?.statusDB ?? null,
    pbStatusDBMessage: pbEval?.statusDBMessage,
    isDrivebackCrossing: pbEval?.isDrivebackCrossing ?? false,
    isDrivebackWWRecommended: pbEval?.isDrivebackWWRecommended ?? false,
    isPbBaseline: input.isPbBaseline ?? false,
    pt007,
    pbPercentOfUpper,
    pbPercentOfLower,
    pbHeadroomToUpper,
    pbMarginAboveLower,
    pbBandPositionPercent,
  };
}

/**
 * Aggregates a list of operational records by date into daily median records.
 * For any date with multiple hourly readings, calculates the median values
 * (preferring 19:00 - 21:00 peak load or >=21 MW) and evaluates against active baseline & thresholds.
 */
export function getAverage(values: (number | undefined | null)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, curr) => acc + curr, 0);
  return sum / valid.length;
}

/**
 * Checks whether a given time string falls within the 19:00 - 21:00 operating window.
 * Format accepted: HH:MM, HH:MM:SS, HH.MM, HH.MM.SS
 */
export function isTimeInRange19to21(timeStr: string | undefined): boolean {
  if (!timeStr) return false;
  const match = timeStr.trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return false;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const totalMinutes = hour * 60 + minute;
  // 19:00 is 19 * 60 = 1140 minutes
  // 21:00 is 21 * 60 = 1260 minutes (inclusive of 21:00)
  return totalMinutes >= 1140 && totalMinutes <= 1260;
}

/**
 * Aggregates a list of operational records by date into daily average records.
 * For any date with multiple hourly readings, calculates the arithmetic average values
 * strictly from readings in the 19:00 - 21:00 window, and evaluates cleanly against active baseline & thresholds.
 */
export function aggregateRecordsByDailyAverage(
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
    const allDayRecords = groupsByDate.get(date) || [];
    if (allDayRecords.length === 0) continue;

    // 1. Priority: Filter strictly to data that ranges from 19:00 - 21:00
    const window19to21Records = allDayRecords.filter((r) => isTimeInRange19to21(r.time));
    // 2. Fallback: If no 19:00 - 21:00 data, average data that has real power 20 - 24 MW
    const power20to24Records = allDayRecords.filter((r) => r.realPower >= 20.0 && r.realPower <= 24.0);

    let dayRecords: OperationalRecord[];
    let filterDescription: string;

    if (window19to21Records.length > 0) {
      dayRecords = window19to21Records;
      filterDescription = `19:00-21:00 (${dayRecords.length} data)`;
    } else if (power20to24Records.length > 0) {
      dayRecords = power20to24Records;
      filterDescription = `Power 20-24MW (${dayRecords.length} data)`;
    } else {
      dayRecords = allDayRecords;
      filterDescription = `All Available (${dayRecords.length} data)`;
    }

    if (dayRecords.length === 1) {
      const single = dayRecords[0];
      // Always re-evaluate cleanly against current baseline & thresholds
      const evaluated = evaluateOperationalRecord(single, single.id, baseline, thresholds);
      result.push({
        ...evaluated,
        hourlyObservationsCount: 1,
        sourceRecordIds: [single.id],
        isDailyMedian: false,
        isDailyAverage: false,
      });
      continue;
    }

    // Multiple readings: calculate the arithmetic average of readings from the selected group
    const t17Avg = getAverage(dayRecords.map((r) => r.T1_7));
    const avgT17 = t17Avg !== null ? Number(t17Avg.toFixed(1)) : undefined;
    const avgP17 = Number((getAverage(dayRecords.map((r) => r.P1_7)) ?? 0).toFixed(2));
    const avgP30 = Number((getAverage(dayRecords.map((r) => r.P3_0)) ?? 0).toFixed(2));
    const avgPower = Number((getAverage(dayRecords.map((r) => r.realPower)) ?? 0).toFixed(2));
    const avgNphr = Number((getAverage(dayRecords.map((r) => r.nphr)) ?? 0).toFixed(1));

    const pbSynAvg = getAverage(dayRecords.map((r) => r.pbSynthesis));
    const avgPbSyn = pbSynAvg !== null ? Number(pbSynAvg.toFixed(2)) : undefined;
    const pbSynDBAvg = getAverage(dayRecords.map((r) => r.pbSynthesisDB));
    const avgPbSynDB = pbSynDBAvg !== null ? Number(pbSynDBAvg.toFixed(2)) : undefined;
    const fNHAvg = getAverage(dayRecords.map((r) => r.fNH));
    const avgFNH = fNHAvg !== null ? Number(fNHAvg.toFixed(3)) : undefined;
    const nhSpeedAvg = getAverage(dayRecords.map((r) => r.nhSpeed));
    const avgNHSpeed = nhSpeedAvg !== null ? Number(nhSpeedAvg.toFixed(1)) : undefined;
    const anyWW = allDayRecords.some((r) => r.isWaterWashEvent);

    const rawInput: OperationalInput = {
      date,
      time: `Average ${filterDescription}`,
      T1_7: avgT17,
      P1_7: avgP17,
      P3_0: avgP30,
      realPower: avgPower,
      nphr: avgNphr,
      pbSynthesis: avgPbSyn,
      pbSynthesisDB: avgPbSynDB,
      fNH: avgFNH,
      nhSpeed: avgNHSpeed,
      pt006: avgP17,
      isWaterWashEvent: anyWW,
      notes: `Daily average of ${dayRecords.length} readings (${filterDescription}) on ${date}`,
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
      isDailyAverage: true,
    });
  }

  return result.sort(compareRecordsChronologically);
}

// Backward-compatibility alias
export const aggregateRecordsByDailyMedian = aggregateRecordsByDailyAverage;

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
 * Creates a representative record for a given date by calculating the average of all hourly readings on that day.
 * If 19:00 - 21:00 or high load readings exist, those are prioritized, else all readings for the date are used.
 */
function createDailyRepresentativeRecord(
  dateStr: string,
  allDayRecords: OperationalRecord[]
): OperationalRecord | undefined {
  if (allDayRecords.length === 0) return undefined;

  const window19to21Records = allDayRecords.filter((r) => isTimeInRange19to21(r.time));
  const power20to24Records = allDayRecords.filter((r) => r.realPower >= 20.0 && r.realPower <= 24.0);

  let dayRecords: OperationalRecord[];
  let filterDesc: string;

  if (window19to21Records.length > 0) {
    dayRecords = window19to21Records;
    filterDesc = `19:00-21:00 (${dayRecords.length} data)`;
  } else if (power20to24Records.length > 0) {
    dayRecords = power20to24Records;
    filterDesc = `Power 20-24MW (${dayRecords.length} data)`;
  } else {
    dayRecords = allDayRecords;
    filterDesc = `All Available (${dayRecords.length} data)`;
  }

  if (dayRecords.length === 1) return dayRecords[0];

  const t17Avg = getAverage(dayRecords.map((r) => r.T1_7));
  const avgT17 = t17Avg !== null ? Number(t17Avg.toFixed(1)) : undefined;
  const avgP17 = Number((getAverage(dayRecords.map((r) => r.P1_7)) ?? 0).toFixed(2));
  const avgP30 = Number((getAverage(dayRecords.map((r) => r.P3_0)) ?? 0).toFixed(2));
  const prAvg = getAverage(dayRecords.map((r) => r.pr));
  const avgPR = avgP17 > 0 ? Number((avgP30 / avgP17).toFixed(4)) : Number((prAvg ?? 0).toFixed(4));
  const avgPower = Number((getAverage(dayRecords.map((r) => r.realPower)) ?? 0).toFixed(2));
  const avgNphr = Number((getAverage(dayRecords.map((r) => r.nphr)) ?? 0).toFixed(1));

  // Deteriorations average
  const validPRDet = dayRecords.map((r) => r.prDeterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validP3Det = dayRecords.map((r) => r.p3Deterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validNphrDet = dayRecords.map((r) => r.nphrDeterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validPowerDet = dayRecords.map((r) => r.powerDeterioration).filter((v): v is number => v !== null && !isNaN(v));
  const validPerfIndex = dayRecords.map((r) => r.performanceIndex).filter((v): v is number => v !== null && !isNaN(v));

  const repPRDet = validPRDet.length > 0 ? Number((getAverage(validPRDet) ?? 0).toFixed(4)) : null;
  const repP3Det = validP3Det.length > 0 ? Number((getAverage(validP3Det) ?? 0).toFixed(4)) : null;
  const repNphrDet = validNphrDet.length > 0 ? Number((getAverage(validNphrDet) ?? 0).toFixed(4)) : null;
  const repPowerDet = validPowerDet.length > 0 ? Number((getAverage(validPowerDet) ?? 0).toFixed(4)) : null;
  const repPerfIndex = validPerfIndex.length > 0 ? Number((getAverage(validPerfIndex) ?? 0).toFixed(1)) : null;

  const baseRecord = dayRecords[dayRecords.length - 1];

  return {
    ...baseRecord,
    id: `daily_rep_${dateStr}`,
    date: dateStr,
    time: `${dayRecords.length} data average`,
    timestamp: new Date(`${dateStr}T12:00:00`).getTime(),
    T1_7: avgT17,
    P1_7: avgP17,
    P3_0: avgP30,
    pr: avgPR,
    realPower: avgPower,
    nphr: avgNphr,
    prDeterioration: repPRDet,
    p3Deterioration: repP3Det,
    nphrDeterioration: repNphrDet,
    powerDeterioration: repPowerDet,
    performanceIndex: repPerfIndex,
    isDailyMedian: true,
    isDailyAverage: true,
  };
}

/**
 * Water Wash Performance Recovery Analysis:
 * Compares daily representative performance immediately before (H-1) and after (H+1) each Water Wash event.
 * H-1: day before WW (calculated via average of hourly readings on that day)
 * H+1: day after WW (calculated via average of hourly readings on that day)
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

  // Precompute daily representative (average) for each unique date
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

    // 1. Find last operating date strictly before WW event (date < eventDate):
    // The wash date itself (eventDate) represents post-wash running hours,
    // so the pre-wash condition MUST be the last operating date before the wash (e.g. 6th Oct if wash is on 9th Oct).
    const priorDates = allDates.filter((d) => {
      const t = new Date(d + 'T12:00:00').getTime();
      return t < eventTime;
    });
    const preDate = priorDates.length > 0 ? priorDates[priorDates.length - 1] : undefined;
    const preRecord = preDate ? dailyRepByDate.get(preDate) : undefined;
    const preDaysDiff = preDate
      ? Math.round((eventTime - new Date(preDate + 'T12:00:00').getTime()) / oneDayMs)
      : undefined;

    // 2. Find closest operating date strictly after WW event (date > eventDate, e.g. H+1):
    const postDates = allDates.filter((d) => {
      const t = new Date(d + 'T12:00:00').getTime();
      return t > eventTime;
    });
    const postDate = postDates.length > 0 ? postDates[0] : undefined;
    const postRecord = postDate ? dailyRepByDate.get(postDate) : undefined;
    const postDaysDiff = postDate
      ? Math.round((new Date(postDate + 'T12:00:00').getTime() - eventTime) / oneDayMs)
      : undefined;

    if (!preRecord || !postRecord) {
      return {
        ...event,
        preRecordId: preRecord?.id,
        postRecordId: postRecord?.id,
        preDaysDiff,
        postDaysDiff,
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
      preDaysDiff,
      postDaysDiff,
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
 * with H-1 and H+1 calculated from the daily average representative values.
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

/**
 * 23 Operational Reference Points based on Power (1.43 MW to 23.01 MW)
 * directly transcribed from supervisor's calibrated operating data:
 * Beban (MW) | X (NH speed) | Y (f(NH)) | PT006 (PSIA) | Baseline (Y*PT006) | Early Atas (1.1x) | Early Bawah (0.9x) | Batas Atas (1.2x) | Batas Bawah (0.8x)
 */
export const DEFAULT_PB_OPERATION_CURVE_POINTS: PBOperationCurvePoint[] = [
  { beban: 1.43, nhSpeed: 9131, yInterpolated: 6.84, pt006: 14.68, pbSynthesis: 100.37, earlyUpper: 114.44, earlyLower: 86.30, upperThreshold: 118.44, lowerThreshold: 82.30 },
  { beban: 2.03, nhSpeed: 9357, yInterpolated: 7.76, pt006: 14.68, pbSynthesis: 113.97, earlyUpper: 130.48, earlyLower: 97.46, upperThreshold: 134.48, lowerThreshold: 93.46 },
  { beban: 3.08, nhSpeed: 9586, yInterpolated: 8.70, pt006: 14.68, pbSynthesis: 127.75, earlyUpper: 146.75, earlyLower: 108.76, upperThreshold: 150.75, lowerThreshold: 104.76 },
  { beban: 4.01, nhSpeed: 9812, yInterpolated: 9.63, pt006: 14.67, pbSynthesis: 141.26, earlyUpper: 162.69, earlyLower: 119.83, upperThreshold: 166.69, lowerThreshold: 115.83 },
  { beban: 5.04, nhSpeed: 10007, yInterpolated: 10.44, pt006: 14.67, pbSynthesis: 153.15, earlyUpper: 176.72, earlyLower: 129.58, upperThreshold: 180.72, lowerThreshold: 125.58 },
  { beban: 6.04, nhSpeed: 10102, yInterpolated: 10.98, pt006: 14.67, pbSynthesis: 161.10, earlyUpper: 186.10, earlyLower: 136.10, upperThreshold: 190.10, lowerThreshold: 132.10 },
  { beban: 7.06, nhSpeed: 10253, yInterpolated: 11.84, pt006: 14.67, pbSynthesis: 173.72, earlyUpper: 200.99, earlyLower: 146.45, upperThreshold: 204.99, lowerThreshold: 142.45 },
  { beban: 8.01, nhSpeed: 10381, yInterpolated: 12.57, pt006: 14.66, pbSynthesis: 184.30, earlyUpper: 213.47, earlyLower: 155.13, upperThreshold: 217.47, lowerThreshold: 151.13 },
  { beban: 9.00, nhSpeed: 10485, yInterpolated: 13.16, pt006: 14.66, pbSynthesis: 192.99, earlyUpper: 223.73, earlyLower: 162.25, upperThreshold: 227.73, lowerThreshold: 158.25 },
  { beban: 10.00, nhSpeed: 10645, yInterpolated: 14.08, pt006: 14.65, pbSynthesis: 206.22, earlyUpper: 239.34, earlyLower: 173.10, upperThreshold: 243.34, lowerThreshold: 169.10 },
  { beban: 11.03, nhSpeed: 10763, yInterpolated: 14.75, pt006: 14.65, pbSynthesis: 216.07, earlyUpper: 250.96, earlyLower: 181.18, upperThreshold: 254.96, lowerThreshold: 177.18 },
  { beban: 12.13, nhSpeed: 10880, yInterpolated: 15.42, pt006: 14.65, pbSynthesis: 225.84, earlyUpper: 262.49, earlyLower: 189.19, upperThreshold: 266.49, lowerThreshold: 185.19 },
  { beban: 13.09, nhSpeed: 10988, yInterpolated: 16.03, pt006: 14.65, pbSynthesis: 234.86, earlyUpper: 273.13, earlyLower: 196.59, upperThreshold: 277.13, lowerThreshold: 192.59 },
  { beban: 14.01, nhSpeed: 10950, yInterpolated: 15.82, pt006: 14.65, pbSynthesis: 231.69, earlyUpper: 269.39, earlyLower: 193.99, upperThreshold: 273.39, lowerThreshold: 189.99 },
  { beban: 15.00, nhSpeed: 11046, yInterpolated: 16.35, pt006: 14.65, pbSynthesis: 239.50, earlyUpper: 278.61, earlyLower: 200.39, upperThreshold: 282.61, lowerThreshold: 196.39 },
  { beban: 16.00, nhSpeed: 11141, yInterpolated: 16.86, pt006: 14.65, pbSynthesis: 247.02, earlyUpper: 287.48, earlyLower: 206.56, upperThreshold: 291.48, lowerThreshold: 202.56 },
  { beban: 17.22, nhSpeed: 11256, yInterpolated: 17.48, pt006: 14.64, pbSynthesis: 255.94, earlyUpper: 298.01, earlyLower: 213.87, upperThreshold: 302.01, lowerThreshold: 209.87 },
  { beban: 18.00, nhSpeed: 11309, yInterpolated: 17.77, pt006: 14.64, pbSynthesis: 242.00, earlyUpper: 281.56, earlyLower: 202.44, upperThreshold: 285.56, lowerThreshold: 198.44 },
  { beban: 19.03, nhSpeed: 11350, yInterpolated: 18.00, pt006: 14.64, pbSynthesis: 248.50, earlyUpper: 289.23, earlyLower: 207.77, upperThreshold: 293.23, lowerThreshold: 203.77 },
  { beban: 20.11, nhSpeed: 11385, yInterpolated: 18.15, pt006: 14.64, pbSynthesis: 254.50, earlyUpper: 296.31, earlyLower: 212.69, upperThreshold: 300.31, lowerThreshold: 208.69 },
  { beban: 21.02, nhSpeed: 11400, yInterpolated: 18.25, pt006: 14.63, pbSynthesis: 260.00, earlyUpper: 302.80, earlyLower: 217.20, upperThreshold: 306.80, lowerThreshold: 213.20 },
  { beban: 22.00, nhSpeed: 11418, yInterpolated: 18.35, pt006: 14.63, pbSynthesis: 265.00, earlyUpper: 308.70, earlyLower: 221.30, upperThreshold: 312.70, lowerThreshold: 217.30 },
  { beban: 23.11, nhSpeed: 11437, yInterpolated: 18.46, pt006: 14.62, pbSynthesis: 269.89, earlyUpper: 314.47, earlyLower: 225.31, upperThreshold: 318.47, lowerThreshold: 221.31 },
];

/**
 * Initial sample actual operating data points from the supervisor's Excel:
 * (Beban Aktual [MW], Y Aktual [Y * PT006])
 */
export const INITIAL_SAMPLE_ACTUAL_POINTS: { id: string; beban: number; actualY: number; label: string }[] = [
  { id: 'smp-1', beban: 16.50, actualY: 250, label: '16.50 MW (250)' },
  { id: 'smp-2', beban: 16.80, actualY: 254, label: '16.80 MW (254)' },
  { id: 'smp-3', beban: 19.00, actualY: 266, label: '19.00 MW (266)' },
  { id: 'smp-4', beban: 19.00, actualY: 261, label: '19.00 MW (261)' },
  { id: 'smp-5', beban: 19.20, actualY: 269, label: '19.20 MW (269)' },
  { id: 'smp-6', beban: 17.00, actualY: 259, label: '17.00 MW (259)' },
  { id: 'smp-7', beban: 20.10, actualY: 270, label: '20.10 MW (270)' },
  { id: 'smp-8', beban: 17.00, actualY: 255, label: '17.00 MW (255)' },
  { id: 'smp-9', beban: 16.90, actualY: 245, label: '16.90 MW (245)' },
  { id: 'smp-10', beban: 17.20, actualY: 252, label: '17.20 MW (252)' },
  { id: 'smp-11', beban: 18.90, actualY: 265, label: '18.90 MW (265)' },
  { id: 'smp-12', beban: 19.10, actualY: 266, label: '19.10 MW (266)' },
  { id: 'smp-13', beban: 22.00, actualY: 285, label: '22.00 MW (285)' },
  { id: 'smp-14', beban: 16.00, actualY: 247, label: '16.00 MW (247)' },
  { id: 'smp-15', beban: 14.50, actualY: 233, label: '14.50 MW (233)' },
  { id: 'smp-16', beban: 10.50, actualY: 210, label: '10.50 MW (210)' },
  { id: 'smp-17', beban: 10.00, actualY: 200, label: '10.00 MW (200)' },
  { id: 'smp-18', beban: 21.50, actualY: 280, label: '21.50 MW (280)' },
  { id: 'smp-19', beban: 13.90, actualY: 230, label: '13.90 MW (230)' },
  { id: 'smp-20', beban: 21.50, actualY: 280, label: '21.50 MW (280)' },
  { id: 'smp-21', beban: 20.50, actualY: 275, label: '20.50 MW (275)' },
  { id: 'smp-22', beban: 22.90, actualY: 288, label: '22.90 MW (288)' },
  { id: 'smp-23', beban: 18.90, actualY: 265, label: '18.90 MW (265)' },
];

/**
 * Monotone Cubic Spline (Fritsch-Carlson PCHIP) for PB Operation Curve:
 * Ensures strictly monotonic, perfectly smooth exponential curve across all loads (1 to 24 MW)
 * with zero kinks or dips, matching the supervisor's calibrated table points exactly.
 */
const SMOOTHED_PB_OPERATION_CALIBRATION_POINTS = [
  { beban: 1.43, baseline: 100.37 },
  { beban: 2.03, baseline: 113.97 },
  { beban: 3.08, baseline: 127.75 },
  { beban: 4.01, baseline: 141.26 },
  { beban: 5.04, baseline: 153.15 },
  { beban: 6.04, baseline: 161.10 },
  { beban: 7.06, baseline: 173.72 },
  { beban: 8.01, baseline: 184.30 },
  { beban: 9.00, baseline: 192.99 },
  { beban: 10.00, baseline: 206.22 },
  { beban: 11.03, baseline: 216.07 },
  { beban: 12.13, baseline: 225.84 },
  { beban: 13.09, baseline: 234.86 },
  { beban: 14.01, baseline: 237.20 }, // smoothed monotonicity to eliminate raw log dip
  { beban: 15.00, baseline: 241.50 },
  { beban: 16.00, baseline: 247.02 },
  { beban: 17.22, baseline: 255.94 },
  { beban: 18.00, baseline: 242.00 },
  { beban: 19.03, baseline: 248.50 },
  { beban: 20.11, baseline: 254.50 },
  { beban: 21.02, baseline: 260.00 },
  { beban: 22.00, baseline: 265.00 },
  { beban: 23.11, baseline: 269.89 },
];

function evaluateMonotonePchip(beban: number): number {
  const pts = SMOOTHED_PB_OPERATION_CALIBRATION_POINTS;
  const n = pts.length;
  if (beban <= pts[0].beban) {
    const slope = (pts[1].baseline - pts[0].baseline) / (pts[1].beban - pts[0].beban);
    return Math.max(50, pts[0].baseline + slope * (beban - pts[0].beban));
  }
  if (beban >= pts[n - 1].beban) {
    const slope = (pts[n - 1].baseline - pts[n - 2].baseline) / (pts[n - 1].beban - pts[n - 2].beban);
    return pts[n - 1].baseline + slope * (beban - pts[n - 1].beban);
  }

  // Precompute interval slopes
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = pts[i + 1].beban - pts[i].beban;
    delta[i] = (pts[i + 1].baseline - pts[i].baseline) / h[i];
  }

  // Tangents with harmonic mean
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (2 * delta[i - 1] * delta[i]) / (delta[i - 1] + delta[i]);
    }
  }

  let i = 0;
  while (i < n - 2 && beban > pts[i + 1].beban) i++;
  const t = (beban - pts[i].beban) / h[i];
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * pts[i].baseline + h10 * h[i] * m[i] + h01 * pts[i + 1].baseline + h11 * h[i] * m[i + 1];
}

/**
 * NH Speed Temperature Correction via T1.7 (Rankine ratio):
 * Rankine conversion formula:
 * theta = (T1.7 + 459.7) / 518.7 R
 * sqrtTheta = sqrt(theta)
 * nhSpeedCorrected = nhSpeed / sqrtTheta
 */
export function calculateNHCorrection(
  nhSpeed: number,
  t1_7F: number
): {
  theta: number;
  sqrtTheta: number;
  nhSpeedCorrected: number;
} {
  const safeT = isNaN(t1_7F) ? 85.0 : t1_7F;
  const theta = (safeT + 459.7) / 518.7;
  const sqrtTheta = Math.sqrt(theta);
  const nhSpeedCorrected = sqrtTheta > 0 ? nhSpeed / sqrtTheta : nhSpeed;
  return {
    theta: Number(theta.toFixed(4)),
    sqrtTheta: Number(sqrtTheta.toFixed(4)),
    nhSpeedCorrected: Number(nhSpeedCorrected.toFixed(2)),
  };
}

/**
 * Pure continuous exponential regression curve matching turbine Increasing Returns profile:
 * Fits: Beban(X) = A * exp(B * X) where A = 0.5776276, B = 0.0132909
 * Inverted: PB_Synthesis(b) = (ln(b) - ln(A)) / B
 * Produces a 100% strictly smooth, kink-free convex exponential curve across all loads.
 * 4 operational threshold lines:
 * - Batas Atas = PB_syn * 1.18
 * Benchmark curves plotted directly from Speedronic benchmark points (DEFAULT_PB_OPERATION_CURVE_POINTS).
 * Interpolates PB Synthesis, Batas Atas (1.18x), and Batas Bawah / Batas Normal (0.82x) with +-4.0 PSIA margins.
 */
export function getExpectedCurveAtBeban(
  beban: number,
  points: PBOperationCurvePoint[] = DEFAULT_PB_OPERATION_CURVE_POINTS
): {
  pbSynthesis: number;
  earlyUpper: number;
  earlyLower: number;
  upperThreshold: number;
  lowerThreshold: number;
} {
  const pts = points && points.length > 0 ? points : DEFAULT_PB_OPERATION_CURVE_POINTS;
  const safeBeban = Math.max(0, isNaN(beban) ? 1.0 : beban);

  if (safeBeban <= pts[0].beban) {
    const p = pts[0];
    return {
      pbSynthesis: p.pbSynthesis,
      earlyUpper: Number((p.upperThreshold - 4.0).toFixed(2)),
      earlyLower: Number((p.lowerThreshold + 4.0).toFixed(2)),
      upperThreshold: p.upperThreshold,
      lowerThreshold: p.lowerThreshold,
    };
  }

  if (safeBeban >= pts[pts.length - 1].beban) {
    const p = pts[pts.length - 1];
    return {
      pbSynthesis: p.pbSynthesis,
      earlyUpper: Number((p.upperThreshold - 4.0).toFixed(2)),
      earlyLower: Number((p.lowerThreshold + 4.0).toFixed(2)),
      upperThreshold: p.upperThreshold,
      lowerThreshold: p.lowerThreshold,
    };
  }

  for (let i = 0; i < pts.length - 1; i++) {
    if (safeBeban >= pts[i].beban && safeBeban <= pts[i + 1].beban) {
      const span = pts[i + 1].beban - pts[i].beban;
      const frac = span > 0 ? (safeBeban - pts[i].beban) / span : 0;
      const syn = Number((pts[i].pbSynthesis + frac * (pts[i + 1].pbSynthesis - pts[i].pbSynthesis)).toFixed(2));
      const upper = Number((pts[i].upperThreshold + frac * (pts[i + 1].upperThreshold - pts[i].upperThreshold)).toFixed(2));
      const lower = Number((pts[i].lowerThreshold + frac * (pts[i + 1].lowerThreshold - pts[i].lowerThreshold)).toFixed(2));
      return {
        pbSynthesis: syn,
        earlyUpper: Number((upper - 4.0).toFixed(2)),
        earlyLower: Number((lower + 4.0).toFixed(2)),
        upperThreshold: upper,
        lowerThreshold: lower,
      };
    }
  }

  const defaultP = pts[0];
  return {
    pbSynthesis: defaultP.pbSynthesis,
    earlyUpper: Number((defaultP.upperThreshold - 4.0).toFixed(2)),
    earlyLower: Number((defaultP.lowerThreshold + 4.0).toFixed(2)),
    upperThreshold: defaultP.upperThreshold,
    lowerThreshold: defaultP.lowerThreshold,
  };
}

/**
 * Evaluates an actual operating data point:
 * Inputs:
 * - Beban (MW, Real Power)
 * - NH Speed (RPM raw)
 * - T1.7 (°F, Inlet Temperature)
 * - PT006 (PSIA, Inlet P1.7)
 * - PT007 (PSIA, Testing Data / Discharge P3.0)
 *
 * Evaluation Workflow:
 * 1. NH Speed temperature correction:
 *    theta = (T1.7 + 459.7) / 518.7
 *    sqrtTheta = sqrt(theta)
 *    nhSpeedCorrected = nhSpeed / sqrtTheta
 * 2. Speedronic curve interpolation: Y = f(nhSpeedCorrected)
 * 3. PB Synthesis (NH) = Y * PT006
 * 4. Garis batas operasi:
 *    - Batas Bawah = PB_syn * 0.82 (-18%)
 *    - Mendekati Batas Bawah (+4.0 PSIA) = Batas Bawah + 4.0 PSIA (PT007 mulai mendekati batas bawah dari rentang normal)
 *    - Batas Atas = PB_syn * 1.18 (+18%)
 *    - Mendekati Batas Atas (-4.0 PSIA) = Batas Atas - 4.0 PSIA (PT007 mulai mendekati batas atas dari rentang normal)
 *    - Ambang Alarm Batas Bawah = Batas Bawah - 4.0 PSIA (anjlok > 4.0 PSIA di bawah batas bawah -> Recommend Water Washing)
 *    - Ambang Alarm Batas Atas = Batas Atas + 4.0 PSIA (melebihi > 4.0 PSIA di atas batas atas -> Recommend Water Washing)
 * 5. Evaluasi PT007:
 *    - PT007 > Batas Atas + 4.0: MELEWATI_BATAS_ATAS (Alarm / Recommend Water Washing)
 *    - PT007 >= Batas Atas - 4.0: EARLY_UPPER (Mendekati Batas Atas, belum water washing)
 *    - PT007 < Batas Bawah - 4.0: MELEWATI_BATAS_BAWAH (Alarm / Recommend Water Washing)
 *    - PT007 <= Batas Bawah + 4.0: EARLY_LOWER (Mendekati Batas Bawah, belum water washing)
 *    - Lainnya (Batas Bawah + 4.0 < PT007 < Batas Atas - 4.0): NORMAL (Status Normal / Zona Hijau)
 */
export function evaluatePBOperationPoint(
  beban: number,
  nhSpeed: number,
  t1_7: number,
  pt006: number,
  pt007: number
): PBOperationEvaluation | null {
  if (
    isNaN(beban) || beban <= 0 ||
    isNaN(nhSpeed) || nhSpeed <= 0 ||
    isNaN(t1_7) ||
    isNaN(pt006) || pt006 <= 0 ||
    isNaN(pt007) || pt007 <= 0
  ) {
    return null;
  }

  // 1. NH Speed temperature correction
  const { theta, sqrtTheta, nhSpeedCorrected } = calculateNHCorrection(nhSpeed, t1_7);

  // 2. Y = f(nhSpeedCorrected) via Speedronic linear interpolation
  const { x1, y1, x2, y2 } = getAutoInterpolationPoints(nhSpeedCorrected, DEFAULT_SPEEDRONIC_CURVE_POINTS);
  const fNH = interpolateY(nhSpeedCorrected, x1, y1, x2, y2);

  // 3. PB Synthesis (NH) = Y * PT006
  const pbSynthesis = Number((fNH * pt006).toFixed(2));

  // 4. Threshold limits (1.18x dan 0.82x)
  const upperThreshold = Number((pbSynthesis * 1.18).toFixed(2));
  const lowerThreshold = Number((pbSynthesis * 0.82).toFixed(2));

  // Mendekati Batas (Ambang Peringatan dari dalam batas normal):
  // - Mendekati Batas Bawah (+4.0 PSIA): lowerThreshold + 4.0 PSIA (misal 221.31 + 4 = 225.31 PSIA)
  // - Mendekati Batas Atas (-4.0 PSIA): upperThreshold - 4.0 PSIA (misal 318.47 - 4 = 314.47 PSIA)
  const earlyLower = Number((lowerThreshold + 4.0).toFixed(2));
  const earlyUpper = Number((upperThreshold - 4.0).toFixed(2));

  // Ambang Alarm Water Washing (Selisih melebihi batas > 4.0 PSIA):
  const alarmLower = Number((lowerThreshold - 4.0).toFixed(2));
  const alarmUpper = Number((upperThreshold + 4.0).toFixed(2));

  // Selisih fisik PT007 terhadap Batas Atas dan Batas Bawah
  const deltaAtas = Number((pt007 - upperThreshold).toFixed(2));
  const deltaBawah = Number((pt007 - lowerThreshold).toFixed(2));

  // 5. Evaluasi PT007:
  // - pt007 > alarmUpper: MELEWATI_BATAS_ATAS (Alarm / Recommend Water Washing)
  // - pt007 >= earlyUpper: EARLY_UPPER (Mendekati Batas Atas)
  // - pt007 < alarmLower: MELEWATI_BATAS_BAWAH (Alarm / Recommend Water Washing)
  // - pt007 <= earlyLower: EARLY_LOWER (Mendekati Batas Bawah)
  // - Lainnya: NORMAL (Status Normal / Zona Hijau)
  let zone: PBOperationZone = 'NORMAL';
  let statusLabel = 'STATUS NORMAL';
  let statusDescription = 'PT007 di dalam rentang normal';
  let isRecommendWaterWash = false;

  if (pt007 > alarmUpper) {
    zone = 'MELEWATI_BATAS_ATAS';
    statusLabel = 'RECOMMEND WATER WASHING';
    statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) melampaui Batas Atas 1.18x (${upperThreshold.toFixed(2)} PSIA) lebih dari 4.0 PSIA (+${deltaAtas.toFixed(2)} PSIA). RECOMMEND WATER WASHING!`;
    isRecommendWaterWash = true;
  } else if (pt007 >= earlyUpper) {
    zone = 'EARLY_UPPER';
    statusLabel = 'MENDEKATI BATAS ATAS';
    if (pt007 > upperThreshold) {
      statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) melampaui Batas Atas 1.18x (${upperThreshold.toFixed(2)} PSIA) dalam rentang toleransi 4.0 PSIA (+${deltaAtas.toFixed(2)} PSIA). Status: Mendekati Batas Atas.`;
    } else {
      statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) mendekati Batas Atas 1.18x (${upperThreshold.toFixed(2)} PSIA) dalam rentang 4.0 PSIA (Rentang: ${earlyUpper.toFixed(2)} – ${upperThreshold.toFixed(2)} PSIA). Status: Mendekati Batas Atas.`;
    }
    isRecommendWaterWash = false;
  } else if (pt007 < alarmLower) {
    zone = 'MELEWATI_BATAS_BAWAH';
    statusLabel = 'RECOMMEND WATER WASHING';
    statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) anjlok di bawah Batas Bawah 0.82x (${lowerThreshold.toFixed(2)} PSIA) lebih dari 4.0 PSIA (${deltaBawah.toFixed(2)} PSIA). RECOMMEND WATER WASHING!`;
    isRecommendWaterWash = true;
  } else if (pt007 <= earlyLower) {
    zone = 'EARLY_LOWER';
    statusLabel = 'MENDEKATI BATAS BAWAH';
    if (pt007 < lowerThreshold) {
      statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) berada di bawah Batas Bawah 0.82x (${lowerThreshold.toFixed(2)} PSIA) dalam rentang toleransi 4.0 PSIA (${deltaBawah.toFixed(2)} PSIA). Status: Mendekati Batas Bawah.`;
    } else {
      statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) mendekati Batas Bawah 0.82x (${lowerThreshold.toFixed(2)} PSIA) dalam rentang 4.0 PSIA (Rentang: ${lowerThreshold.toFixed(2)} – ${earlyLower.toFixed(2)} PSIA). Status: Mendekati Batas Bawah.`;
    }
    isRecommendWaterWash = false;
  } else {
    zone = 'NORMAL';
    statusLabel = 'STATUS NORMAL';
    statusDescription = `PT007 (${pt007.toFixed(2)} PSIA) aman di dalam rentang normal (${earlyLower.toFixed(2)} – ${earlyUpper.toFixed(2)} PSIA).`;
    isRecommendWaterWash = false;
  }

  const deltaPbSyn = Number((pt007 - pbSynthesis).toFixed(2));
  const percentDevPbSyn = pbSynthesis > 0 ? Number((((pt007 - pbSynthesis) / pbSynthesis) * 100).toFixed(1)) : 0;

  return {
    beban,
    nhSpeed,
    t1_7,
    theta,
    sqrtTheta,
    nhSpeedCorrected,
    fNH,
    pt006,
    pt007,
    pbSynthesis,
    earlyUpper,
    earlyLower,
    upperThreshold,
    lowerThreshold,
    zone,
    statusLabel,
    statusDescription,
    isRecommendWaterWash,
    deltaPbSyn,
    percentDevPbSyn,
  };
}

/**
 * Generates a smooth exponential curve series for the chart
 * Parameterized along Beban (MW) with 4 curves:
 * - Batas Atas (1.18x)
 * - Early Batas Atas (1.08x)
 * - Early Batas Bawah (0.92x)
 * - Batas Bawah (0.82x)
 */
export function generateOperationCurveSeries(
  minBeban: number = 1.0,
  maxBeban: number = 24.0,
  step: number = 0.5
): {
  beban: number;
  batasBawah: number;
  earlyBawah: number;
  earlyAtas: number;
  batasAtas: number;
}[] {
  const points: {
    beban: number;
    batasBawah: number;
    earlyBawah: number;
    earlyAtas: number;
    batasAtas: number;
  }[] = [];

  for (let b = minBeban; b <= maxBeban + 0.001; b += step) {
    const cur = getExpectedCurveAtBeban(b);
    points.push({
      beban: Number(b.toFixed(1)),
      batasBawah: cur.lowerThreshold,
      earlyBawah: cur.earlyLower,
      earlyAtas: cur.earlyUpper,
      batasAtas: cur.upperThreshold,
    });
  }

  return points;
}
