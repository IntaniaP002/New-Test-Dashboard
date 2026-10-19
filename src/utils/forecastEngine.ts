/**
 * Water Washing Early Warning Linear Regression Forecasting Engine
 * 
 * Strict Engineering Compliance with User Requirements:
 * 1. Data to use: Daily data from the "Input History" table.
 * 2. Dynamic daily deterioration:
 *    - PR deterioration (%) = (Baseline PR - Daily PR) / Baseline PR * 100
 *    - P3.0 deterioration (%) = (Baseline P3.0 - Daily P3.0) / Baseline P3.0 * 100
 *    - Real Power deterioration (%) = (Baseline Real Power - Daily Real Power) / Baseline Real Power * 100
 *    - NPHR deterioration (%) = (Daily NPHR - Baseline NPHR) / Baseline NPHR * 100
 * 3. Uses CURRENT Water Washing cycle data only (not combining previous WW cycles).
 * 4. Dates converted to elapsed calendar days from baseline date: Day 0, Day 1, Day 2, etc.
 * 5. Linear regression trend: D(t) = a + b * t
 * 6. Fixed thresholds: PR = 2.5%, P3.0 = 2.5%, NPHR = 3.0%, Real Power = 4.0%.
 * 7. Days to threshold: Remaining / Slope (when Remaining > 0 and Slope > 0).
 * 8. Status = "THRESHOLD REACHED" if Current deterioration >= Threshold.
 * 9. Status = "NO PROJECTED THRESHOLD CROSSING" if Slope <= 0.
 * 10. Status = "INSUFFICIENT DATA" if fewer than 7 valid daily observations in current cycle.
 * 11. Identifies the nearest projected threshold.
 * 12. Continuous recalculation as weekly/daily data is added to Input History.
 */

import {
  BaselineConfig,
  DailyRepresentativeRecord,
  ForecastParameter,
  OperationalInput,
  OperationalRecord,
  OverallForecastSummary,
  ParameterForecast,
  ThreeDayProjectionPoint,
  ThreeDayProjectionSummary,
  ThresholdConfig,
  WaterWashForecastStatus,
} from '../types';
import {
  FIXED_FORECAST_THRESHOLDS,
  INDICATOR_WEIGHTS,
  WATER_WASH_DECISION_RULES,
} from '../data/initialData';
import { checkWaterWashRecommendCondition } from './calculations';

/**
 * Minimum valid daily observations required in current cycle to perform regression
 */
export const MIN_FORECAST_OBSERVATIONS = 7;

/**
 * Operating Hours / Running Hours assumption per day.
 * Supervisor guidance: GT operates ~4 running hours per day.
 */
export const DEFAULT_RUNNING_HOURS_PER_DAY = 4;

/**
 * Batas atas (ceiling) hari rekomendasi Water Wash saat mesin berstatus PANTAU / MONITORING.
 * Justifikasi: Siklus rekomendasi Water Wash tercepat berdasarkan data historis adalah 22 hari.
 * Karena dibutuhkan minimal 7 hari observasi data harian untuk membentuk regresi linier,
 * maka batas maksimum jendela toleransi status Pantau adalah:
 * 22 hari (tercepat historis) - 7 hari (observasi awal) = 15 hari.
 */
export const MAX_PANTAU_FORECAST_DAYS = 15;

/**
 * Re-export FIXED Project Forecast Thresholds from the single source of truth
 */
export { FIXED_FORECAST_THRESHOLDS };

/**
 * Calculates median of an array of numbers
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Applies a rolling median filter (default window: 3) to smooth daily time-series deterioration data
 * before linear regression fitting.
 * For window = 3:
 * - At index 0: median of available points [0, 1]
 * - At index i (1 to n-2): median of 3-point centered window [i-1, i, i+1]
 * - At index n-1: median of available points [n-2, n-1]
 * Filters out high-frequency noise and single-day spikes without introducing phase lag.
 */
export function applyRollingMedian(
  points: { t: number; value: number }[],
  windowSize: number = 3
): { t: number; value: number }[] {
  if (points.length <= 2 || windowSize <= 1) {
    return points.map((p) => ({ ...p }));
  }

  const half = Math.floor(windowSize / 2);

  return points.map((p, idx) => {
    const start = Math.max(0, idx - half);
    const end = Math.min(points.length, idx + half + 1);
    const windowVals = points.slice(start, end).map((pt) => pt.value);
    const smoothed = calculateMedian(windowVals);
    return {
      t: p.t,
      value: Number(smoothed.toFixed(4)),
    };
  });
}

/**
 * Calculates parameter deterioration (%) relative to the active baseline.
 * PR deterioration (%) = ((Baseline PR - Daily PR) / Baseline PR) * 100
 * P3.0 deterioration (%) = ((Baseline P3.0 - Daily P3.0) / Baseline P3.0) * 100
 * Real Power deterioration (%) = ((Baseline Real Power - Daily Real Power) / Baseline Real Power) * 100
 * NPHR deterioration (%) = ((Daily NPHR - Baseline NPHR) / Baseline NPHR) * 100
 * 
 * Positive value means deterioration. Negative value means improvement.
 */
export function calculateDailyParameterDeterioration(
  param: ForecastParameter,
  record: OperationalRecord,
  baseline: BaselineConfig
): number | null {
  if (!baseline.isConfigured) return null;

  switch (param) {
    case 'PR': {
      const dailyPR = record.pr ?? (record.P1_7 > 0 ? record.P3_0 / record.P1_7 : null);
      const basePR =
        baseline.PR ?? (baseline.P1_7 && baseline.P1_7 > 0 ? baseline.P3_0 / baseline.P1_7 : null);
      if (!basePR || basePR <= 0 || dailyPR === null || dailyPR <= 0) return null;
      return Number((((basePR - dailyPR) / basePR) * 100).toFixed(4));
    }
    case 'P3_0': {
      const dailyP3 = record.P3_0;
      const baseP3 = baseline.P3_0;
      if (!baseP3 || baseP3 <= 0 || !dailyP3 || dailyP3 <= 0) return null;
      return Number((((baseP3 - dailyP3) / baseP3) * 100).toFixed(4));
    }
    case 'realPower': {
      const dailyPower = record.realPower;
      const basePower = baseline.realPower;
      if (!basePower || basePower <= 0 || !dailyPower || dailyPower <= 0) return null;
      return Number((((basePower - dailyPower) / basePower) * 100).toFixed(4));
    }
    case 'NPHR': {
      const dailyNphr = record.nphr;
      const baseNphr = baseline.nphr;
      if (!baseNphr || baseNphr <= 0 || !dailyNphr || dailyNphr <= 0) return null;
      return Number((((dailyNphr - baseNphr) / baseNphr) * 100).toFixed(4));
    }
  }
}

/**
 * Isolates the records belonging to the CURRENT Water Washing cycle or the NEWEST DATA from the Input History table.
 * Does NOT combine data from previous Water Washing cycles into the current regression.
 */
export function getCurrentWaterWashCycleRecords(
  records: OperationalRecord[],
  baseline: BaselineConfig,
  scope: 'cycle' | 'newest' = 'cycle'
): {
  cycleRecords: OperationalRecord[];
  cycleStartDate: string | null;
  baselineDate: string | null;
} {
  if (records.length === 0) {
    return { cycleRecords: [], cycleStartDate: null, baselineDate: null };
  }

  // Sort records chronologically
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

  // If scope is 'newest': extract the newest consecutive input cluster from Input History
  if (scope === 'newest') {
    let clusterStartIndex = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prevD = new Date(sorted[i - 1].date + 'T00:00:00').getTime();
      const currD = new Date(sorted[i].date + 'T00:00:00').getTime();
      const diffDays = Math.round((currD - prevD) / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        clusterStartIndex = i;
      }
    }
    const cycleRecords = sorted.slice(clusterStartIndex);
    const cycleStartDate = cycleRecords[0]?.date ?? null;
    return {
      cycleRecords,
      cycleStartDate,
      baselineDate: cycleStartDate,
    };
  }

  // Standard: current cycle since active baseline date
  const baselineDate = baseline.isConfigured && baseline.date ? baseline.date : null;

  let cycleStartDate: string | null = null;

  if (baselineDate) {
    // If a baseline is configured, count from the chosen baseline date
    cycleStartDate = baselineDate;
  } else {
    // Fallback: use latest Water Wash event in dataset, or the first record date
    const lastWW = [...sorted].reverse().find((r) => r.isWaterWashEvent);
    if (lastWW) {
      cycleStartDate = lastWW.date;
    } else {
      cycleStartDate = sorted[0]?.date ?? null;
    }
  }

  // Extract all daily observations belonging to this current cycle (from chosen baseline date onwards)
  const cycleRecords = cycleStartDate ? sorted.filter((r) => r.date >= cycleStartDate!) : sorted;

  return {
    cycleRecords,
    cycleStartDate,
    baselineDate,
  };
}

/**
 * Calculates elapsed calendar days from the baseline date.
 * Baseline date = Day 0
 * Next valid date = Day 1, Day 2, Day 3, etc.
 * Uses elapsed days as the independent variable for the forecast calculation.
 */
export function getElapsedDays(recordDate: string, baselineDate: string): number {
  const dBase = new Date(baselineDate + 'T00:00:00');
  const dRec = new Date(recordDate + 'T00:00:00');
  return Math.round((dRec.getTime() - dBase.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Standard Ordinary Least Squares (OLS) Linear Regression:
 * D(t) = a + b * t
 * t = elapsed days since baseline (0, 1, 2, ...)
 * value = deterioration (%)
 */
export function calculateLinearRegression(
  points: { t: number; value: number }[]
): {
  slope: number;
  intercept: number;
  rSquared: number;
} | null {
  const n = points.length;
  if (n < 2) return null;

  let sumT = 0;
  let sumD = 0;
  let sumTD = 0;
  let sumT2 = 0;
  let sumD2 = 0;

  for (const p of points) {
    sumT += p.t;
    sumD += p.value;
    sumTD += p.t * p.value;
    sumT2 += p.t * p.t;
    sumD2 += p.value * p.value;
  }

  const denominator = n * sumT2 - sumT * sumT;
  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const slope = (n * sumTD - sumT * sumD) / denominator;
  const intercept = (sumD - slope * sumT) / n;

  // Goodness of fit R^2
  const meanD = sumD / n;
  let ssTot = 0;
  let ssRes = 0;

  for (const p of points) {
    const fitted = slope * p.t + intercept;
    ssTot += Math.pow(p.value - meanD, 2);
    ssRes += Math.pow(p.value - fitted, 2);
  }

  const rSquared = ssTot > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

  return {
    slope,
    intercept,
    rSquared,
  };
}

/**
 * Calculates forecast for an individual parameter using daily data from the current cycle.
 */
export function calculateParameterForecast(
  param: ForecastParameter,
  displayName: string,
  unit: string,
  threshold: number,
  cycleRecords: OperationalRecord[],
  baseline: BaselineConfig,
  baseDate: string
): ParameterForecast {
  // Extract non-null points from the current cycle
  const validPoints: { date: string; t: number; value: number }[] = [];

  for (const rec of cycleRecords) {
    const val = calculateDailyParameterDeterioration(param, rec, baseline);
    if (val !== null && !isNaN(val)) {
      const t = getElapsedDays(rec.date, baseDate);
      validPoints.push({
        date: rec.date,
        t,
        value: val,
      });
    }
  }

  // Sort by elapsed days ascending
  validPoints.sort((a, b) => a.t - b.t);

  if (!baseline.isConfigured) {
    return {
      parameter: param,
      displayName,
      unit,
      currentDeterioration: null,
      threshold,
      remainingDeterioration: null,
      isAvailable: false,
      unavailableReason: 'Active baseline reference is not configured.',
      validDaysCount: 0,
      slope: null,
      intercept: null,
      rSquared: null,
      daysToThreshold: null,
      estimatedDate: null,
      status: 'INSUFFICIENT DATA',
    };
  }

  if (validPoints.length === 0) {
    return {
      parameter: param,
      displayName,
      unit,
      currentDeterioration: null,
      threshold,
      remainingDeterioration: null,
      isAvailable: false,
      unavailableReason: 'No valid daily records in current Water Washing cycle.',
      validDaysCount: 0,
      slope: null,
      intercept: null,
      rSquared: null,
      daysToThreshold: null,
      estimatedDate: null,
      status: 'INSUFFICIENT DATA',
    };
  }

  // 1. Get the latest valid daily deterioration from Input History (raw point)
  const latestPoint = validPoints[validPoints.length - 1];
  const currentDet = Number(latestPoint.value.toFixed(2));

  // 8. If raw Current deterioration >= Threshold:
  // Do NOT calculate days remaining.
  // Display: "THRESHOLD REACHED". Do not display a future forecast date.
  if (currentDet >= threshold) {
    return {
      parameter: param,
      displayName,
      unit,
      currentDeterioration: currentDet,
      currentFitted: null,
      threshold,
      remainingDeterioration: 0,
      isAvailable: true,
      validDaysCount: validPoints.length,
      slope: null,
      intercept: null,
      rSquared: null,
      daysToThreshold: null,
      exactDaysToThreshold: null,
      hoursToThreshold: 0,
      exactHoursToThreshold: 0,
      slopePerHour: null,
      estimatedDate: null,
      status: 'THRESHOLD REACHED',
      elapsedDaysData: validPoints.map((p) => ({
        date: p.date,
        elapsedDays: p.t,
        deterioration: p.value,
        fitted: null,
      })),
    };
  }

  // 10. Minimum Data: at least 7 valid daily observations in current cycle
  if (validPoints.length < MIN_FORECAST_OBSERVATIONS) {
    const rawRemaining = Number((threshold - currentDet).toFixed(2));
    return {
      parameter: param,
      displayName,
      unit,
      currentDeterioration: currentDet,
      currentFitted: null,
      threshold,
      remainingDeterioration: rawRemaining,
      isAvailable: false,
      unavailableReason: `Forecast unavailable — insufficient daily observations (minimum ${MIN_FORECAST_OBSERVATIONS} days required in current cycle).`,
      validDaysCount: validPoints.length,
      slope: null,
      intercept: null,
      rSquared: null,
      daysToThreshold: null,
      estimatedDate: null,
      status: 'INSUFFICIENT DATA',
      elapsedDaysData: validPoints.map((p) => ({
        date: p.date,
        elapsedDays: p.t,
        deterioration: p.value,
        fitted: null,
      })),
    };
  }

  // 5. Haluskan data sebelum diregresi (rolling median 3-hari)
  // Menghaluskan fluktuasi harian dan memfilter outlier sesaat sebelum regresi
  const smoothedPoints = applyRollingMedian(
    validPoints.map((p) => ({ t: p.t, value: p.value })),
    3
  );

  // Fit linear regression: D(t) = a + b * t menggunakan data hasil rolling median
  const regResult = calculateLinearRegression(smoothedPoints);

  if (!regResult) {
    const rawRemaining = Number((threshold - currentDet).toFixed(2));
    return {
      parameter: param,
      displayName,
      unit,
      currentDeterioration: currentDet,
      currentFitted: null,
      threshold,
      remainingDeterioration: rawRemaining,
      isAvailable: false,
      unavailableReason: 'Could not calculate linear regression trend.',
      validDaysCount: validPoints.length,
      slope: null,
      intercept: null,
      rSquared: null,
      daysToThreshold: null,
      estimatedDate: null,
      status: 'INSUFFICIENT DATA',
      elapsedDaysData: validPoints.map((p) => ({
        date: p.date,
        elapsedDays: p.t,
        deterioration: p.value,
        fitted: null,
      })),
    };
  }

  const slope = Number(regResult.slope.toFixed(4));
  const intercept = Number(regResult.intercept.toFixed(4));
  const rSquared = Number(regResult.rSquared.toFixed(3));

  // Ambil nilai fitted di elapsed-day hari terakhir untuk analisis tren:
  const t_latest = latestPoint.t;
  const currentFitted = Number((intercept + slope * t_latest).toFixed(2));
  
  // Sisa toleransi dihitung konsisten dari pembacaan deteriorasi aktual saat ini:
  // remainingDeterioration = threshold - currentDet
  // Karena currentDet < threshold (sudah lolos guard step 8), remainingDet selalu > 0.
  const remainingDet = Number((threshold - currentDet).toFixed(2));

  // Data mentah tetap disimpan apa adanya di elapsedDaysData (deterioration: p.value)
  // agar grafik dan tabel Input History tidak berubah tampilannya
  const elapsedDaysData = validPoints.map((p, idx) => ({
    date: p.date,
    elapsedDays: p.t,
    deterioration: p.value,
    smoothed: smoothedPoints[idx]?.value ?? p.value,
    fitted: Number((slope * p.t + intercept).toFixed(2)),
  }));

  // 9. If trend is not increasing (b <= 0):
  if (slope <= 0) {
    return {
      parameter: param,
      displayName,
      unit,
      currentDeterioration: currentDet,
      currentFitted,
      threshold,
      remainingDeterioration: remainingDet,
      isAvailable: false,
      unavailableReason: 'Forecast unavailable — deterioration trend is not increasing.',
      validDaysCount: validPoints.length,
      slope,
      intercept,
      rSquared,
      daysToThreshold: null,
      estimatedDate: null,
      status: 'NO PROJECTED THRESHOLD CROSSING',
      elapsedDaysData,
    };
  }

  // 7. Days to Threshold = remainingDeterioration / slope
  // Menghitung sisa hari dari titik deteriorasi aktual saat ini menuju ambang batas
  const exactDays = remainingDet / slope;
  const daysToThreshold = Math.max(1, Math.round(exactDays));
  const exactDaysToThreshold = Number(exactDays.toFixed(1));
  const hoursToThreshold = daysToThreshold * DEFAULT_RUNNING_HOURS_PER_DAY;
  const exactHoursToThreshold = Number((exactDays * DEFAULT_RUNNING_HOURS_PER_DAY).toFixed(1));
  const slopePerHour = Number((slope / DEFAULT_RUNNING_HOURS_PER_DAY).toFixed(5));

  // Projected calendar date = Latest Input History Date + Days to Threshold
  const latestDateObj = new Date(latestPoint.date + 'T00:00:00');
  const projDateObj = new Date(latestDateObj);
  projDateObj.setDate(projDateObj.getDate() + daysToThreshold);
  const estimatedDate = projDateObj.toISOString().slice(0, 10);

  return {
    parameter: param,
    displayName,
    unit,
    currentDeterioration: currentDet,
    currentFitted,
    threshold,
    remainingDeterioration: remainingDet,
    isAvailable: true,
    validDaysCount: validPoints.length,
    slope,
    slopePerHour,
    intercept,
    rSquared,
    daysToThreshold,
    exactDaysToThreshold,
    hoursToThreshold,
    exactHoursToThreshold,
    estimatedDate,
    status: 'FORECAST AVAILABLE',
    elapsedDaysData,
  };
}

/**
 * Calculates calendar day difference between two YYYY-MM-DD date strings.
 * Result is positive if toDateStr is in the future relative to fromDateStr.
 */
export function getCalendarDaysBetween(fromDateStr: string, toDateStr: string): number {
  if (!fromDateStr || !toDateStr) return 0;
  const from = new Date(fromDateStr + 'T00:00:00');
  const to = new Date(toDateStr + 'T00:00:00');
  const diffMs = to.getTime() - from.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculates complete forecasting suite across all 4 parameters:
 * 1. PR
 * 2. P3.0
 * 3. NPHR
 * 4. Real Power
 * 
 * Uses the Input History table as the source dataset, isolates the current cycle,
 * fits linear regression on elapsed days, and identifies the nearest threshold.
 * 
 * When referenceDate is provided (or viewing on subsequent calendar dates like 18 September):
 * - Auto-updates remaining days (e.g. 15 days on 17 Sept -> 14 days on 18 Sept).
 * - When threshold condition is met, sets lead-time to 3 days ("3 hari lagi") for preparation.
 */
export function calculateOverallForecast(
  inputHistoryRecords: OperationalRecord[],
  baseline: BaselineConfig,
  _thresholds?: ThresholdConfig,
  scope: 'cycle' | 'newest' = 'cycle',
  referenceDate?: string
): OverallForecastSummary {
  // Use FIXED project thresholds
  const prThresh = FIXED_FORECAST_THRESHOLDS.PR; // 2.5%
  const p3Thresh = FIXED_FORECAST_THRESHOLDS.P3_0; // 2.5%
  const nphrThresh = FIXED_FORECAST_THRESHOLDS.NPHR; // 3.0%
  const powerThresh = FIXED_FORECAST_THRESHOLDS.realPower; // 4.0%

  // 3. Isolate CURRENT Water Washing cycle or newest input data records
  const { cycleRecords, cycleStartDate, baselineDate } = getCurrentWaterWashCycleRecords(
    inputHistoryRecords,
    baseline,
    scope
  );

  const effectiveBaseDate = baselineDate || cycleStartDate || (cycleRecords[0]?.date ?? '');

  const prForecast = calculateParameterForecast(
    'PR',
    'Pressure Ratio (PR)',
    'ratio',
    prThresh,
    cycleRecords,
    baseline,
    effectiveBaseDate
  );

  const p3Forecast = calculateParameterForecast(
    'P3_0',
    'Discharge Pressure (P3.0)',
    'PSIA',
    p3Thresh,
    cycleRecords,
    baseline,
    effectiveBaseDate
  );

  const nphrForecast = calculateParameterForecast(
    'NPHR',
    'Net Plant Heat Rate (NPHR)',
    'kcal/kWh',
    nphrThresh,
    cycleRecords,
    baseline,
    effectiveBaseDate
  );

  const powerForecast = calculateParameterForecast(
    'realPower',
    'Real Power (MW)',
    'MW',
    powerThresh,
    cycleRecords,
    baseline,
    effectiveBaseDate
  );

  const parameters: Record<ForecastParameter, ParameterForecast> = {
    PR: prForecast,
    P3_0: p3Forecast,
    NPHR: nphrForecast,
    realPower: powerForecast,
  };

  // Helper to get parameter forecast for combination calculation:
  // "If a parameter has already reached its threshold, treat its forecast as 0 days for the combination calculation."
  const getParamCombinationDays = (fc: ParameterForecast): number | null => {
    if (fc.status === 'THRESHOLD REACHED') {
      return 0;
    }
    if (fc.status === 'FORECAST AVAILABLE' && fc.daysToThreshold !== null) {
      return fc.daysToThreshold;
    }
    return null; // slope <= 0 or insufficient observations
  };

  const daysPR = getParamCombinationDays(prForecast);
  const daysP3 = getParamCombinationDays(p3Forecast);
  const daysNPHR = getParamCombinationDays(nphrForecast);
  const daysPower = getParamCombinationDays(powerForecast);

  // Sub-clause: MIN(Forecast NPHR, Forecast Real Power) for (NPHR OR Real Power)
  let daysAux: number | null = null;
  if (daysNPHR !== null && daysPower !== null) {
    daysAux = Math.min(daysNPHR, daysPower);
  } else if (daysNPHR !== null) {
    daysAux = daysNPHR;
  } else if (daysPower !== null) {
    daysAux = daysPower;
  } else {
    daysAux = null;
  }

  // Gerbang keputusan AND murni: (jumlah indikator lolos >= 3) DAN (bobot indikator yang lolos >= 80%)
  const prReached = prForecast.status === 'THRESHOLD REACHED';
  const p3Reached = p3Forecast.status === 'THRESHOLD REACHED';
  const nphrReached = nphrForecast.status === 'THRESHOLD REACHED';
  const powerReached = powerForecast.status === 'THRESHOLD REACHED';

  let reachedWeight = 0;
  if (prReached) reachedWeight += INDICATOR_WEIGHTS.pr;
  if (p3Reached) reachedWeight += INDICATOR_WEIGHTS.p3;
  if (nphrReached) reachedWeight += INDICATOR_WEIGHTS.nphr;
  if (powerReached) reachedWeight += INDICATOR_WEIGHTS.power;

  const reachedCount = [prReached, p3Reached, nphrReached, powerReached].filter(Boolean).length;
  // Sinkron dengan gerbang keputusan evaluateOperationalRecord (checkWaterWashRecommendCondition)
  const isConditionSatisfied = checkWaterWashRecommendCondition(reachedCount, reachedWeight);

  // Reached parameters tracking
  const reachedParameters: ForecastParameter[] = [];
  if (prReached) reachedParameters.push('PR');
  if (p3Reached) reachedParameters.push('P3_0');
  if (nphrReached) reachedParameters.push('NPHR');
  if (powerReached) reachedParameters.push('realPower');

  // Overall Forecast WW:
  // Forecast WW = MAX(Forecast PR, Forecast P3.0, MIN(Forecast NPHR, Forecast Real Power))
  // "If only one parameter reaches its threshold, do not show 0 days for the overall Water Washing forecast.
  // The overall status remains Normal until the existing PR AND P3.0 AND (NPHR OR Real Power) condition is satisfied."
  let rawForecastWW: number | null = null;
  let governingParam: ForecastParameter | null = null;

  if (isConditionSatisfied) {
    // Condition is already fully satisfied: rule updated to 3 days lead-time for Water Wash preparation
    rawForecastWW = 3;
    governingParam = null;
  } else if (daysPR !== null && daysP3 !== null && daysAux !== null) {
    rawForecastWW = Math.max(daysPR, daysP3, daysAux);

    // Governing parameter that determined the MAX
    if (rawForecastWW === daysPR) {
      governingParam = 'PR';
    } else if (rawForecastWW === daysP3) {
      governingParam = 'P3_0';
    } else if (daysAux === daysNPHR && daysNPHR !== null) {
      governingParam = 'NPHR';
    } else if (daysAux === daysPower && daysPower !== null) {
      governingParam = 'realPower';
    }
  } else {
    // One or more required conditions will not cross threshold (e.g. slope <= 0 / stable)
    rawForecastWW = null;
    governingParam = null;
  }

  // Deteksi status operasional saat ini (CAUTION / MONITORING vs NORMAL):
  // Saat bobot lolos 50% - 79% (misal PR 30% + P3.0 30% = 60%, atau NPHR early monitoring)
  const latestRecord = cycleRecords[cycleRecords.length - 1];
  const isPantauOperationalState =
    !isConditionSatisfied &&
    (latestRecord?.overallStatus === 'CAUTION' || latestRecord?.overallStatus === 'MONITORING' || reachedWeight >= 50);

  let forecastWW: number | null = rawForecastWW;
  let isPantauCapped = false;
  let pantauExplanation: string | null = null;

  if (!isConditionSatisfied && isPantauOperationalState) {
    // Batas aman jendela pemantauan (Caution Ceiling):
    // Ketika mesin sudah berstatus CAUTION (2 parameter lolos / bobot >= 50%),
    // kondisi mesin sudah mengalami degradasi kritis dan masuk tahap pemantauan ketat.
    // Waktu toleransi pemantauan & persiapan Water Wash dibatasi maksimal MAX_PANTAU_FORECAST_DAYS (15 hari).
    if (rawForecastWW === null || rawForecastWW > MAX_PANTAU_FORECAST_DAYS) {
      forecastWW = MAX_PANTAU_FORECAST_DAYS;
      isPantauCapped = true;
      pantauExplanation = `Dibatasi batas atas Status Caution (Maksimal ${MAX_PANTAU_FORECAST_DAYS} hari, justifikasi: 22 hari tercepat historis - 7 hari observasi regresi). Bobot deteriorasi ${reachedWeight}% (${reachedCount}/4 parameter lolos ambang batas).`;
    }
  }

  // Calculate projected date for Water Wash
  let forecastWWDate: string | null = null;
  const latestDate = cycleRecords[cycleRecords.length - 1]?.date;

  // Active reference date handling (calendar countdown support)
  const todayLocalStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const activeRefDate = referenceDate || (latestDate && todayLocalStr >= latestDate ? todayLocalStr : latestDate);

  if (isConditionSatisfied) {
    // When threshold is reached: 3 days lead-time for Water Wash preparation
    // Find the record date where Water Wash was first recommended/satisfied in this cycle
    let triggerDate = latestDate || todayLocalStr;
    for (const rec of cycleRecords) {
      if (rec.overallStatus === 'RECOMMEND WATER WASH') {
        triggerDate = rec.date;
        break;
      }
    }

    // Anchor target execution date to trigger date + 3 calendar days
    const d = new Date(triggerDate + 'T00:00:00');
    d.setDate(d.getDate() + 3);
    forecastWWDate = d.toISOString().slice(0, 10);

    // Active calendar countdown:
    // If viewing on subsequent days (e.g. triggered 20 Sept -> 21 Sept shows 2 days remaining)
    if (activeRefDate && triggerDate && activeRefDate >= triggerDate) {
      const remainingDays = getCalendarDaysBetween(activeRefDate, forecastWWDate);
      forecastWW = Math.max(0, remainingDays);
    } else {
      forecastWW = 3;
    }
  } else if (forecastWW !== null && forecastWW > 0 && latestDate) {
    // Determine the fixed target date based on latest dataset date + projected days
    const targetObj = new Date(latestDate + 'T00:00:00');
    targetObj.setDate(targetObj.getDate() + (isPantauCapped ? MAX_PANTAU_FORECAST_DAYS : (rawForecastWW || forecastWW)));
    forecastWWDate = targetObj.toISOString().slice(0, 10);

    // Dynamic auto-countdown when viewing on subsequent days (e.g. 17 Sept -> 15 days, 18 Sept -> 14 days)
    if (activeRefDate && latestDate && activeRefDate > latestDate) {
      const remainingDays = getCalendarDaysBetween(activeRefDate, forecastWWDate);
      if (remainingDays <= 3) {
        // Enters 3-day final preparation window
        forecastWW = Math.max(1, remainingDays);
      } else {
        const dynamicRemaining = Math.max(1, remainingDays);
        rawForecastWW = dynamicRemaining;
        forecastWW = isPantauCapped ? Math.min(MAX_PANTAU_FORECAST_DAYS, dynamicRemaining) : dynamicRemaining;
      }

      // Also auto-update each individual parameter's daysToThreshold
      for (const key of ['PR', 'P3_0', 'NPHR', 'realPower'] as const) {
        const pFc = parameters[key];
        if (pFc.status === 'FORECAST AVAILABLE' && pFc.estimatedDate) {
          const pRemaining = getCalendarDaysBetween(activeRefDate, pFc.estimatedDate);
          pFc.daysToThreshold = Math.max(1, pRemaining);
        }
      }
    }
  }

  // Determine overall Water Wash Status
  let waterWashStatus: WaterWashForecastStatus;
  let daysUntilNextWaterWash: number | null = null;

  if (isConditionSatisfied) {
    waterWashStatus = 'DUE_NOW';
    daysUntilNextWaterWash = forecastWW;
  } else if (cycleRecords.length < MIN_FORECAST_OBSERVATIONS) {
    waterWashStatus = 'INSUFFICIENT_DATA';
    daysUntilNextWaterWash = null;
  } else if (forecastWW !== null && forecastWW > 0) {
    waterWashStatus = 'PROJECTED';
    daysUntilNextWaterWash = forecastWW;
  } else {
    waterWashStatus = 'STABLE';
    daysUntilNextWaterWash = null;
  }

  // Nearest individual parameter (for informational reference)
  let nearestParam: ForecastParameter | null = null;
  let minDays = Infinity;
  for (const key of ['PR', 'P3_0', 'NPHR', 'realPower'] as const) {
    const fc = parameters[key];
    if (fc.status === 'FORECAST AVAILABLE' && fc.daysToThreshold !== null && fc.daysToThreshold > 0) {
      if (fc.daysToThreshold < minDays) {
        minDays = fc.daysToThreshold;
        nearestParam = key;
      }
    }
  }

  const hasForecast = forecastWW !== null;
  const forecastRunningHours = forecastWW !== null ? forecastWW * DEFAULT_RUNNING_HOURS_PER_DAY : null;
  const rawForecastRunningHours = rawForecastWW !== null ? rawForecastWW * DEFAULT_RUNNING_HOURS_PER_DAY : null;
  const runningHoursUntilNextWaterWash = daysUntilNextWaterWash !== null ? daysUntilNextWaterWash * DEFAULT_RUNNING_HOURS_PER_DAY : null;

  return {
    hasForecast,
    forecastWW,
    rawForecastWW,
    forecastRunningHours,
    rawForecastRunningHours,
    runningHoursUntilNextWaterWash,
    runningHoursPerDay: DEFAULT_RUNNING_HOURS_PER_DAY,
    isPantauOperationalState,
    isPantauCapped,
    pantauCapDays: MAX_PANTAU_FORECAST_DAYS,
    pantauCapHours: MAX_PANTAU_FORECAST_DAYS * DEFAULT_RUNNING_HOURS_PER_DAY,
    pantauExplanation,
    forecastWWDate,
    governingParameter: governingParam,
    governingDisplayName: governingParam ? parameters[governingParam].displayName : null,
    forecastDaysPR: daysPR,
    forecastDaysP3: daysP3,
    forecastDaysNPHR: daysNPHR,
    forecastDaysPower: daysPower,
    forecastDaysAux: daysAux,
    forecastHoursPR: daysPR !== null ? daysPR * DEFAULT_RUNNING_HOURS_PER_DAY : null,
    forecastHoursP3: daysP3 !== null ? daysP3 * DEFAULT_RUNNING_HOURS_PER_DAY : null,
    forecastHoursNPHR: daysNPHR !== null ? daysNPHR * DEFAULT_RUNNING_HOURS_PER_DAY : null,
    forecastHoursPower: daysPower !== null ? daysPower * DEFAULT_RUNNING_HOURS_PER_DAY : null,
    forecastHoursAux: daysAux !== null ? daysAux * DEFAULT_RUNNING_HOURS_PER_DAY : null,
    isConditionSatisfied,
    nearestParameter: nearestParam,
    nearestDisplayName: nearestParam ? parameters[nearestParam].displayName : null,
    nearestDays: minDays !== Infinity ? minDays : null,
    nearestHours: minDays !== Infinity ? minDays * DEFAULT_RUNNING_HOURS_PER_DAY : null,
    nearestDate: nearestParam ? parameters[nearestParam].estimatedDate : null,
    hasThresholdReached: reachedParameters.length > 0,
    reachedParameters,
    waterWashStatus,
    daysUntilNextWaterWash,
    parameters,
    dailyRecords: cycleRecords,
    cycleStartDate,
    baselineDate,
    dataScope: scope,
  };
}

/**
 * Calculates a forward projection for all 4 parameters (PR, P3.0, NPHR, Real Power).
 * - For DUE_NOW (threshold reached): evaluates a 3-day lead-time window (H+1, H+2, H+3).
 * - For Normal status: evaluates all projected days (e.g. 29 days from H+1 to H+29) matching the estimated countdown.
 */
export function calculateThreeDayProjection(
  parameters: Record<ForecastParameter, ParameterForecast>,
  baseline: BaselineConfig,
  latestRecord?: OperationalRecord,
  startDateStr?: string,
  isConditionSatisfied?: boolean,
  targetDaysCount?: number | null,
  targetDateStr?: string | null
): ThreeDayProjectionSummary {
  const baseDate = startDateStr || latestRecord?.date || new Date().toISOString().slice(0, 10);
  const baseDateObj = new Date(baseDate + 'T00:00:00');

  // If threshold reached: window for WW preparation (max of remaining days, default 3).
  // If Normal status: project full estimated days (e.g. 29 days).
  const count = isConditionSatisfied
    ? Math.max(1, targetDaysCount ?? 3)
    : targetDaysCount && targetDaysCount > 0
    ? Math.min(Math.max(targetDaysCount, 1), 180)
    : 3;

  const offsets = Array.from({ length: count }, (_, i) => i + 1);

  const paramKeys: ForecastParameter[] = ['PR', 'P3_0', 'NPHR', 'realPower'];

  const getParamConfig = (key: ForecastParameter) => {
    switch (key) {
      case 'PR':
        return {
          threshold: FIXED_FORECAST_THRESHOLDS.PR,
          unit: 'ratio',
          baseVal: baseline.PR ?? 10.5,
          defaultSlope: 0.035,
          isHigherDeteriorating: false,
        };
      case 'P3_0':
        return {
          threshold: FIXED_FORECAST_THRESHOLDS.P3_0,
          unit: 'PSIA',
          baseVal: baseline.P3_0 ?? 154.0,
          defaultSlope: 0.032,
          isHigherDeteriorating: false,
        };
      case 'NPHR':
        return {
          threshold: FIXED_FORECAST_THRESHOLDS.NPHR,
          unit: 'kcal/kWh',
          baseVal: baseline.nphr ?? 2450.0,
          defaultSlope: 0.040,
          isHigherDeteriorating: true,
        };
      case 'realPower':
        return {
          threshold: FIXED_FORECAST_THRESHOLDS.realPower,
          unit: 'MW',
          baseVal: baseline.realPower ?? 22.0,
          defaultSlope: 0.045,
          isHigherDeteriorating: false,
        };
    }
  };

  const days: ThreeDayProjectionPoint[] = offsets.map((offset) => {
    const dObj = new Date(baseDateObj);
    dObj.setDate(dObj.getDate() + offset);
    const date = dObj.toISOString().slice(0, 10);

    const dayLabel = `H+${offset}`;
    let focusLabel: string;
    if (isConditionSatisfied) {
      focusLabel =
        offset === 1
          ? 'Persiapan & Pengadaan Bahan Kimia'
          : offset === 2
          ? 'Penurunan Beban & Prosedur Cooldown'
          : 'Target Eksekusi Water Wash';
    } else {
      if (offset === count) {
        focusLabel = 'Target Estimasi Water Wash';
      } else if (offset === 1) {
        focusLabel = 'Awal Periode Pemantauan';
      } else if (offset === Math.round(count / 2)) {
        focusLabel = `Pertengahan Periode (H+${offset})`;
      } else {
        focusLabel = `Pemantauan Tren Degradasi (H+${offset})`;
      }
    }

    const paramMap: Record<ForecastParameter, any> = {} as any;
    let metCount = 0;

    for (const key of paramKeys) {
      const fc = parameters[key];
      const cfg = getParamConfig(key);
      const currentDet = fc?.currentDeterioration ?? 0;

      let slope = fc?.slope && fc.slope > 0 ? fc.slope : cfg.defaultSlope;
      if (isConditionSatisfied) {
        slope = Math.max(slope, 0.03);
      }

      const projectedDet = Number((currentDet + slope * offset).toFixed(2));
      const deltaFromCurrent = Number((slope * offset).toFixed(2));

      let projectedVal: number;
      if (cfg.isHigherDeteriorating) {
        projectedVal = Number((cfg.baseVal * (1 + projectedDet / 100)).toFixed(2));
      } else {
        projectedVal = Number((cfg.baseVal * (1 - projectedDet / 100)).toFixed(key === 'PR' ? 4 : 2));
      }

      const isThresholdExceeded = projectedDet >= cfg.threshold;
      if (isThresholdExceeded) metCount++;

      paramMap[key] = {
        deterioration: projectedDet,
        projectedValue: projectedVal,
        unit: cfg.unit,
        threshold: cfg.threshold,
        isThresholdExceeded,
        deltaFromCurrent,
      };
    }

    return {
      dayOffset: offset,
      runningHoursOffset: offset * DEFAULT_RUNNING_HOURS_PER_DAY,
      date,
      dayLabel,
      runningHoursLabel: `+${offset * DEFAULT_RUNNING_HOURS_PER_DAY} Jam`,
      focusLabel,
      PR: paramMap.PR,
      P3_0: paramMap.P3_0,
      NPHR: paramMap.NPHR,
      realPower: paramMap.realPower,
      thresholdsMetCount: metCount,
      isAllThresholdsMet: metCount >= 3,
    };
  });

  const targetWaterWashDate = targetDateStr || days[days.length - 1]?.date || baseDate;

  return {
    startDate: baseDate,
    targetWaterWashDate,
    totalDays: count,
    totalRunningHours: count * DEFAULT_RUNNING_HOURS_PER_DAY,
    days,
    governingParameter: null,
    overallDeteriorationTrend: 'STEADY',
  };
}

/**
 * Backward compatibility utility if needed
 */
export function convertHourlyToDailyRepresentative(
  inputs: OperationalInput[],
  baseline: BaselineConfig,
  thresholds: ThresholdConfig
): DailyRepresentativeRecord[] {
  // Pass-through stub if called
  return [];
}
