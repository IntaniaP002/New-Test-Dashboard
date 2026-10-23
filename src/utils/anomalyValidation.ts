export interface AnomalyIssue {
  field: 'P1_7' | 'P3_0' | 'realPower' | 'nphr';
  fieldLabel: string;
  value: number;
  expectedRule: string;
  message: string;
}

export interface RecordAnomalyReport {
  recordIndex?: number;
  date?: string;
  time?: string;
  hasAnomalies: boolean;
  issues: AnomalyIssue[];
}

/**
 * Checks a single operational record or input form for potential anomalies based on defined operational bounds:
 * 1. P1.7: Range 12.0 - 15.0 PSIA.
 * 2. P3.0: 3 main digits (100 - 999), typical range 200 - 385 PSIA.
 * 3. Real Power: Not more than 50 MW (<= 50 MW).
 * 4. NPHR: 4 main digits (1000 - 9999), not more than 5000 kcal/kWh (<= 5000).
 */
export function validateRecordAnomalies(
  data: {
    P1_7: number | string;
    P3_0: number | string;
    realPower: number | string;
    nphr: number | string;
    date?: string;
    time?: string;
  },
  recordIndex?: number
): RecordAnomalyReport {
  const issues: AnomalyIssue[] = [];

  const parseVal = (v: number | string): { num: number; rawStr: string } => {
    if (typeof v === 'number') return { num: v, rawStr: String(v) };
    const cleaned = String(v).trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    return { num: isNaN(parsed) ? 0 : parsed, rawStr: String(v).trim() };
  };

  const getIntPartLength = (rawStr: string, numVal: number): number => {
    const match = rawStr.match(/^\s*[-+]?(\d+)/);
    if (match && match[1]) {
      return match[1].length;
    }
    return Math.floor(Math.abs(numVal)).toString().length;
  };

  // 1. P1.7: 12 - 15 PSIA
  const p1 = parseVal(data.P1_7);
  if (p1.num < 12.0 || p1.num > 15.0) {
    issues.push({
      field: 'P1_7',
      fieldLabel: 'P1.7 (Inlet Pressure)',
      value: p1.num,
      expectedRule: 'Rentang normal: 12 – 15 PSIA',
      message: `P1.7 (${p1.rawStr || p1.num} PSIA) berada di luar rentang normal 12 – 15 PSIA.`,
    });
  }

  // 2. P3.0: 3 main digits & 200 - 385 PSIA
  const p3 = parseVal(data.P3_0);
  const p3IntDigits = getIntPartLength(p3.rawStr, p3.num);
  if (p3IntDigits !== 3) {
    issues.push({
      field: 'P3_0',
      fieldLabel: 'P3.0 (Discharge Pressure)',
      value: p3.num,
      expectedRule: 'Harus 3 digit utama (contoh: 238,32) & rentang 200 – 385 PSIA',
      message: `P3.0 (${p3.rawStr || p3.num}) harus terdiri dari 3 digit utama (contoh: 238,32).`,
    });
  } else if (p3.num < 200.0 || p3.num > 385.0) {
    issues.push({
      field: 'P3_0',
      fieldLabel: 'P3.0 (Discharge Pressure)',
      value: p3.num,
      expectedRule: 'Rentang normal: 200 – 385 PSIA',
      message: `P3.0 (${p3.num} PSIA) di luar rentang normal 200 – 385 PSIA.`,
    });
  }

  // 3. Real Power: <= 50 MW
  const pw = parseVal(data.realPower);
  if (pw.num > 50.0) {
    issues.push({
      field: 'realPower',
      fieldLabel: 'Real Power',
      value: pw.num,
      expectedRule: 'Batas maksimal: 50 MW',
      message: `Real Power (${pw.rawStr || pw.num} MW) melebihi batas maksimal 50 MW.`,
    });
  } else if (pw.num <= 0) {
    issues.push({
      field: 'realPower',
      fieldLabel: 'Real Power',
      value: pw.num,
      expectedRule: 'Harus > 0 MW (maksimal 50 MW)',
      message: `Real Power (${pw.rawStr || pw.num} MW) bernilai 0 atau negatif.`,
    });
  }

  // 4. NPHR: 4 main digits & <= 5000 kcal/kWh
  const hr = parseVal(data.nphr);
  const hrIntDigits = getIntPartLength(hr.rawStr, hr.num);
  if (hrIntDigits !== 4) {
    issues.push({
      field: 'nphr',
      fieldLabel: 'NPHR (Heat Rate)',
      value: hr.num,
      expectedRule: 'Harus 4 digit utama (contoh: 3220,9089) & maksimal 5000 kcal/kWh',
      message: `NPHR (${hr.rawStr || hr.num}) harus terdiri dari 4 digit utama (contoh: 3220,9089).`,
    });
  } else if (hr.num > 5000.0) {
    issues.push({
      field: 'nphr',
      fieldLabel: 'NPHR (Heat Rate)',
      value: hr.num,
      expectedRule: 'Batas maksimal: 5000 kcal/kWh',
      message: `NPHR (${hr.num} kcal/kWh) melebihi batas maksimal 5000 kcal/kWh.`,
    });
  }

  return {
    recordIndex,
    date: data.date,
    time: data.time,
    hasAnomalies: issues.length > 0,
    issues,
  };
}

/**
 * Validates a list of records (e.g. from CSV / Excel file import)
 * and returns all reports for records containing detected anomalies.
 */
export function scanRecordsForAnomalies<
  T extends {
    P1_7: number | string;
    P3_0: number | string;
    realPower: number | string;
    nphr: number | string;
    date?: string;
    time?: string;
  }
>(records: T[]): RecordAnomalyReport[] {
  const reports: RecordAnomalyReport[] = [];
  records.forEach((rec, idx) => {
    const report = validateRecordAnomalies(rec, idx + 1);
    if (report.hasAnomalies) {
      reports.push(report);
    }
  });
  return reports;
}
