import {
  AuditLogEntry,
  BaselineConfig,
  SpreadsheetIntegrationConfig,
  ThresholdConfig,
} from '../types';

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  nphrWWThreshold: 3.0, // Historical-based WW threshold (3%)
  prWWThreshold: 2.5,    // Historical-based WW threshold (2.5%)
  p3WWThreshold: 2.5,    // Historical-based WW threshold (2.5%)
  powerWWThreshold: 4.0, // Historical-based WW threshold (4%)
  nphrEarlyMonitoring: 1.7, // Early monitoring boundary (1.7%)
};

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

export const DEFAULT_SPREADSHEET_CONFIG: SpreadsheetIntegrationConfig = {
  webhookUrl: '',
  spreadsheetId: '',
  sheetName: 'OperationalData',
  autoSync: false,
  lastSyncStatus: 'idle',
  lastSyncTime: null,
  lastSyncMessage: 'Google Spreadsheet integration ready for endpoint URL configuration.',
};

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log_init',
    timestamp: new Date().toISOString(),
    parameter: 'System Initialized',
    oldValue: '-',
    newValue: 'Initial Historical-Based Thresholds loaded (3% NPHR, 3% PR, 3% P3.0, 4% Power, 1.7% Early Monitoring)',
    changedBy: 'System Administrator',
    reason: 'Initial setup of Water Washing monitoring system',
  },
];
