export interface AnomalyIssue {
  field: 'P1_7' | 'P3_0' | 'realPower';
  fieldLabel: string;
  value: number;
  rawStr?: string;
  expectedRule: string;
  message: string;
}

export interface RecordAnomalyReport {
  recordIndex?: number;
  date?: string;
  time?: string;
  hasAnomalies: boolean;
  issues: AnomalyIssue[];
  // Full snapshot of the row's operational parameters
  rowData: {
    P1_7: number | string;
    P3_0: number | string;
    pr?: number | string;
    realPower: number | string;
    pbSynthesis?: number | string | null;
  };
}

/**
 * Checks a single operational record or input form for potential anomalies based on defined operational bounds:
 * 1. P1.7: Range 12.0 - 15.0 PSIA.
 * 2. P3.0: 3 main digits (100 - 999), typical range 200 - 385 PSIA.
 * 3. Real Power: Not more than 50 MW (<= 50 MW).
 */
export function validateRecordAnomalies(
  data: {
    P1_7: number | string;
    P3_0: number | string;
    realPower: number | string;
    pbSynthesis?: number | string | null;
    date?: string;
    time?: string;
  },
  recordIndex?: number
): RecordAnomalyReport {
  const issues: AnomalyIssue[] = [];

  const parseVal = (v: number | string | undefined | null): { num: number; rawStr: string } => {
    if (v === undefined || v === null) return { num: 0, rawStr: '' };
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
      rawStr: p1.rawStr,
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
      rawStr: p3.rawStr,
      expectedRule: 'Harus 3 digit utama (contoh: 238,32) & rentang 200 – 385 PSIA',
      message: `P3.0 (${p3.rawStr || p3.num} PSIA) harus terdiri dari 3 digit utama (contoh: 238,32).`,
    });
  } else if (p3.num < 200.0 || p3.num > 385.0) {
    const diff = p3.num < 200.0 ? (200.0 - p3.num).toFixed(1) : (p3.num - 385.0).toFixed(1);
    const direction = p3.num < 200.0 ? `kurang ${diff} PSIA dari batas bawah 200 PSIA` : `melebihi ${diff} PSIA dari batas atas 385 PSIA`;
    issues.push({
      field: 'P3_0',
      fieldLabel: 'P3.0 (Discharge Pressure)',
      value: p3.num,
      rawStr: p3.rawStr,
      expectedRule: 'Rentang normal: 200 – 385 PSIA',
      message: `P3.0 (${p3.rawStr || p3.num} PSIA) di luar rentang normal 200 – 385 PSIA (${direction}).`,
    });
  }

  // 3. Real Power: <= 50 MW
  const pw = parseVal(data.realPower);
  if (pw.num > 50.0) {
    const diff = (pw.num - 50.0).toFixed(1);
    issues.push({
      field: 'realPower',
      fieldLabel: 'Real Power',
      value: pw.num,
      rawStr: pw.rawStr,
      expectedRule: 'Batas maksimal: 50 MW',
      message: `Real Power (${pw.rawStr || pw.num} MW) melebihi batas maksimal 50 MW (+${diff} MW).`,
    });
  } else if (pw.num <= 0) {
    issues.push({
      field: 'realPower',
      fieldLabel: 'Real Power',
      value: pw.num,
      rawStr: pw.rawStr,
      expectedRule: 'Harus > 0 MW (maksimal 50 MW)',
      message: `Real Power (${pw.rawStr || pw.num} MW) bernilai 0 atau negatif.`,
    });
  }

  const prVal = (p1.num > 0 && p3.num > 0) ? (p3.num / p1.num).toFixed(4) : undefined;

  return {
    recordIndex,
    date: data.date,
    time: data.time,
    hasAnomalies: issues.length > 0,
    issues,
    rowData: {
      P1_7: p1.rawStr || p1.num,
      P3_0: p3.rawStr || p3.num,
      pr: prVal,
      realPower: pw.rawStr || pw.num,
      pbSynthesis: data.pbSynthesis,
    },
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
    pbSynthesis?: number | string | null;
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
