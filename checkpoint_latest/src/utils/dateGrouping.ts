export type TimePeriod = 'daily' | 'weekly' | 'monthly';

export interface WeekBucket {
  key: string;
  start: string;
  end: string;
  label: string;
  rangeLabel: string;
}

export interface MonthBucket {
  key: string;
  year: string;
  month: string;
  label: string;
  fullLabel: string;
}

/**
 * Calculates Monday-Sunday calendar week window for an ISO YYYY-MM-DD date.
 */
export function getWeekBucket(dateStr: string): WeekBucket {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 is Sun, 1 is Mon...
  const diffToMon = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const monStr = monday.toISOString().slice(0, 10);
  const sunStr = sunday.toISOString().slice(0, 10);
  return {
    key: monStr,
    start: monStr,
    end: sunStr,
    label: `Wk ${monStr.slice(5)}`,
    rangeLabel: `${monStr.slice(5)} - ${sunStr.slice(5)}`,
  };
}

/**
 * Calculates Month bucket for an ISO YYYY-MM-DD date.
 */
export function getMonthBucket(dateStr: string): MonthBucket {
  const parts = dateStr.split('-');
  const year = parts[0] || '2026';
  const month = parts[1] || '01';
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesLong = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const idx = parseInt(month, 10) - 1;
  const shortName = monthNamesShort[idx] || month;
  const longName = monthNamesLong[idx] || month;
  return {
    key: `${year}-${month}`,
    year,
    month,
    label: `${shortName} '${year.slice(2)}`,
    fullLabel: `${longName} ${year}`,
  };
}
