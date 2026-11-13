import {
  AuditLogEntry,
  BaselineConfig,
  ThresholdConfig,
} from '../types';

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  prWWThreshold: 2.5,    // Historical-based WW threshold (2.5%)
  p3WWThreshold: 2.5,    // Historical-based WW threshold (2.5%)
  powerWWThreshold: 4.0, // Historical-based WW threshold (4.0%)
};

/**
 * FIXED Project Forecast Thresholds
 * Satu sumber kebenaran: merujuk langsung pada DEFAULT_THRESHOLDS
 */
export const FIXED_FORECAST_THRESHOLDS = {
  PR: DEFAULT_THRESHOLDS.prWWThreshold,
  P3_0: DEFAULT_THRESHOLDS.p3WWThreshold,
  realPower: DEFAULT_THRESHOLDS.powerWWThreshold,
} as const;

/**
 * Bobot Parameter Diskrit
 * Satu sumber kebenaran untuk pembobotan 3 indikator (PR 35%, P3.0 35%, Real Power 30% = 100%)
 */
export const INDICATOR_WEIGHTS = {
  pr: 35,
  p3: 35,
  power: 30,
} as const;

/**
 * Aturan Gerbang Keputusan Water Wash & Rentang Pantau
 * Satu sumber kebenaran untuk evaluasi status operasional
 */
export const WATER_WASH_DECISION_RULES = {
  minIndicatorsMet: 3,         // Minimal indikator lolos ambang batas (3 dari 3)
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
  referenceDescription: 'Awaiting first operational reading or baseline calibration.',
};

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log_init',
    timestamp: new Date().toISOString(),
    parameter: 'System Initialized',
    oldValue: '-',
    newValue: `Initial Historical-Based Thresholds loaded (${DEFAULT_THRESHOLDS.prWWThreshold}% PR, ${DEFAULT_THRESHOLDS.p3WWThreshold}% P3.0, ${DEFAULT_THRESHOLDS.powerWWThreshold}% Power)`,
    changedBy: 'System Administrator',
    reason: 'Initial setup of Water Washing monitoring system',
  },
];
