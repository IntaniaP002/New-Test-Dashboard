import { OperationalInput } from '../types';

export interface ColumnMappingResult {
  mappedHeaders: {
    targetField: keyof OperationalInput | 'PR';
    detectedColumn: string;
    columnIndex: number;
    confidence: 'high' | 'medium' | 'manual';
  }[];
  unmappedColumns: {
    columnName: string;
    columnIndex: number;
  }[];
  detectedDelimiter: string;
  hasHeaders: boolean;
  totalRawRows: number;
  extractedRecords: OperationalInput[];
  warnings: string[];
}

// Synonyms dictionary for Diamond application tags, Indonesian technical terms, and standard nomenclature
export const FIELD_PATTERNS: Record<string, string[]> = {
  date: [
    'date', 'tanggal', 'tgl', 'timestamp', 'time_stamp', 'reading_date', 'datetime', 'tgl_log',
    'log_date', 'entry_date', 'waktu_catat', 'created_at'
  ],
  time: [
    'time', 'jam', 'waktu', 'hour', 'pukul', 'log_time', 'time_log', 'hh:mm', 'hh:mm:ss'
  ],
  T1_7: [
    't1.7', 't17', 't1_7', 'tinlet', 't_inlet', 'inlet_temp', 'inlet temp', 'compressor inlet temp',
    'cit', 'suhu_inlet', 'suhu inlet', 'suhu masuk', 't_in', 'temp_inlet', 't1'
  ],
  P1_7: [
    'p1.7', 'p17', 'p1_7', 'pinlet', 'p_inlet', 'inlet_press', 'inlet press', 'inlet pressure',
    'cip', 'tekanan_inlet', 'tekanan inlet', 'tekanan masuk', 'p_in', 'press_inlet', 'p1'
  ],
  P3_0: [
    'p3.0', 'p30', 'p3_0', 'pdisch', 'p_disch', 'discharge_press', 'discharge pressure', 'cdp',
    'compressor discharge pressure', 'p3', 'tekanan_discharge', 'tekanan buang', 'p_out', 'tekanan_kompresor'
  ],
  PR: [
    'pr', 'pressure ratio', 'pressure_ratio', 'rasio tekanan', 'rasio_tekanan', 'rc'
  ],
  realPower: [
    'realpower', 'real_power', 'real power', 'power', 'mw', 'megawatt', 'generator output',
    'gross mw', 'gross_mw', 'net mw', 'load', 'beban', 'daya', 'daya aktif', 'active power',
    'gen_mw', 'power_output', 'gross_power'
  ],
  nphr: [
    'nphr', 'heat_rate', 'heat rate', 'heatrate', 'hr', 'spesific fuel consumption',
    'sfc', 'laju kalor', 'laju_kalor', 'heat_consumption', 'heat_rate_gross', 'gross_nphr'
  ],
  isWaterWashEvent: [
    'ww', 'wash', 'water_wash', 'waterwash', 'event', 'is_ww', 'isww', 'cuci', 'washing',
    'water wash event', 'tag_ww', 'status_ww'
  ],
};

/**
 * Detect CSV delimiter (comma, semicolon, or tab)
 */
export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).filter(l => l.trim().length > 0);
  if (firstLines.length === 0) return ',';

  const commaCounts = firstLines.map(l => (l.match(/,/g) || []).length);
  const semicolonCounts = firstLines.map(l => (l.match(/;/g) || []).length);
  const tabCounts = firstLines.map(l => (l.match(/\t/g) || []).length);

  const avgComma = commaCounts.reduce((a, b) => a + b, 0) / firstLines.length;
  const avgSemicolon = semicolonCounts.reduce((a, b) => a + b, 0) / firstLines.length;
  const avgTab = tabCounts.reduce((a, b) => a + b, 0) / firstLines.length;

  if (avgTab > avgComma && avgTab > avgSemicolon) return '\t';
  if (avgSemicolon > avgComma) return ';';
  return ',';
}

/**
 * Clean string tokens and handle Indonesian comma decimals (e.g. "241,4" -> "241.4")
 */
export function cleanNumericValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/["']/g, '');
  if (trimmed === '' || trimmed === '-' || trimmed.toLowerCase() === 'nan' || trimmed.toLowerCase() === 'null') {
    return null;
  }

  // Handle formatted number like 1.234,56 or 1,234.56 or 241,4
  let normalized = trimmed;
  // If has comma as decimal separator (e.g. 238,70 or 2.927,02)
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes('.') && normalized.includes(',')) {
    // If dot comes first and comma later (European/Indonesian: 2.927,021)
    if (normalized.indexOf('.') < normalized.indexOf(',')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      // US format with thousand comma (2,927.021)
      normalized = normalized.replace(/,/g, '');
    }
  }

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Standardize date strings into YYYY-MM-DD
 */
export function standardizeDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const trimmed = raw.trim().replace(/["']/g, '');

  // If already YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  return trimmed.slice(0, 10);
}

/**
 * Standardize time strings into HH:MM
 */
export function standardizeTime(raw: string | undefined): string {
  if (!raw) return '12:00';
  const trimmed = raw.trim().replace(/["']/g, '');

  // Extract HH:MM
  const match = trimmed.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    return `${hh}:${mm}`;
  }

  // Integer hour like "20" -> "20:00"
  const hrOnly = trimmed.match(/^(\d{1,2})$/);
  if (hrOnly) {
    return `${hrOnly[1].padStart(2, '0')}:00`;
  }

  return '12:00';
}

/**
 * Automatically inspects raw text table (from Diamond or Excel), recognizes columns in ANY order,
 * extracts and transforms the data into our standardized system format.
 */
export function autoNormalizeDiamondData(
  text: string,
  fileName?: string,
  manualMappingOverrides?: Record<string, number> // targetField -> colIndex
): ColumnMappingResult {
  const delimiter = detectDelimiter(text);
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return {
      mappedHeaders: [],
      unmappedColumns: [],
      detectedDelimiter: delimiter,
      hasHeaders: false,
      totalRawRows: 0,
      extractedRecords: [],
      warnings: ['File is empty'],
    };
  }

  // Header inspection
  const headerLine = lines[0];
  const rawHeaders = headerLine.split(delimiter).map(h => h.replace(/["']/g, '').trim());
  const lowerHeaders = rawHeaders.map(h => h.toLowerCase());

  // Find column index for each field
  const findColumn = (targetField: string, patterns: string[]): { index: number; colName: string; conf: 'high' | 'medium' } => {
    // 1. Check override
    if (manualMappingOverrides && manualMappingOverrides[targetField] !== undefined) {
      const idx = manualMappingOverrides[targetField];
      return { index: idx, colName: rawHeaders[idx] || `Col ${idx}`, conf: 'high' };
    }

    // 2. Exact match
    for (let i = 0; i < lowerHeaders.length; i++) {
      const h = lowerHeaders[i];
      if (patterns.includes(h)) {
        return { index: i, colName: rawHeaders[i], conf: 'high' };
      }
    }

    // 3. Substring / contains match
    for (let i = 0; i < lowerHeaders.length; i++) {
      const h = lowerHeaders[i];
      if (patterns.some(p => h.includes(p) || p.includes(h))) {
        return { index: i, colName: rawHeaders[i], conf: 'medium' };
      }
    }

    return { index: -1, colName: '', conf: 'medium' };
  };

  const colDate = findColumn('date', FIELD_PATTERNS.date);
  const colTime = findColumn('time', FIELD_PATTERNS.time);
  const colT17 = findColumn('T1_7', FIELD_PATTERNS.T1_7);
  const colP17 = findColumn('P1_7', FIELD_PATTERNS.P1_7);
  const colP30 = findColumn('P3_0', FIELD_PATTERNS.P3_0);
  const colPR = findColumn('PR', FIELD_PATTERNS.PR);
  const colPower = findColumn('realPower', FIELD_PATTERNS.realPower);
  const colNphr = findColumn('nphr', FIELD_PATTERNS.nphr);
  const colWW = findColumn('isWaterWashEvent', FIELD_PATTERNS.isWaterWashEvent);

  const mappedIndices = new Set([
    colDate.index, colTime.index, colT17.index, colP17.index,
    colP30.index, colPR.index, colPower.index, colNphr.index, colWW.index
  ].filter(i => i >= 0));

  const unmappedColumns = rawHeaders
    .map((h, i) => ({ columnName: h, columnIndex: i }))
    .filter(c => !mappedIndices.has(c.columnIndex));

  const mappedHeaders: ColumnMappingResult['mappedHeaders'] = [
    { targetField: 'date', detectedColumn: colDate.colName, columnIndex: colDate.index, confidence: colDate.conf },
    { targetField: 'time', detectedColumn: colTime.colName, columnIndex: colTime.index, confidence: colTime.conf },
    { targetField: 'P1_7', detectedColumn: colP17.colName, columnIndex: colP17.index, confidence: colP17.conf },
    { targetField: 'P3_0', detectedColumn: colP30.colName, columnIndex: colP30.index, confidence: colP30.conf },
    { targetField: 'realPower', detectedColumn: colPower.colName, columnIndex: colPower.index, confidence: colPower.conf },
    { targetField: 'nphr', detectedColumn: colNphr.colName, columnIndex: colNphr.index, confidence: colNphr.conf },
  ];

  if (colT17.index >= 0) {
    mappedHeaders.push({ targetField: 'T1_7', detectedColumn: colT17.colName, columnIndex: colT17.index, confidence: colT17.conf });
  }

  if (colWW.index >= 0) {
    mappedHeaders.push({ targetField: 'isWaterWashEvent', detectedColumn: colWW.colName, columnIndex: colWW.index, confidence: colWW.conf });
  }

  const warnings: string[] = [];

  // Required fields check (P1.7, P3.0, Real Power, NPHR)
  const missingRequired: string[] = [];
  if (colP17.index === -1) missingRequired.push('P1.7 (Compressor Inlet Press)');
  if (colP30.index === -1) missingRequired.push('P3.0 (Compressor Discharge Press)');
  if (colPower.index === -1) missingRequired.push('Real Power (MW)');
  if (colNphr.index === -1) missingRequired.push('NPHR (Heat Rate)');

  if (missingRequired.length > 0) {
    warnings.push(`Missing parameters: ${missingRequired.join(', ')}. Please assign column positions manually.`);
  }

  const extractedRecords: OperationalInput[] = [];

  // Parse rows (starting from line 1)
  for (let r = 1; r < lines.length; r++) {
    const rawLine = lines[r];
    const cells = rawLine.split(delimiter).map(c => c.replace(/["']/g, '').trim());

    const tVal = colT17.index >= 0 ? cleanNumericValue(cells[colT17.index]) : undefined;
    const p1Val = colP17.index >= 0 ? cleanNumericValue(cells[colP17.index]) : null;
    const p3Val = colP30.index >= 0 ? cleanNumericValue(cells[colP30.index]) : null;
    const pwVal = colPower.index >= 0 ? cleanNumericValue(cells[colPower.index]) : null;
    const hrVal = colNphr.index >= 0 ? cleanNumericValue(cells[colNphr.index]) : null;

    // Check if valid row (T1.7 is not required)
    if (p1Val === null || p3Val === null || pwVal === null || hrVal === null) {
      continue;
    }

    // Handle date and time
    let dateStr = colDate.index >= 0 ? standardizeDate(cells[colDate.index]) : new Date().toISOString().slice(0, 10);
    let timeStr = colTime.index >= 0 ? standardizeTime(cells[colTime.index]) : '20:00';

    // If timestamp was in single datetime cell (e.g. "2024-11-05 20:00:00")
    if (colDate.index >= 0 && colTime.index === -1) {
      const rawDt = cells[colDate.index];
      if (rawDt && (rawDt.includes(' ') || rawDt.includes('T'))) {
        const parts = rawDt.replace('T', ' ').split(' ');
        dateStr = standardizeDate(parts[0]);
        timeStr = standardizeTime(parts[1]);
      }
    }

    // Default WW tag to false so user chooses manually when data is displayed
    let isWW = false;
    if (colWW.index >= 0 && cells[colWW.index]) {
      const v = cells[colWW.index].toLowerCase().trim();
      isWW = v === 'yes' || v === 'y' || v === '1' || v === 'true';
    }

    extractedRecords.push({
      date: dateStr,
      time: timeStr,
      T1_7: tVal,
      P1_7: p1Val,
      P3_0: p3Val,
      realPower: pwVal,
      nphr: hrVal,
      isWaterWashEvent: isWW,
      notes: isWW ? 'Water Wash Event' : undefined,
    });
  }

  return {
    mappedHeaders,
    unmappedColumns,
    detectedDelimiter: delimiter,
    hasHeaders: true,
    totalRawRows: lines.length - 1,
    extractedRecords,
    warnings,
  };
}

/**
 * Format records back into our standard standardized CSV export format
 */
export function exportToStandardCsv(records: OperationalInput[]): string {
  const header = 'Date,Time,P1.7,P3.0,PR,RealPower,NPHR,IsWaterWash';
  const rows = records.map(r => {
    const pr = r.P1_7 > 0 ? (r.P3_0 / r.P1_7).toFixed(4) : '';
    return `${r.date},${r.time},${r.P1_7},${r.P3_0},${pr},${r.realPower},${r.nphr},${r.isWaterWashEvent ? 'YES' : 'NO'}`;
  });
  return [header, ...rows].join('\n');
}
