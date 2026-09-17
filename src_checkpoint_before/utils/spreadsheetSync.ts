/**
 * Google Spreadsheet Integration Layer
 * Connects the web application to Google Sheets repository via Webhook / Apps Script or REST API
 */

import { OperationalRecord, SpreadsheetIntegrationConfig } from '../types';

export async function syncRecordToGoogleSpreadsheet(
  record: OperationalRecord,
  config: SpreadsheetIntegrationConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.webhookUrl || config.webhookUrl.trim() === '') {
    return {
      success: false,
      message: 'Google Spreadsheet Webhook URL not configured. Data saved locally.',
    };
  }

  try {
    const payload = {
      action: 'append_record',
      spreadsheetId: config.spreadsheetId || '',
      sheetName: config.sheetName || 'OperationalData',
      timestamp: new Date().toISOString(),
      record: {
        id: record.id,
        date: record.date,
        time: record.time,
        T1_7: record.T1_7,
        P1_7: record.P1_7,
        P3_0: record.P3_0,
        pr: record.pr,
        realPower: record.realPower,
        nphr: record.nphr,
        nphrDeterioration: record.nphrDeterioration ?? 'N/A',
        prDeterioration: record.prDeterioration ?? 'N/A',
        p3Deterioration: record.p3Deterioration ?? 'N/A',
        powerDeterioration: record.powerDeterioration ?? 'N/A',
        thresholdsMetCount: record.thresholdsMetCount,
        overallStatus: record.overallStatus,
        isWaterWashEvent: record.isWaterWashEvent ? true : false,
        waterWashEventNumber: record.waterWashEventNumber || '',
      },
    };

    // Send HTTP POST to Google Apps Script Webhook / Proxy
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return {
        success: true,
        message: 'Successfully synchronized to Google Spreadsheet repository.',
      };
    } else {
      return {
        success: false,
        message: `Google Spreadsheet returned status ${response.status}: ${response.statusText}`,
      };
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown network error';
    return {
      success: false,
      message: `Failed to connect to Google Spreadsheet: ${errorMessage}`,
    };
  }
}

/**
 * Alias for syncRecordToGoogleSpreadsheet
 */
export async function sendRecordToSpreadsheet(
  record: OperationalRecord,
  config: SpreadsheetIntegrationConfig
): Promise<{ success: boolean; message: string }> {
  return syncRecordToGoogleSpreadsheet(record, config);
}

/**
 * Tests connectivity to the Google Spreadsheet webhook
 */
export async function testSpreadsheetConnection(
  config: SpreadsheetIntegrationConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.webhookUrl || config.webhookUrl.trim() === '') {
    return {
      success: false,
      message: 'No Google Spreadsheet Webhook URL provided. Please enter a valid URL.',
    };
  }

  try {
    const payload = {
      action: 'ping_test',
      spreadsheetId: config.spreadsheetId || '',
      sheetName: config.sheetName || 'OperationalData',
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return {
        success: true,
        message: 'Connection verified: Google Apps Script Webhook responded successfully (HTTP 200).',
      };
    } else {
      return {
        success: false,
        message: `Connection test received status ${response.status}: ${response.statusText}`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network test error';
    return {
      success: false,
      message: `Failed to reach Google Spreadsheet Webhook: ${msg}`,
    };
  }
}
