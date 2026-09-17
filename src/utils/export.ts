/**
 * Data Export and Download Utilities
 * Supports CSV and Excel (.xlsx) export for all project data dimensions.
 */

import * as XLSX from 'xlsx';
import { OperationalRecord, WaterWashCycleDeterioration, WaterWashEvent } from '../types';
import { DEFAULT_THRESHOLDS } from '../data/initialData';

/**
 * Trigger browser file download
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Trigger browser Excel (.xlsx) download
 */
export function downloadExcelFile(data: (string | number | null | undefined)[][], filename: string, sheetName: string = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * Convert array of objects to CSV string
 */
function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map((r) => r.map(escapeCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * 1. Export Complete Operational and Calculated Data (CSV)
 */
export function exportOperationalRecordsCSV(records: OperationalRecord[]) {
  const headers = [
    'Record ID',
    'Date',
    'Time',
    'P1.7 Inlet Pressure (PSIA)',
    'P3.0 Discharge Pressure (PSIA)',
    'PR Pressure Ratio',
    'Real Power (MW)',
    'NPHR (kcal/kWh)',
    'NPHR Deterioration (%)',
    'PR Deterioration (%)',
    'P3.0 Deterioration (%)',
    'Real Power Deterioration (%)',
    `NPHR WW Threshold Reached (>=${DEFAULT_THRESHOLDS.nphrWWThreshold}%)`,
    `NPHR Early Monitoring (${DEFAULT_THRESHOLDS.nphrEarlyMonitoring}-${DEFAULT_THRESHOLDS.nphrWWThreshold}%)`,
    `PR WW Threshold Reached (>=${DEFAULT_THRESHOLDS.prWWThreshold}%)`,
    `P3.0 WW Threshold Reached (>=${DEFAULT_THRESHOLDS.p3WWThreshold}%)`,
    `Power WW Threshold Reached (>=${DEFAULT_THRESHOLDS.powerWWThreshold}%)`,
    'Indicators Meeting Threshold (Count/4)',
    'Overall WW Status',
    'WW Status Explanation',
    'WW Event Tag',
  ];

  const rows = records.map((r) => [
    r.id,
    r.date,
    r.time,
    r.P1_7,
    r.P3_0,
    r.pr,
    r.realPower,
    r.nphr,
    r.nphrDeterioration !== null ? r.nphrDeterioration : 'N/A',
    r.prDeterioration !== null ? r.prDeterioration : 'N/A',
    r.p3Deterioration !== null ? r.p3Deterioration : 'N/A',
    r.powerDeterioration !== null ? r.powerDeterioration : 'N/A',
    r.nphrThresholdReached !== null ? (r.nphrThresholdReached ? 'YES' : 'NO') : 'N/A',
    r.nphrEarlyMonitoringReached !== null ? (r.nphrEarlyMonitoringReached ? 'YES' : 'NO') : 'N/A',
    r.prThresholdReached !== null ? (r.prThresholdReached ? 'YES' : 'NO') : 'N/A',
    r.p3ThresholdReached !== null ? (r.p3ThresholdReached ? 'YES' : 'NO') : 'N/A',
    r.powerThresholdReached !== null ? (r.powerThresholdReached ? 'YES' : 'NO') : 'N/A',
    `${r.thresholdsMetCount} of ${r.evaluatedIndicatorsCount || 4}`,
    r.overallStatus,
    r.statusExplanation,
    r.isWaterWashEvent ? `WW Event #${r.waterWashEventNumber || ''}` : 'Normal Operation',
  ]);

  const csv = toCSV(headers, rows);
  const filename = `GT_WW_Operational_Data_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename);
}

/**
 * 1b. Export Complete Operational and Calculated Data (Excel .xlsx)
 */
export function exportOperationalRecordsExcel(records: OperationalRecord[]) {
  const headers = [
    'Record ID',
    'Date',
    'Time',
    'P1.7 Inlet Pressure (PSIA)',
    'P3.0 Discharge Pressure (PSIA)',
    'PR Pressure Ratio',
    'Real Power (MW)',
    'NPHR (kcal/kWh)',
    'NPHR Deterioration (%)',
    'PR Deterioration (%)',
    'P3.0 Deterioration (%)',
    'Real Power Deterioration (%)',
    `NPHR WW Threshold Reached (>=${DEFAULT_THRESHOLDS.nphrWWThreshold}%)`,
    `NPHR Early Monitoring (${DEFAULT_THRESHOLDS.nphrEarlyMonitoring}-${DEFAULT_THRESHOLDS.nphrWWThreshold}%)`,
    `PR WW Threshold Reached (>=${DEFAULT_THRESHOLDS.prWWThreshold}%)`,
    `P3.0 WW Threshold Reached (>=${DEFAULT_THRESHOLDS.p3WWThreshold}%)`,
    `Power WW Threshold Reached (>=${DEFAULT_THRESHOLDS.powerWWThreshold}%)`,
    'Indicators Meeting Threshold (Count/Evaluated)',
    'Overall WW Status',
    'WW Status Explanation',
    'WW Event Tag',
  ];

  const rows = records.map((r) => [
    r.id,
    r.date,
    r.time,
    r.P1_7,
    r.P3_0,
    r.pr,
    r.realPower,
    r.nphr,
    r.nphrDeterioration !== null ? r.nphrDeterioration : 'N/A',
    r.prDeterioration !== null ? r.prDeterioration : 'N/A',
    r.p3Deterioration !== null ? r.p3Deterioration : 'N/A',
    r.powerDeterioration !== null ? r.powerDeterioration : 'N/A',
    r.nphrThresholdReached !== null ? (r.nphrThresholdReached ? 'YES' : 'NO') : 'N/A',
    r.nphrEarlyMonitoringReached !== null ? (r.nphrEarlyMonitoringReached ? 'YES' : 'NO') : 'N/A',
    r.prThresholdReached !== null ? (r.prThresholdReached ? 'YES' : 'NO') : 'N/A',
    r.p3ThresholdReached !== null ? (r.p3ThresholdReached ? 'YES' : 'NO') : 'N/A',
    r.powerThresholdReached !== null ? (r.powerThresholdReached ? 'YES' : 'NO') : 'N/A',
    `${r.thresholdsMetCount} of ${r.evaluatedIndicatorsCount || 4}`,
    r.overallStatus,
    r.statusExplanation,
    r.isWaterWashEvent ? `WW Event #${r.waterWashEventNumber || ''}` : 'Normal Operation',
  ]);

  const filename = `GT_WW_Operational_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadExcelFile([headers, ...rows], filename, 'Operational Data');
}

/**
 * 2. Export Water Wash Performance Recovery Data (H-1 vs H+1)
 */
export function exportWaterWashRecoveryCSV(events: WaterWashEvent[]) {
  const headers = [
    'WW Event Number',
    'WW Date',
    'Pre-WW Date (H-1)',
    'Pre-WW NPHR (kcal/kWh)',
    'Pre-WW PR',
    'Pre-WW P3.0 (PSIA)',
    'Pre-WW Real Power (MW)',
    'Post-WW Date (H+1)',
    'Post-WW NPHR (kcal/kWh)',
    'Post-WW PR',
    'Post-WW P3.0 (PSIA)',
    'Post-WW Real Power (MW)',
    'Delta NPHR (kcal/kWh)',
    'Delta NPHR (%)',
    'Delta Efficiency (%)',
    'Delta P3.0 (PSIA)',
    'Delta P3.0 (%)',
    'Delta PR',
    'Delta PR (%)',
    'Delta Real Power (MW)',
    'Delta Real Power (%)',
    'Remarks / Notes',
  ];

  const rows = events.map((e) => [
    `WW #${e.eventNumber}`,
    e.date,
    e.preRecord ? `${e.preRecord.date} ${e.preRecord.time}` : 'Insufficient Data',
    e.preRecord ? e.preRecord.nphr : 'N/A',
    e.preRecord ? e.preRecord.pr : 'N/A',
    e.preRecord ? e.preRecord.P3_0 : 'N/A',
    e.preRecord ? e.preRecord.realPower : 'N/A',
    e.postRecord ? `${e.postRecord.date} ${e.postRecord.time}` : 'Insufficient Data',
    e.postRecord ? e.postRecord.nphr : 'N/A',
    e.postRecord ? e.postRecord.pr : 'N/A',
    e.postRecord ? e.postRecord.P3_0 : 'N/A',
    e.postRecord ? e.postRecord.realPower : 'N/A',
    e.deltaNPHR !== null ? e.deltaNPHR : 'N/A',
    e.deltaNPHRPercent !== null ? `${e.deltaNPHRPercent}%` : 'N/A',
    e.deltaEfficiency !== null ? `${e.deltaEfficiency}%` : 'N/A',
    e.deltaP3 !== null ? e.deltaP3 : 'N/A',
    e.deltaP3Percent !== null ? `${e.deltaP3Percent}%` : 'N/A',
    e.deltaPR !== null ? e.deltaPR : 'N/A',
    e.deltaPRPercent !== null ? `${e.deltaPRPercent}%` : 'N/A',
    e.deltaPower !== null ? e.deltaPower : 'N/A',
    e.deltaPowerPercent !== null ? `${e.deltaPowerPercent}%` : 'N/A',
    e.notes || '',
  ]);

  const csv = toCSV(headers, rows);
  const filename = `GT_WW_Performance_Recovery_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename);
}

/**
 * 3. Export Deterioration Between Water Wash Cycles Data (H+1 -> H-1)
 */
export function exportCycleDeteriorationCSV(cycles: WaterWashCycleDeterioration[]) {
  const headers = [
    'Cycle Number',
    'Previous WW Event',
    'Next WW Event',
    'Previous WW Date (Clean Baseline)',
    'Next WW Date (Fouled End)',
    'Operating Interval (Days)',
    'NPHR Deterioration (%)',
    'Efficiency Deterioration (%)',
    'PR Deterioration (%)',
    'P3.0 Deterioration (%)',
    'Real Power Deterioration (%)',
  ];

  const rows = cycles.map((c) => [
    `Cycle ${c.cycleNumber}`,
    `WW #${c.prevEventNumber}`,
    `WW #${c.nextEventNumber}`,
    c.prevEventDate,
    c.nextEventDate,
    c.intervalDays,
    c.nphrDeteriorationPercent !== null ? `${c.nphrDeteriorationPercent}%` : 'Insufficient Data',
    c.efficiencyDeteriorationPercent !== null ? `${c.efficiencyDeteriorationPercent}%` : 'Insufficient Data',
    c.prDeteriorationPercent !== null ? `${c.prDeteriorationPercent}%` : 'Insufficient Data',
    c.p3DeteriorationPercent !== null ? `${c.p3DeteriorationPercent}%` : 'Insufficient Data',
    c.powerDeteriorationPercent !== null ? `${c.powerDeteriorationPercent}%` : 'Insufficient Data',
  ]);

  const csv = toCSV(headers, rows);
  const filename = `GT_WW_Cycle_Deterioration_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename);
}
