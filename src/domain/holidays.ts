import type { HolidayRegion } from './types';

const REGION_NAMES: Record<HolidayRegion, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen'
};

export function holidayRegionName(region: HolidayRegion): string {
  return REGION_NAMES[region];
}

export function holidayRegions(): Array<{ key: HolidayRegion; name: string }> {
  return Object.entries(REGION_NAMES).map(([key, name]) => ({ key: key as HolidayRegion, name }));
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function allSaintsRegions(region: HolidayRegion): boolean {
  return ['BW', 'BY', 'NW', 'RP', 'SL'].includes(region);
}

export function holidaysForYear(year: number, region: HolidayRegion, customHolidays: string[] = []): Map<string, string> {
  const easter = easterSunday(year);
  const result = new Map<string, string>();
  result.set(iso(year, 1, 1), 'Neujahr');
  result.set(iso(year, 5, 1), 'Tag der Arbeit');
  result.set(iso(year, 10, 3), 'Tag der Deutschen Einheit');
  result.set(iso(year, 12, 25), '1. Weihnachtstag');
  result.set(iso(year, 12, 26), '2. Weihnachtstag');
  result.set(addDays(easter, -2), 'Karfreitag');
  result.set(addDays(easter, 1), 'Ostermontag');
  result.set(addDays(easter, 39), 'Christi Himmelfahrt');
  result.set(addDays(easter, 50), 'Pfingstmontag');

  if (['BW', 'BY', 'ST'].includes(region)) result.set(iso(year, 1, 6), 'Heilige Drei Könige');
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(region)) result.set(addDays(easter, 60), 'Fronleichnam');
  if (allSaintsRegions(region)) result.set(iso(year, 11, 1), 'Allerheiligen');
  if (region === 'BE') result.set(iso(year, 3, 8), 'Internationaler Frauentag');
  if (region === 'BB') result.set(iso(year, 10, 31), 'Reformationstag');
  if (['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH'].includes(region)) {
    result.set(iso(year, 10, 31), 'Reformationstag');
  }
  if (region === 'SN') result.set(addDays(easter, 60), 'Fronleichnam');

  for (const custom of customHolidays) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(custom)) result.set(custom, 'Benutzerdefinierter Feiertag');
  }

  return result;
}
