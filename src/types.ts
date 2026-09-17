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
  notes?: string;
  isWaterWashEvent?: boolean; // Tagged if Water Wash occurred on this date
  waterWashEventNumber?: number;
}

export type OverallWaterWashStatus =
  | 'NORMAL'
  | 'EARLY MONITORING'
  | 'MONITORING'
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

  // Hourly to Daily Median Aggregation metadata
  hourlyObservationsCount?: number; // Number of hourly readings aggregated
  sourceRecordIds?: string[]; // IDs of underlying hourly records
  isDailyMedian?: boolean; // Indicates whether this record is a daily median consolidation
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
  
  // Median values
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
  estimatedDate: string | null; // YYYY-MM-DD
  status: ForecastStatus;
}

export type WaterWashForecastStatus = 'DUE_NOW' | 'PROJECTED' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface OverallForecastSummary {
  hasForecast: boolean;
  forecastWW: number | null; // Forecast WW in days: MAX(PR, P3.0, MIN(NPHR, Real Power))
  forecastWWDate: string | null; // Projected date for WW (YYYY-MM-DD)
  governingParameter: ForecastParameter | null;
  governingDisplayName: string | null;
  forecastDaysPR: number | null;
  forecastDaysP3: number | null;
  forecastDaysNPHR: number | null;
  forecastDaysPower: number | null;
  forecastDaysAux: number | null; // MIN(Forecast NPHR, Forecast Real Power)
  isConditionSatisfied: boolean; // PR AND P3.0 AND (NPHR OR Real Power)
  nearestParameter: ForecastParameter | null;
  nearestDisplayName: string | null;
  nearestDays: number | null;
  nearestDate: string | null;
  hasThresholdReached: boolean;
  reachedParameters: ForecastParameter[];
  waterWashStatus: WaterWashForecastStatus;
  daysUntilNextWaterWash: number | null; // 0 if DUE_NOW, X if PROJECTED, null if STABLE/INSUFFICIENT
  isPantauOperationalState?: boolean;
  isPantauCapped?: boolean;
  rawForecastWW?: number | null;
  pantauCapDays?: number;
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
  preRecordId?: string; // H-1
  postRecordId?: string; // H+1
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

export type ActiveNavTab = 'dashboard' | 'input';
