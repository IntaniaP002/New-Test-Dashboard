import { OperationalInput } from '../types';
import * as XLSX from 'xlsx';

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
    'log_date', 'entry_date', 'waktu_catat', 'created_at', 'tanggal (yyyy-mm-dd)', 'tgl/date', 'day',
    'waktu & tanggal', 'tanggal & waktu', 'waktu dan tanggal', 'tgl & jam', 'datetime (utc)', 'record date', 'date/time'
  ],
  time: [
    'time', 'jam', 'waktu', 'hour', 'pukul', 'log_time', 'time_log', 'hh:mm', 'hh:mm:ss', 'waktu (hh:mm)',
    'jam log', 'waktu pengambilan', 'time (hh:mm)'
  ],
  T1_7: [
    't1.7', 't17', 't1_7', 'tinlet', 't_inlet', 'inlet_temp', 'inlet temp', 'compressor inlet temp',
    'cit', 'suhu_inlet', 'suhu inlet', 'suhu masuk', 't_in', 'temp_inlet', 't1', 't1.7 (°f)',
    't1.7(°f)', 't1.7 (f)', 't1.7(f)', 't 1.7', 't1_7 (°f)', 't1.7 (deg f)', 't1.7 f', 'suhu (°f)'
  ],
  P1_7: [
    'p1.7', 'p17', 'p1_7', 'pinlet', 'p_inlet', 'inlet_press', 'inlet press', 'inlet pressure',
    'cip', 'tekanan_inlet', 'tekanan inlet', 'tekanan masuk', 'p_in', 'press_inlet', 'p1',
    'pt006', 'pt 006', 'p1.7 / pt006', 'p1.7 (psia)', 'p1.7 / pt006 (psia)', 'pt-006', 'pt_006', 'p 1.7', 'pt6',
    'pt006 (psia)', 'pt006(psia)', 'pt006 psia', 'tekanan pt006', 'tekanan pt-006', 'inlet pt006', 'pt 006 (psia)'
  ],
  P3_0: [
    'p3.0', 'p30', 'p3_0', 'pdisch', 'p_disch', 'discharge_press', 'discharge pressure', 'cdp',
    'compressor discharge pressure', 'p3', 'tekanan_discharge', 'tekanan buang', 'p_out', 'tekanan_kompresor',
    'pt007', 'pt 007', 'p3.0 / pt007', 'p3.0 (psia)', 'p3.0 / pt007 (psia)', 'pt-007', 'pt_007', 'p 3.0', 'pt7',
    'pb aktual', 'pb testing', 'pb target', 'testing pt007', 'pt007 (psia)', 'pt007(psia)', 'pt007 psia',
    '★ pt007', 'pt007 testing', 'tekanan pt007', 'tekanan pt-007', 'discharge pt007', 'pt 007 (psia)', 'pb testing (pt007)'
  ],
  PR: [
    'pr', 'pressure ratio', 'pressure_ratio', 'rasio tekanan', 'rasio_tekanan', 'rc', 'pr (calc)'
  ],
  realPower: [
    'realpower', 'real_power', 'real power', 'power', 'mw', 'megawatt', 'generator output',
    'gross mw', 'gross_mw', 'net mw', 'load', 'beban', 'beban (mw)', 'beban(mw)', 'daya', 'daya aktif',
    'active power', 'gen_mw', 'power_output', 'gross_power', 'real power (mw)', 'beban turbin', 'beban turbin (mw)',
    'turbin mw', 'load (mw)', 'beban mw', 'mw turbin', 'turbin (mw)', 'generator (mw)'
  ],
  nhSpeed: [
    'nhspeed', 'nh_speed', 'nh speed', 'nh', 'speed', 'rpm', 'kecepatan_nh', 'kecepatan nh', 'speedronic',
    'nh speed (rpm)', 'nh speed(rpm)', 'nh (rpm)', 'n-high', 'nh raw', 'speed (rpm)'
  ],
  pbSynthesis: [
    'pbsynthesis', 'pb_synthesis', 'pbsyn', 'pb_syn', 'pb synthesis', 'pb syn',
    'pb synthesis (nh)', 'pb_syn_nh', 'synthesis pb', 'tekanan pb synthesis', 'pb synthesis (psia)'
  ],
  isWaterWashEvent: [
    'ww', 'wash', 'water_wash', 'waterwash', 'event', 'is_ww', 'isww', 'cuci', 'washing',
    'water wash event', 'tag_ww', 'status_ww'
  ],
};

/**
 * Split a CSV line respecting quoted values containing commas
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',') {
    return line.split(delimiter).map(c => c.replace(/["']/g, '').trim());
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

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
 * Standardize date strings into YYYY-MM-DD, supporting Excel serial numbers, month names, 2-digit years, and MM/DD vs DD/MM
 */
export function standardizeDate(raw: string | number | Date | undefined): string {
  if (raw === undefined || raw === null || raw === '') {
    return new Date().toISOString().slice(0, 10);
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 1. If it's a numeric Excel serial date code (e.g. 46327, 46327.7916, or "46327")
  const rawStr = typeof raw === 'string' ? raw.trim() : '';
  const numVal =
    typeof raw === 'number'
      ? raw
      : /^\d{5}(\.\d+)?$/.test(rawStr)
      ? parseFloat(rawStr)
      : NaN;
  if (!isNaN(numVal) && numVal >= 35000 && numVal <= 65000) {
    try {
      const dc = XLSX.SSF.parse_date_code(Math.floor(numVal));
      if (dc && dc.y && dc.m && dc.d) {
        return `${dc.y}-${String(dc.m).padStart(2, '0')}-${String(dc.d).padStart(2, '0')}`;
      }
    } catch {
      // fallback
    }
  }

  const trimmed = String(raw).trim().replace(/["']/g, '');

  // 2. Inverted dates previously stored in database (e.g. 2026-01-11 through 2026-05-11 -> 2026-11-01 through 2026-11-05)
  const invNovMatch = trimmed.match(/^(\d{4})-(0[1-5])-11$/);
  if (invNovMatch) {
    return `${invNovMatch[1]}-11-${invNovMatch[2]}`;
  }
  const invOctMatch = trimmed.match(/^(\d{4})-(0[1-5])-10$/);
  if (invOctMatch) {
    return `${invOctMatch[1]}-10-${invOctMatch[2]}`;
  }

  // 3. Named month format: e.g. "01-Nov-2026", "1 Nov 2026", "1 November 2026", "1-Nop-2026", "Nov 1, 2026", "05-Nov-2026"
  const monthMap: Record<string, string> = {
    jan: '01', januari: '01', january: '01',
    feb: '02', februari: '02', february: '02',
    mar: '03', maret: '03', march: '03',
    apr: '04', april: '04',
    mei: '05', may: '05',
    jun: '06', juni: '06', june: '06',
    jul: '07', juli: '07', july: '07',
    agu: '08', agt: '08', agustus: '08', aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    okt: '10', oct: '10', oktober: '10', october: '10',
    nov: '11', nop: '11', november: '11', nopember: '11',
    des: '12', dec: '12', desember: '12', december: '12',
  };

  const textMonthMatch = trimmed.match(/^(\d{1,2})[-/.\s]+([a-zA-Z]+)[-/.\s]+(\d{2,4})/);
  if (textMonthMatch) {
    const d = textMonthMatch[1].padStart(2, '0');
    const mName = textMonthMatch[2].toLowerCase();
    const rawY = textMonthMatch[3];
    const y = rawY.length === 2 ? (parseInt(rawY, 10) < 70 ? `20${rawY}` : `19${rawY}`) : rawY;
    const m = monthMap[mName];
    if (m) {
      return `${y}-${m}-${d}`;
    }
  }

  const monthFirstTextMatch = trimmed.match(/^([a-zA-Z]+)[-/.\s]+(\d{1,2})[,/-/\s]+(\d{2,4})/);
  if (monthFirstTextMatch) {
    const mName = monthFirstTextMatch[1].toLowerCase();
    const d = monthFirstTextMatch[2].padStart(2, '0');
    const rawY = monthFirstTextMatch[3];
    const y = rawY.length === 2 ? (parseInt(rawY, 10) < 70 ? `20${rawY}` : `19${rawY}`) : rawY;
    const m = monthMap[mName];
    if (m) {
      return `${y}-${m}-${d}`;
    }
  }

  // 4. ISO format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 5. 4-digit year at end: DD-MM-YYYY or MM-DD-YYYY (e.g. 01/10/2026, 11/01/2026, 24/10/2026)
  const end4YearMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (end4YearMatch) {
    const p1 = parseInt(end4YearMatch[1], 10);
    const p2 = parseInt(end4YearMatch[2], 10);
    const y = end4YearMatch[3];
    if (p1 > 12) {
      // p1 is day (>12), p2 is month (e.g. 24/10/2026)
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    if (p2 > 12) {
      // p2 is day (>12), p1 is month (e.g. 10/24/2026)
      return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    // If p1 is 10 or 11 (October or November) and p2 <= 12, in SheetJS / US Excel export format,
    // p1 is the month (10=Oct, 11=Nov) and p2 is the day (1..5)
    if (p1 === 10 || p1 === 11) {
      return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    if (p2 === 10 || p2 === 11) {
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    // Default in Indonesia / International is DD-MM-YYYY
    return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  // 6. 2-digit year at end: e.g. 11/1/26, 11/5/26, 24/10/26, 01/10/26
  const end2YearMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?!\d)/);
  if (end2YearMatch) {
    const p1 = parseInt(end2YearMatch[1], 10);
    const p2 = parseInt(end2YearMatch[2], 10);
    const y2 = parseInt(end2YearMatch[3], 10);
    const fullYear = y2 < 70 ? 2000 + y2 : 1900 + y2;

    if (p1 > 12) {
      return `${fullYear}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    if (p2 > 12) {
      return `${fullYear}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    // If p1 is 10 or 11 (October or November), in SheetJS M/D/YY format, p1 is month!
    if (p1 === 10 || p1 === 11) {
      return `${fullYear}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    if (p2 === 10 || p2 === 11) {
      return `${fullYear}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    // Default Day/Month/Year for international format
    return `${fullYear}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  // 7. 2-digit year at start: e.g. 26/10/24 or 26-10-01
  const start2YearMatch = trimmed.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (start2YearMatch) {
    const y2 = parseInt(start2YearMatch[1], 10);
    const p1 = parseInt(start2YearMatch[2], 10);
    const p2 = parseInt(start2YearMatch[3], 10);
    const fullYear = y2 < 70 ? 2000 + y2 : 1900 + y2;
    return `${fullYear}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
  }

  return trimmed.slice(0, 10);
}

/**
 * Standardize time strings (supports HH:MM:SS, HH.MM.SS, HH:MM, HH.MM, AM/PM, and Excel serial time fractions)
 */
export function standardizeTime(raw: string | number | Date | undefined): string {
  if (raw === undefined || raw === null || raw === '') return '12:00';

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const hh = String(raw.getHours()).padStart(2, '0');
    const mm = String(raw.getMinutes()).padStart(2, '0');
    const ss = String(raw.getSeconds()).padStart(2, '0');
    return ss !== '00' ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  }

  // Handle Excel serial time (0 <= x < 1) or Excel serial datetime (x >= 35000 with fractional part)
  const rawStr = typeof raw === 'string' ? raw.trim() : '';
  const isExcelSerial =
    typeof raw === 'number' ||
    /^0?\.\d+$/.test(rawStr) ||
    /^\d{5}\.\d+$/.test(rawStr);
  if (isExcelSerial) {
    const num = typeof raw === 'number' ? raw : parseFloat(rawStr);
    if (!isNaN(num) && num >= 0 && (num < 1 || num >= 35000)) {
      const fraction = num - Math.floor(num);
      const totalSeconds = Math.round(fraction * 86400);
      const hh = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
      const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const ss = String(totalSeconds % 60).padStart(2, '0');
      return ss !== '00' ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
    }
  }

  let trimmed = String(raw).trim().replace(/["']/g, '');

  // If string includes a date prefix like "2026-11-12 19:00:00" or "2026-11-12T19:00:00Z", extract the time part
  const combinedMatch = trimmed.match(/^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})[\sT]+(.+)$/);
  if (combinedMatch) {
    trimmed = combinedMatch[1].replace(/Z$/i, '').trim();
  }

  // Handle AM/PM e.g. "7:05:10 PM" or "07:30 AM"
  const amPmMatch = trimmed.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(AM|PM)$/i);
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10);
    const m = amPmMatch[2];
    const s = amPmMatch[3];
    const meridiem = amPmMatch[4].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    const hh = String(h).padStart(2, '0');
    return s && s !== '00' ? `${hh}:${m}:${s}` : `${hh}:${m}`;
  }

  // Extract HH:MM:SS or HH.MM.SS
  const matchSec = trimmed.match(/^(\d{1,2})[:.](\d{2})[:.](\d{2})/);
  if (matchSec) {
    const hh = matchSec[1].padStart(2, '0');
    const mm = matchSec[2];
    const ss = matchSec[3];
    return `${hh}:${mm}:${ss}`;
  }

  // Extract HH:MM or HH.MM
  const match = trimmed.match(/^(\d{1,2})[:.](\d{2})/);
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

  // Helper to safely determine if a candidate cell matches a target field pattern (ignoring pure numbers, dates, times, and empty strings)
  const isCandidateHeaderCell = (cellValue: string, patterns: string[]): boolean => {
    if (!cellValue) return false;
    const trimmed = cellValue.replace(/["']/g, '').trim().toLowerCase();
    if (trimmed.length < 2) return false;

    // Check if cell is a pure number, ISO/slash date, or time format -> definitely data, not a header
    if (!isNaN(Number(trimmed.replace(/,/g, '.')))) return false;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(trimmed)) return false;
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(trimmed)) return false;
    if (/^\d{1,2}[:.]\d{2}/.test(trimmed)) return false;

    return patterns.some((p) => {
      if (trimmed === p) return true;
      if (p.length >= 2 && trimmed.includes(p)) return true;
      if (trimmed.length >= 3 && p.includes(trimmed)) return true;
      return false;
    });
  };

  // Dynamically scan the first 25 lines to find the true header row (the line matching the highest number of known fields)
  let bestHeaderRowIndex = 0;
  let maxMatchedFields = -1;
  const maxScanLines = Math.min(25, lines.length);

  for (let l = 0; l < maxScanLines; l++) {
    const candidateCells = splitCsvLine(lines[l], delimiter);
    if (candidateCells.length < 2) continue;

    let score = 0;
    for (const [, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (candidateCells.some((h) => isCandidateHeaderCell(h, patterns))) {
        score++;
      }
    }
    if (score > maxMatchedFields) {
      maxMatchedFields = score;
      bestHeaderRowIndex = l;
    }
  }

  // Header inspection using the detected true header row
  const headerLine = lines[bestHeaderRowIndex];
  const rawHeaders = splitCsvLine(headerLine, delimiter);
  const lowerHeaders = rawHeaders.map(h => h.toLowerCase().trim());

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
      if (!h) continue;
      if (patterns.includes(h)) {
        return { index: i, colName: rawHeaders[i], conf: 'high' };
      }
    }

    // 3. Substring match (ensure h is non-empty and has at least 2 chars)
    for (let i = 0; i < lowerHeaders.length; i++) {
      const h = lowerHeaders[i];
      if (!h || h.length < 2) continue;
      if (patterns.some(p => (p.length >= 2 && h.includes(p)) || (h.length >= 3 && p.includes(h)))) {
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
  const colNHSpeed = findColumn('nhSpeed', FIELD_PATTERNS.nhSpeed);
  const colPbSyn = findColumn('pbSynthesis', FIELD_PATTERNS.pbSynthesis);
  const colWW = findColumn('isWaterWashEvent', FIELD_PATTERNS.isWaterWashEvent);

  const mappedIndices = new Set([
    colDate.index, colTime.index, colT17.index, colP17.index,
    colP30.index, colPR.index, colPower.index, colNHSpeed.index, colPbSyn.index, colWW.index
  ].filter(i => i >= 0));

  const unmappedColumns = rawHeaders
    .map((h, i) => ({ columnName: h, columnIndex: i }))
    .filter(c => !mappedIndices.has(c.columnIndex));

  const mappedHeaders: ColumnMappingResult['mappedHeaders'] = [
    { targetField: 'date', detectedColumn: colDate.colName, columnIndex: colDate.index, confidence: colDate.conf },
    { targetField: 'time', detectedColumn: colTime.colName, columnIndex: colTime.index, confidence: colTime.conf },
    { targetField: 'realPower', detectedColumn: colPower.colName, columnIndex: colPower.index, confidence: colPower.conf },
  ];

  if (colNHSpeed.index >= 0) {
    mappedHeaders.push({ targetField: 'nhSpeed', detectedColumn: colNHSpeed.colName, columnIndex: colNHSpeed.index, confidence: colNHSpeed.conf });
  }

  if (colT17.index >= 0) {
    mappedHeaders.push({ targetField: 'T1_7', detectedColumn: colT17.colName, columnIndex: colT17.index, confidence: colT17.conf });
  }

  mappedHeaders.push(
    { targetField: 'P1_7', detectedColumn: colP17.colName, columnIndex: colP17.index, confidence: colP17.conf },
    { targetField: 'P3_0', detectedColumn: colP30.colName, columnIndex: colP30.index, confidence: colP30.conf }
  );

  if (colPbSyn.index >= 0) {
    mappedHeaders.push({ targetField: 'pbSynthesis', detectedColumn: colPbSyn.colName, columnIndex: colPbSyn.index, confidence: colPbSyn.conf });
  }
  if (colWW.index >= 0) {
    mappedHeaders.push({ targetField: 'isWaterWashEvent', detectedColumn: colWW.colName, columnIndex: colWW.index, confidence: colWW.conf });
  }

  const warnings: string[] = [];

  // Essential fields check (P1.7, P3.0, and Real Power / Beban)
  const missingRequired: string[] = [];
  if (colP17.index === -1) missingRequired.push('P1.7 / PT006 (Tekanan Inlet)');
  if (colP30.index === -1) missingRequired.push('P3.0 / PT007 (Tekanan Discharge)');
  if (colPower.index === -1) missingRequired.push('Beban Turbin / Real Power (MW)');

  if (missingRequired.length > 0) {
    warnings.push(`Parameter penting belum terdeteksi: ${missingRequired.join(', ')}.`);
  }

  const extractedRecords: OperationalInput[] = [];

  // Parse data rows starting immediately after the detected header row
  for (let r = bestHeaderRowIndex + 1; r < lines.length; r++) {
    const rawLine = lines[r];
    const cells = splitCsvLine(rawLine, delimiter);
    if (cells.length < 2) continue;

    const tVal = colT17.index >= 0 ? cleanNumericValue(cells[colT17.index]) : undefined;
    const p1Val = colP17.index >= 0 ? cleanNumericValue(cells[colP17.index]) : null;
    const p3Val = colP30.index >= 0 ? cleanNumericValue(cells[colP30.index]) : null;
    const pwVal = colPower.index >= 0 ? cleanNumericValue(cells[colPower.index]) : null;
    const nhVal = colNHSpeed.index >= 0 ? cleanNumericValue(cells[colNHSpeed.index]) : undefined;

    // Check if row has valid pressure reading (P3.0/PT007 is the core operational indicator)
    if (p3Val === null) {
      continue;
    }

    // Fallbacks: P1.7 defaults to nominal 14.65 PSIA if omitted; Power defaults to nominal 20.0 MW
    const finalP1 = p1Val !== null ? p1Val : 14.65;
    const finalPw = pwVal !== null ? pwVal : 20.0;

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
    const pbVal = colPbSyn.index >= 0 ? cleanNumericValue(cells[colPbSyn.index]) : undefined;
    let isWW = false;
    if (colWW.index >= 0 && cells[colWW.index]) {
      const v = cells[colWW.index].toLowerCase().trim();
      isWW = v === 'yes' || v === 'y' || v === '1' || v === 'true';
    }

    extractedRecords.push({
      date: dateStr,
      time: timeStr,
      T1_7: tVal,
      P1_7: finalP1,
      P3_0: p3Val,
      realPower: finalPw,
      nhSpeed: nhVal,
      pbSynthesis: pbVal,
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
  const header = 'Tanggal,Waktu,Beban (MW),NH Speed (RPM),T1.7 (°F),P1.7 (PSIA),P3.0 (PSIA),PR';
  const rows = records.map(r => {
    const pr = r.P1_7 > 0 ? (r.P3_0 / r.P1_7).toFixed(4) : '';
    const nh = r.nhSpeed !== undefined && r.nhSpeed !== null ? r.nhSpeed : '';
    const t1 = r.T1_7 !== undefined && r.T1_7 !== null ? r.T1_7 : '';
    return `${r.date},${r.time},${r.realPower},${nh},${t1},${r.P1_7},${r.P3_0},${pr}`;
  });
  return [header, ...rows].join('\n');
}
