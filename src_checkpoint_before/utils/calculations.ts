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
export function calculateDeteriorationPercent(
  current: number,
  baseline: number | null | undefined,
  direction: 'higher_is_worse' | 'lower_is_worse'
): number | null {
  if (baseline === null || baseline === undefined || baseline <= 0 || current <= 0) {
    return null;
  }

  if (direction === 'higher_is_worse') {
    // For NPHR: Increase is deterioration
    const det = ((current - baseline) / baseline) * 100;
    return Number(det.toFixed(2));
  } else {
    // For PR, P3.0, Real Power: Decrease is deterioration
    const det = ((baseline - current) / baseline) * 100;
    return Number(det.toFixed(2));
  }
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

  // Calculate deteriorations (positive indicates deterioration)
  const nphrDeterioration = hasBaseline
    ? calculateDeteriorationPercent(input.nphr, baseline.nphr, 'higher_is_worse')
    : null;

  const prDeterioration = hasBaseline
    ? calculateDeteriorationPercent(pr, baseline.PR, 'lower_is_worse')
    : null;

  const p3Deterioration = hasBaseline
    ? calculateDeteriorationPercent(input.P3_0, baseline.P3_0, 'lower_is_worse')
    : null;

  const powerDeterioration = hasBaseline
    ? calculateDeteriorationPercent(input.realPower, baseline.realPower, 'lower_is_worse')
    : null;

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

  // Evaluate threshold conditions
  const nphrThresholdReached =
    nphrDeterioration !== null ? nphrDeterioration >= thresholds.nphrWWThreshold : null;

  const nphrEarlyMonitoringReached =
    nphrDeterioration !== null
      ? nphrDeterioration >= thresholds.nphrEarlyMonitoring &&
        nphrDeterioration < thresholds.nphrWWThreshold
      : null;

  const prThresholdReached =
    prDeterioration !== null ? prDeterioration >= thresholds.prWWThreshold : null;

  const p3ThresholdReached =
    p3Deterioration !== null ? p3Deterioration >= thresholds.p3WWThreshold : null;

  const powerThresholdReached =
    powerDeterioration !== null ? powerDeterioration >= thresholds.powerWWThreshold : null;

  // Count thresholds met
  const validEvaluations = [
    nphrThresholdReached,
    prThresholdReached,
    p3ThresholdReached,
    powerThresholdReached,
  ].filter((val) => val !== null) as boolean[];

  const evaluatedIndicatorsCount = validEvaluations.length;
  const thresholdsMetCount = validEvaluations.filter(Boolean).length;

  // Performance Index calculation:
  // PR: weight 30%, P3.0: weight 30%, NPHR: weight 20%, Real Power: weight 20%
  // Contribution = min(weight, max(0, (deterioration / threshold) * weight))
  let performanceIndex: number | null = null;
  let performanceIndexContribution: {
    pr: number;
    p3: number;
    nphr: number;
    power: number;
  } | undefined = undefined;

  if (hasBaseline && evaluatedIndicatorsCount >= 3) {
    const prPart = prDeterioration !== null
      ? Math.min(30, Math.max(0, (prDeterioration / thresholds.prWWThreshold) * 30))
      : 0;
    const p3Part = p3Deterioration !== null
      ? Math.min(30, Math.max(0, (p3Deterioration / thresholds.p3WWThreshold) * 30))
      : 0;
    const nphrPart = nphrDeterioration !== null
      ? Math.min(20, Math.max(0, (nphrDeterioration / thresholds.nphrWWThreshold) * 20))
      : 0;
    const powerPart = powerDeterioration !== null
      ? Math.min(20, Math.max(0, (powerDeterioration / thresholds.powerWWThreshold) * 20))
      : 0;

    performanceIndex = Number((prPart + p3Part + nphrPart + powerPart).toFixed(1));
    performanceIndexContribution = {
      pr: Number(prPart.toFixed(1)),
      p3: Number(p3Part.toFixed(1)),
      nphr: Number(nphrPart.toFixed(1)),
      power: Number(powerPart.toFixed(1)),
    };
  }

  let overallStatus: OverallWaterWashStatus = 'INSUFFICIENT DATA';
  let statusExplanation = '';

  // Rule Specification for Water Washing Evaluation:
  // 1. RECOMMEND WATER WASH if:
  //    - Performance Index >= 80% (or core combination: PR & P3.0 & (NPHR OR Real Power) met)
  // 2. MONITORING (Pantau) if:
  //    - Performance Index is around 50% - 79.9% (50% <= Performance Index < 80%)
  // 3. NORMAL:
  //    - Performance Index is under 50% (< 50%)

  const isCoreConditionMet =
    Boolean(prThresholdReached) &&
    Boolean(p3ThresholdReached) &&
    (Boolean(nphrThresholdReached) || Boolean(powerThresholdReached));

  const isThreeOfFourMet = thresholdsMetCount >= 3;
  const isPerformanceIndexHigh = performanceIndex !== null && performanceIndex >= 80;

  if (evaluatedIndicatorsCount < 3 || !hasBaseline || performanceIndex === null) {
    overallStatus = 'INSUFFICIENT DATA';
    statusExplanation = 'Reference baseline required for deterioration & Performance Index calculation.';
  } else if (isCoreConditionMet || isThreeOfFourMet || isPerformanceIndexHigh) {
    overallStatus = 'RECOMMEND WATER WASH';
    if (isCoreConditionMet) {
      statusExplanation = `PR & P3.0 reached threshold with ${powerThresholdReached ? 'Real Power' : 'NPHR'} deterioration (Index: ${performanceIndex}%). Recommend Water Wash.`;
    } else if (isThreeOfFourMet) {
      statusExplanation = `${thresholdsMetCount} of 4 parameter thresholds met (Index: ${performanceIndex}%). Recommend Water Wash.`;
    } else {
      statusExplanation = `Performance Index ${performanceIndex}% reaches 80% threshold. Recommend Water Wash.`;
    }
  } else if (performanceIndex >= 50 && performanceIndex < 80) {
    // "for 'Pantau' the index must be around 50%-79%"
    overallStatus = 'MONITORING';
    const reachedNames = [
      prThresholdReached ? 'PR' : '',
      p3ThresholdReached ? 'P3.0' : '',
      powerThresholdReached ? 'Real Power' : '',
      nphrThresholdReached ? 'NPHR' : '',
    ].filter(Boolean);
    if (reachedNames.length > 0) {
      statusExplanation = `Status Pantau: Performance Index ${performanceIndex}% (range 50% - 79%). Threshold reached: ${reachedNames.join(', ')}.`;
    } else if (Boolean(nphrEarlyMonitoringReached) || (nphrDeterioration !== null && nphrDeterioration >= thresholds.nphrEarlyMonitoring)) {
      statusExplanation = `Status Pantau: Performance Index ${performanceIndex}% (range 50% - 79%). NPHR early monitoring reached (≥${thresholds.nphrEarlyMonitoring}%).`;
    } else {
      statusExplanation = `Status Pantau: Performance Index ${performanceIndex}% (range 50% - 79%).`;
    }
  } else {
    // "If it's under 50%, then the status will be normal"
    overallStatus = 'NORMAL';
    const reachedNames = [
      prThresholdReached ? 'PR' : '',
      p3ThresholdReached ? 'P3.0' : '',
      powerThresholdReached ? 'Real Power' : '',
      nphrThresholdReached ? 'NPHR' : '',
    ].filter(Boolean);
    if (reachedNames.length > 0) {
      statusExplanation = `Status Normal: Performance Index ${performanceIndex}% (<50%). ${reachedNames.join(', ')} single-parameter deterioration noted.`;
    } else {
      statusExplanation = `Status Normal: Performance Index ${performanceIndex}%. Operating within normal parameters (<50%).`;
    }
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
