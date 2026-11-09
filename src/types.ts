/**
 * Gas Turbine Compressor Water Washing Monitoring & Recommendation System
 * Core Data Models and Types
 */

export interface OperationalInput {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM or HH:MM:SS
  T1_7?: number | null; // Optional Compressor Inlet Temperature (°F)
  P1_7: number; // Compressor Inlet Pressure (PSIA)
  P3_0: number; // Compressor Discharge Pressure (PSIA)
  realPower: number; // Gas Turbine Real Power (MW)
  nphr: number; // Net Plant Heat Rate (kcal/kWh)
  pbSynthesis?: number | null; // PB Synthesis (NH) in PSIA
  pbSynthesisDB?: number | null; // PB Synthesis DB in PSIA
  fNH?: number | null; // Kurva f(NH) Speedronic (Y)
  nhSpeed?: number | null; // NH Speed (X)
  x1?: number | null; // Titik interpolasi X1
  y1?: number | null; // Titik interpolasi Y1
  x2?: number | null; // Titik interpolasi X2
  y2?: number | null; // Titik interpolasi Y2
  upperMultiplier?: number | null; // Multiplier batas atas (default 1.2)
  lowerMultiplier?: number | null; // Multiplier batas bawah (default 0.8)
  pt006?: number | null; // Inlet Pressure PT006/PT006B (PSIA)
  isDrivebackWWRecommended?: boolean;
  isPbBaseline?: boolean; // Tagged as Active Baseline for PB Synthesis / Driveback
  notes?: string;
  isWaterWashEvent?: boolean; // Tagged if Water Wash occurred on this date
  waterWashEventNumber?: number;
}

export type OverallWaterWashStatus =
  | 'NORMAL'
  | 'EARLY MONITORING'
  | 'MONITORING'
  | 'CAUTION'
  | 'RECOMMEND WATER WASH'
  | 'INSUFFICIENT DATA';

export interface ParameterEvaluation {
  currentValue: number;
  baselineValue: number | null;
  deteriorationPercent: number | null; // Positive value = performance deteriorated
  threshold: number;
  isThresholdReached: boolean | null;
  unit: string;
  name: string;
  role: 'compressor' | 'plant_performance';
}

export interface OperationalRecord extends OperationalInput {
  id: string;
  timestamp: number; // Epoch ms for chronological sorting
  pr: number; // Pressure Ratio = P3_0 / P1_7

  // Deteriorations (% - positive means worse performance)
  nphrDeterioration: number | null;
  prDeterioration: number | null;
  p3Deterioration: number | null;
  powerDeterioration: number | null;

  // Actual physical deltas vs baseline (Current - Baseline)
  nphrDelta?: number | null; // kcal/kWh (positive = higher heat rate)
  prDelta?: number | null; // dimensionless (negative = loss of PR)
  p3Delta?: number | null; // PSIA (negative = drop in discharge pressure)
  powerDelta?: number | null; // MW (negative = loss of generator power)

  // Threshold evaluations
  nphrThresholdReached: boolean | null;
  nphrEarlyMonitoringReached: boolean | null;
  prThresholdReached: boolean | null;
  p3ThresholdReached: boolean | null;
  powerThresholdReached: boolean | null;

  // Water Washing 3-out-of-4 Rule metrics
  thresholdsMetCount: number; // 0 to 4
  evaluatedIndicatorsCount: number; // How many indicators had valid baseline
  overallStatus: OverallWaterWashStatus;
  statusExplanation: string;

  // Synced to external spreadsheet
  syncedToSpreadsheet?: boolean;
  syncTimestamp?: string;

  // Performance Index / Bobot Lolos Diskrit (PR 30%, P3.0 30%, NPHR 20%, Real Power 20%)
  // Dihitung diskrit hanya dari indikator yang telah melampaui batas ambang (0%, 20%, 30%, 50%, 60%, 70%, 80%, 100%)
  performanceIndex?: number | null;
  performanceIndexContribution?: {
    pr: number; // 30 atau 0
    p3: number; // 30 atau 0
    nphr: number; // 20 atau 0
    power: number; // 20 atau 0
  };

  // Proximity Score (Continuous insight only - TIDAK PERNAH digunakan untuk penentuan status operasional)
  proximityScore?: number | null;

  // Physical data validity & warnings (Kasus b: data ada tapi <= 0 pada besaran fisik positif)
  hasPhysicalDataError?: boolean;
  physicalDataErrors?: string[];
  dataQualityWarning?: string | null;

  // Hourly to Daily Average Aggregation metadata
  hourlyObservationsCount?: number; // Number of hourly readings aggregated
  sourceRecordIds?: string[]; // IDs of underlying hourly records
  isDailyMedian?: boolean; // Indicates whether this record is a daily consolidated (average) record
  isDailyAverage?: boolean;

  // PB Synthesis Monitoring Fields (PB_upper = 1.18 * PB_syn, PB_lower = 0.82 * PB_syn)
  pbSynthesis?: number | null;
  pbUpper?: number | null;
  pbLower?: number | null;
  pbDeviationPercent?: number | null;
  pbStatus?: 'NORMAL' | 'HIGH_ALARM' | 'LOW_ALARM' | null;
  pbStatusMessage?: string;

  // Driveback Monitoring Fields (PB_upper = Y * PT006 * 1.2, PB_lower = Y * PT006 * 0.8, Y = f(NH))
  pbSynthesisDB?: number | null;
  fNH?: number | null;
  nhSpeed?: number | null;
  x1?: number | null;
  y1?: number | null;
  x2?: number | null;
  y2?: number | null;
  upperMultiplier?: number | null;
  lowerMultiplier?: number | null;
  pt006?: number | null;
  pbUpperDB?: number | null;
  pbLowerDB?: number | null;
  pbDeviationDBPercent?: number | null;
  pbStatusDB?: 'NORMAL' | 'HIGH_DRIVEBACK' | 'LOW_DRIVEBACK' | 'RECOMMEND WATER WASH' | null;
  pbStatusDBMessage?: string;
  isDrivebackCrossing?: boolean;
  isDrivebackWWRecommended?: boolean;
  isPbBaseline?: boolean; // Tagged as Active Baseline for PB Synthesis / Driveback
  pt007?: number | null; // Alias for compressor discharge pressure PT / PT007 (PSIA)
  pbPercentOfUpper?: number | null; // (PT007 / pbUpperDB) * 100 (%)
  pbPercentOfLower?: number | null; // (PT007 / pbLowerDB) * 100 (%)
  pbHeadroomToUpper?: number | null; // ((pbUpperDB - PT007) / pbUpperDB) * 100 (%)
  pbMarginAboveLower?: number | null; // ((PT007 - pbLowerDB) / pbLowerDB) * 100 (%)
  pbBandPositionPercent?: number | null; // Position inside [Lower, Upper] operating band (%)
}

export interface ThresholdConfig {
  nphrWWThreshold: number; // Default: 3.0 (%)
  prWWThreshold: number; // Default: 2.5 (%)
  p3WWThreshold: number; // Default: 2.5 (%)
  powerWWThreshold: number; // Default: 4.0 (%)
  nphrEarlyMonitoring: number; // Default: 1.7 (%)
}

/**
 * Daily Representative Record derived from Diamond hourly observations
 * Sequence: Hourly -> filter (19:00-21:00 or high load >21MW) -> median
 */
export interface DailyRepresentativeRecord {
  date: string; // YYYY-MM-DD
  validHourlyCount: number;
  totalHourlyCount: number;
  methodUsed: '19-21_window' | 'max_load_fallback' | 'all_available';
  
  // Average values
  PR: number;
  P3_0: number;
  nphr: number;
  realPower: number;
  T1_7?: number;
  P1_7?: number;

  // Daily Deteriorations relative to Active Baseline (%)
  prDeterioration: number | null;
  p3Deterioration: number | null;
  nphrDeterioration: number | null;
  powerDeterioration: number | null;

  // Performance Index for this representative day
  performanceIndex: number | null;
}

export type ForecastParameter = 'PR' | 'P3_0' | 'NPHR' | 'realPower';

export type ForecastStatus =
  | 'THRESHOLD REACHED'
  | 'NO PROJECTED THRESHOLD CROSSING'
  | 'INSUFFICIENT DATA'
  | 'FORECAST AVAILABLE';

export interface ParameterForecast {
  parameter: ForecastParameter;
  displayName: string;
  unit: string;
  currentDeterioration: number | null; // % (raw observation from latest day)
  currentFitted?: number | null; // % (fitted regression value at latest elapsed day)
  threshold: number; // % (PR: 2.5, P3.0: 2.5, NPHR: 3.0, Real Power: 4.0)
  remainingDeterioration: number | null; // percentage points (Threshold - Current Fitted)
  
  // Regression metrics
  isAvailable: boolean;
  unavailableReason?: string;
  validDaysCount: number;
  slope: number | null; // percentage points / day (b in D(t) = a + b*t)
  intercept: number | null; // a
  rSquared: number | null; // goodness of fit (0 to 1)
  
  // Elapsed days series used in regression
  elapsedDaysData?: { date: string; elapsedDays: number; deterioration: number; smoothed?: number | null; fitted: number | null }[];

  // Forecast output
  daysToThreshold: number | null;
  exactDaysToThreshold?: number | null;
  hoursToThreshold?: number | null; // daysToThreshold * RUNNING_HOURS_PER_DAY (4 hours/day)
  exactHoursToThreshold?: number | null;
  slopePerHour?: number | null; // % / Running Hour
  estimatedDate: string | null; // YYYY-MM-DD
  status: ForecastStatus;
}

export type WaterWashForecastStatus = 'DUE_NOW' | 'PROJECTED' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface DailyParamProjection {
  deterioration: number; // %
  projectedValue: number; // engineering unit
  unit: string;
  threshold: number; // %
  isThresholdExceeded: boolean;
  deltaFromCurrent: number; // percentage points
}

export interface ThreeDayProjectionPoint {
  dayOffset: number; // 1, 2, 3
  runningHoursOffset: number; // 4, 8, 12, ... (running hours cumulative)
  date: string; // YYYY-MM-DD
  dayLabel: string; // "H+1", "H+2", "H+3"
  runningHoursLabel: string; // "+4 Jam", "+8 Jam", "+12 Jam"
  focusLabel: string; // e.g. "Persiapan", "Cooldown", "Eksekusi WW"
  PR: DailyParamProjection;
  P3_0: DailyParamProjection;
  NPHR: DailyParamProjection;
  realPower: DailyParamProjection;
  thresholdsMetCount: number;
  isAllThresholdsMet: boolean;
}

export interface ThreeDayProjectionSummary {
  startDate: string; // YYYY-MM-DD (H-0)
  targetWaterWashDate: string; // YYYY-MM-DD (H+3 or H+N)
  totalDays: number; // e.g. 3 or 29
  totalRunningHours: number; // totalDays * 4 (e.g. 12 or 116)
  days: ThreeDayProjectionPoint[];
  governingParameter: ForecastParameter | null;
  overallDeteriorationTrend: 'ACCELERATING' | 'STEADY' | 'STABLE';
}

export type ProjectionPoint = ThreeDayProjectionPoint;
export type ProjectionSummary = ThreeDayProjectionSummary;

export interface OverallForecastSummary {
  hasForecast: boolean;
  forecastWW: number | null; // Forecast WW in days: MAX(PR, P3.0, MIN(NPHR, Real Power))
  forecastWWDate: string | null; // Projected date for WW (YYYY-MM-DD)
  forecastRunningHours: number | null; // Forecast WW in Running Hours (forecastWW * 4)
  rawForecastRunningHours?: number | null;
  runningHoursUntilNextWaterWash: number | null;
  runningHoursPerDay: number; // default 4
  governingParameter: ForecastParameter | null;
  governingDisplayName: string | null;
  forecastDaysPR: number | null;
  forecastDaysP3: number | null;
  forecastDaysNPHR: number | null;
  forecastDaysPower: number | null;
  forecastDaysAux: number | null; // MIN(Forecast NPHR, Forecast Real Power)
  forecastHoursPR?: number | null;
  forecastHoursP3?: number | null;
  forecastHoursNPHR?: number | null;
  forecastHoursPower?: number | null;
  forecastHoursAux?: number | null;
  isConditionSatisfied: boolean; // PR AND P3.0 AND (NPHR OR Real Power)
  nearestParameter: ForecastParameter | null;
  nearestDisplayName: string | null;
  nearestDays: number | null;
  nearestHours?: number | null;
  nearestDate: string | null;
  hasThresholdReached: boolean;
  reachedParameters: ForecastParameter[];
  waterWashStatus: WaterWashForecastStatus;
  daysUntilNextWaterWash: number | null; // 0 if DUE_NOW, X if PROJECTED, null if STABLE/INSUFFICIENT
  isPantauOperationalState?: boolean;
  isPantauCapped?: boolean;
  rawForecastWW?: number | null;
  pantauCapDays?: number;
  pantauCapHours?: number;
  pantauExplanation?: string | null;
  parameters: Record<ForecastParameter, ParameterForecast>;
  dailyRecords: OperationalRecord[]; // The Input History daily records for the current cycle
  cycleStartDate: string | null;
  baselineDate: string | null;
  dataScope: 'cycle' | 'newest';
}

export interface BaselineConfig {
  isConfigured: boolean;
  T1_7?: number | null; // Optional °F
  P1_7: number | null; // PSIA
  P3_0: number | null; // PSIA
  PR: number | null; // P3.0 / P1.7
  realPower: number | null; // MW
  nphr: number | null; // kcal/kWh
  referenceDescription?: string;
  setAt?: string;
  sourceRecordId?: string; // ID of the record currently serving as baseline
  date?: string; // Date of the baseline record
  time?: string; // Time of the baseline record
}

export interface WaterWashEvent {
  id: string;
  eventNumber: number;
  date: string; // YYYY-MM-DD
  preRecordId?: string; // Last operating record before wash
  postRecordId?: string; // Operating record after wash (H+1)
  preDaysDiff?: number; // Number of days before wash (e.g. 1 for H-1, 3 for 6th Oct when wash is 9th)
  postDaysDiff?: number; // Number of days after wash (e.g. 1 for H+1)
  preRecord?: OperationalRecord;
  postRecord?: OperationalRecord;
  preDailyRepresentative?: DailyRepresentativeRecord;
  postDailyRepresentative?: DailyRepresentativeRecord;
  hourlyObservationsCount?: number; // Number of hourly records grouped for this WW event
  deltaNPHR?: number | null; // Post - Pre (negative is improvement)
  deltaNPHRPercent?: number | null;
  deltaEfficiency?: number | null; // Post - Pre (positive is improvement)
  deltaP3?: number | null; // Post - Pre (positive is improvement)
  deltaP3Percent?: number | null;
  deltaPR?: number | null; // Post - Pre (positive is improvement)
  deltaPRPercent?: number | null;
  deltaPower?: number | null; // Post - Pre (positive is improvement)
  deltaPowerPercent?: number | null;
  notes?: string;
}

export interface WaterWashCycleDeterioration {
  id: string;
  cycleNumber: number;
  prevEventNumber: number;
  nextEventNumber: number;
  prevEventDate: string;
  nextEventDate: string;
  intervalDays: number;
  startRecord?: OperationalRecord; // H+1 after previous WW
  endRecord?: OperationalRecord; // H-1 before next WW
  nphrDeteriorationPercent?: number | null;
  efficiencyDeteriorationPercent?: number | null;
  prDeteriorationPercent?: number | null;
  p3DeteriorationPercent?: number | null;
  powerDeteriorationPercent?: number | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  parameter: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  reason?: string;
}

export type ActiveNavTab = 'dashboard' | 'input' | 'pbSynthesis';

export type PBSynthesisAlarmStatus = 'NORMAL' | 'HIGH_ALARM' | 'LOW_ALARM';
export type PBSynthesisDrivebackStatus = 'NORMAL' | 'HIGH_DRIVEBACK' | 'LOW_DRIVEBACK' | 'RECOMMEND WATER WASH';

export interface PBSynthesisEvaluation {
  pbAktual: number; // = P3_0
  pbSynthesis: number; // PB Synthesis (NH)
  
  // 1. Alarm Monitoring (±18%)
  pbUpper: number; // PB_syn * 1.18
  pbLower: number; // PB_syn * 0.82
  pbDeviationPercent: number; // ((PB_aktual - PB_syn) / PB_syn) * 100
  status: PBSynthesisAlarmStatus;
  statusMessage: string;

  // 2. Driveback Monitoring (PB_upper = Y * PT006 * 1.2, PB_lower = Y * PT006 * 0.8, Y = f(NH))
  pbSynthesisDB?: number | null; // PB Synthesis DB = Y * PT006
  fNH?: number | null; // Kurva f(NH) (Y)
  nhSpeed?: number | null; // NH Speed (X)
  x1?: number | null;
  y1?: number | null;
  x2?: number | null;
  y2?: number | null;
  upperMultiplier?: number | null;
  lowerMultiplier?: number | null;
  pt006?: number | null; // Inlet Pressure PT006/PT006B (PSIA)
  pbUpperDB?: number | null; // Y * PT006 * 1.2
  pbLowerDB?: number | null; // Y * PT006 * 0.8
  pbDeviationDBPercent?: number | null; // ((PB_aktual - PB_syn_db) / PB_syn_db) * 100
  statusDB?: PBSynthesisDrivebackStatus | null;
  statusDBMessage?: string;
  isDrivebackCrossing?: boolean;
  isDrivebackWWRecommended?: boolean;
  // PT007 vs Baseline comparison fields
  pt007?: number;
  percentOfUpper?: number | null; // (PT007 / Upper) * 100
  headroomToUpper?: number | null; // ((Upper - PT007) / Upper) * 100
  percentOfLower?: number | null; // (PT007 / Lower) * 100
  marginAboveLower?: number | null; // ((PT007 - Lower) / Lower) * 100
  bandPositionPercent?: number | null; // Position within [Lower, Upper] band
}

export interface PT007BaselineComparison {
  pt007: number; // PT / PT007 (Compressor Discharge Pressure)
  upperThreshold: number; // Batas Atas Driveback (Y * PT006 * 1.2)
  lowerThreshold: number; // Batas Bawah Driveback (Y * PT006 * 0.8)
  nominalDB: number; // Y * PT006
  percentOfUpper: number; // (PT007 / upperThreshold) * 100 (%)
  headroomToUpper: number; // ((upperThreshold - PT007) / upperThreshold) * 100 (%)
  percentOfLower: number; // (PT007 / lowerThreshold) * 100 (%)
  marginAboveLower: number; // ((PT007 - lowerThreshold) / lowerThreshold) * 100 (%)
  bandPositionPercent: number; // ((PT007 - lowerThreshold) / (upperThreshold - lowerThreshold)) * 100 (%)
  isExceedingUpper: boolean;
  isDroppingBelowLower: boolean;
  isNormal: boolean;
  status: 'NORMAL' | 'RECOMMEND WATER WASH';
  statusDetail: 'NORMAL' | 'HIGH_CROSSING' | 'LOW_CROSSING';
  message: string;
}

export interface PBSynthesisBaselineRecord {
  recordId?: string;
  date: string;
  time: string;
  nhSpeed: number;
  fNH: number;
  pt006: number;
  upperMultiplier: number;
  lowerMultiplier: number;
  nominalDB: number; // Y * PT006
  upperThreshold: number; // Y * PT006 * 1.2
  lowerThreshold: number; // Y * PT006 * 0.8
  setAt?: string;
}

export interface PBOperationCurvePoint {
  beban: number; // Beban (MW)
  nhSpeed: number; // X (NH Speed)
  yInterpolated: number; // Y (hasil hitung)
  pt006: number; // PT006 (PSIA)
  pbSynthesis: number; // PB Synthesis (NH) = Y * PT006
  earlyUpper: number; // Early Batas Atas (1.171x)
  earlyLower: number; // Early Batas Bawah (0.829x)
  upperThreshold: number; // Batas Atas (1.18x)
  lowerThreshold: number; // Batas Bawah (0.82x)
}

export type PBOperationZone =
  | 'NORMAL'
  | 'EARLY_UPPER'
  | 'EARLY_LOWER'
  | 'MELEWATI_BATAS_ATAS'
  | 'MELEWATI_BATAS_BAWAH';

export interface PBOperationEvaluation {
  beban: number; // Beban Aktual (MW)
  nhSpeed: number; // NH Speed input (X)
  t1_7: number; // T1.7 (°F)
  theta: number; // (T1.7 + 459.7) / 518.7
  sqrtTheta: number; // sqrt(theta)
  nhSpeedCorrected: number; // NH Speed / sqrt(theta)
  fNH: number; // Y = f(NH_corrected) interpolated
  pt006: number; // PT006 (Inlet P1.7, PSIA)
  pt007: number; // PT007 (Testing Data P3.0, PSIA)
  pbSynthesis: number; // PB Synthesis (NH) = Y * PT006
  earlyUpper: number; // 1.171x
  earlyLower: number; // 0.829x
  upperThreshold: number; // 1.18x
  lowerThreshold: number; // 0.82x
  zone: PBOperationZone;
  statusLabel: string;
  statusDescription: string;
  isRecommendWaterWash: boolean;
  deltaPbSyn: number; // PT007 - pbSynthesis
  percentDevPbSyn: number; // ((PT007 - pbSynthesis) / pbSynthesis) * 100
}

export interface PBOperationInputRecord {
  id: string;
  date: string;
  time: string;
  beban: number; // Real Power (MW)
  nhSpeed: number; // NH Speed raw
  t1_7: number; // T1.7 (°F)
  theta: number;
  sqrtTheta: number;
  nhSpeedCorrected: number; // NH Speed Corrected
  pt006: number; // PT006 (Inlet P1.7, PSIA)
  pt007: number; // PT007 (Testing Data P3.0, PSIA)
  fNH: number; // Y = f(NH_corrected)
  pbSynthesis: number; // PB Synthesis (NH) = Y * PT006
  earlyUpper: number; // 1.08x
  earlyLower: number; // 0.92x
  upperThreshold: number; // 1.18x
  lowerThreshold: number; // 0.82x
  zone: PBOperationZone;
  isRecommendWaterWash: boolean;
  timestamp: number;
}

