import {
  AuditLogEntry,
  BaselineConfig,
  ThresholdConfig,
} from '../types';

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  nphrWWThreshold: 3.0, // Historical-based WW threshold (3.0%)
  prWWThreshold: 2.5,    // Historical-based WW threshold (2.5%)
  p3WWThreshold: 2.5,    // Historical-based WW threshold (2.5%)
  powerWWThreshold: 4.0, // Historical-based WW threshold (4.0%)
  nphrEarlyMonitoring: 1.7, // Early monitoring boundary (1.7%)
};

/**
 * FIXED Project Forecast Thresholds
 * Satu sumber kebenaran: merujuk langsung pada DEFAULT_THRESHOLDS
 */
export const FIXED_FORECAST_THRESHOLDS = {
  PR: DEFAULT_THRESHOLDS.prWWThreshold,
  P3_0: DEFAULT_THRESHOLDS.p3WWThreshold,
  NPHR: DEFAULT_THRESHOLDS.nphrWWThreshold,
  realPower: DEFAULT_THRESHOLDS.powerWWThreshold,
} as const;

/**
 * Bobot Parameter Diskrit (Excel Live SOP Formula)
 * Satu sumber kebenaran untuk pembobotan indikator
 */
export const INDICATOR_WEIGHTS = {
  pr: 30,
  p3: 30,
  nphr: 20,
  power: 20,
} as const;

/**
 * Aturan Gerbang Keputusan Water Wash & Rentang Pantau
 * Satu sumber kebenaran untuk evaluasi status operasional
 */
export const WATER_WASH_DECISION_RULES = {
  minIndicatorsMet: 3,         // Minimal indikator lolos ambang batas (3 dari 4)
  minRecommendWeight: 80,      // Bobot lolos minimal untuk Rekomendasi Water Wash (80%)
  minPantauWeight: 50,         // Batas bawah bobot lolos status Pantau (50%)
  maxPantauWeight: 79,         // Batas atas bobot lolos status Pantau (79%)
} as const;

// Default empty baseline - awaits real operator data or baseline calibration
export const DEFAULT_BASELINE: BaselineConfig = {
  isConfigured: false,
  T1_7: null,
  P1_7: null,
  P3_0: null,
  PR: null,
  realPower: null,
  nphr: null,
  referenceDescription: 'Awaiting first operational reading or baseline calibration.',
};

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log_init',
    timestamp: new Date().toISOString(),
    parameter: 'System Initialized',
    oldValue: '-',
    newValue: `Initial Historical-Based Thresholds loaded (${DEFAULT_THRESHOLDS.nphrWWThreshold}% NPHR, ${DEFAULT_THRESHOLDS.prWWThreshold}% PR, ${DEFAULT_THRESHOLDS.p3WWThreshold}% P3.0, ${DEFAULT_THRESHOLDS.powerWWThreshold}% Power, ${DEFAULT_THRESHOLDS.nphrEarlyMonitoring}% Early Monitoring)`,
    changedBy: 'System Administrator',
    reason: 'Initial setup of Water Washing monitoring system',
  },
];
