import type { CalculatedDay, DayEntry, MonthSummary, Settings, WeekdayKey } from './types';
import { holidaysForYear } from './holidays';
import { addClockMinutes, isMinuteValue, parseTime, roundMinutes } from './time';

const WEEKDAY_KEYS: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Mo',
  tue: 'Di',
  wed: 'Mi',
  thu: 'Do',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'So'
};
const REMARK_BASES = ['Urlaub', 'krank', 'Zeitkonto', 'AZVO', 'Zeitausgleich', 'Ausgleichstag', 'Feiertag', 'Rufbereitschaft'];
const ABSENCE_REMARKS = new Set(['Zeitkonto', 'AZVO']);

function roundingStep(mode: Settings['roundingMode']): number | null {
  return mode === 'none' ? null : Number(mode);
}

export function remarkBase(remark: string): string {
  const trimmed = remark.trim();
  const matched = REMARK_BASES.find((base) => trimmed === base || trimmed.startsWith(`${base} (`));
  if (matched === 'Ausgleichstag') return 'Zeitausgleich';
  return matched ?? trimmed;
}

export function defaultSettings(): Settings {
  const currentMonth = monthKey(new Date());
  return {
    employeeName: '',
    dienststelle: '',
    kostenstelle: '',
    personalNumber: '',
    department: '',
    trackingStartMonth: currentMonth,
    currentWorkMonth: currentMonth,
    lastViewedMonth: currentMonth,
    openLastViewedMonthOnStart: false,
    holidayRegion: 'BW',
    customHolidays: [],
    initialCarryoverMinutes: 0,
    overtimeLimitMinutes: 40 * 60,
    minusCountingMode: 'explicit_only',
    trafficThresholds: {
      plusGreenUntilMinutes: 20 * 60,
      plusYellowUntilMinutes: 40 * 60,
      plusRedFromMinutes: 60 * 60,
      minusGreenUntilMinutes: 10 * 60,
      minusYellowUntilMinutes: 10 * 60,
      minusRedFromMinutes: 11 * 60
    },
    backgroundEnabled: true,
    translucentSurfaces: true,
    compactTable: false,
    highlightOpenPlannedDays: false,
    autoSuggestWorkTimes: true,
    backgroundImage: 'none',
    rotateBackgrounds: false,
    surfaceOpacity: 0.92,
    tableOpacity: 0.94,
    windowTransparency: 0.98,
    warnBeforeSix: true,
    warnAfterSix: true,
    roundingMode: 'none',
    pdfExportLayout: 'gleito',
    hasCanteenAccess: true,
    setupGuideCompleted: false,
    weekdays: {
      mon: { targetMinutes: 8 * 60, workAllowed: true },
      tue: { targetMinutes: 8 * 60, workAllowed: true },
      wed: { targetMinutes: 8 * 60, workAllowed: true },
      thu: { targetMinutes: 8 * 60, workAllowed: true },
      fri: { targetMinutes: 7 * 60, workAllowed: true },
      sat: { targetMinutes: 0, workAllowed: false },
      sun: { targetMinutes: 0, workAllowed: false }
    }
  };
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

export function resolveCurrentWorkMonth({
  trackingStartMonth,
  currentWorkMonth,
  monthKeys,
  preferStartMonthIfEarlier = false
}: {
  trackingStartMonth: string;
  currentWorkMonth?: string;
  monthKeys: string[];
  preferStartMonthIfEarlier?: boolean;
}): string {
  if (monthKeys.length === 0) return trackingStartMonth;
  if (currentWorkMonth) {
    if (preferStartMonthIfEarlier && currentWorkMonth > trackingStartMonth) return trackingStartMonth;
    return currentWorkMonth >= trackingStartMonth ? currentWorkMonth : trackingStartMonth;
  }
  const latestStoredMonth = [...monthKeys].sort((a, b) => b.localeCompare(a))[0];
  const inferredNextMonth = shiftMonth(latestStoredMonth, 1);
  return inferredNextMonth >= trackingStartMonth ? inferredNextMonth : trackingStartMonth;
}

export function monthName(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

export function daysInMonth(key: string): string[] {
  const [year, month] = key.split('-').map(Number);
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${key}-${String(index + 1).padStart(2, '0')}`);
}

export function emptyEntry(date: string): DayEntry {
  return { date, start: '', end: '', pause: '', pauseManual: false, endManual: false, remark: '' };
}

export function normalizeMonthEntries(entries: DayEntry[], key: string): DayEntry[] {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  return daysInMonth(key).map((date) => ({ ...emptyEntry(date), ...byDate.get(date) }));
}

export function requiredPauseMinutes(grossMinutes: number): number {
  if (grossMinutes <= 6 * 60) return 0;
  if (grossMinutes >= 9 * 60 + 45) return 45;
  return 30;
}

function automaticPauseMinutes(grossMinutes: number, mode: Settings['roundingMode']): number {
  const pause = requiredPauseMinutes(grossMinutes);
  const step = roundingStep(mode);
  if (!step) return pause;
  if (pause === 45 && step === 10) return 40;
  return roundMinutes(pause, step);
}

export function autoEndForStart(start: string, targetMinutes: number, mode: Settings['roundingMode'] = 'none'): string {
  if (!start || targetMinutes <= 0) return '';
  let pause = targetMinutes > 6 * 60 ? 30 : 0;
  for (let i = 0; i < 3; i += 1) {
    const nextPause = requiredPauseMinutes(targetMinutes + pause);
    if (nextPause === pause) break;
    pause = nextPause;
  }
  const step = roundingStep(mode);
  if (step === 10 && pause === 45) pause = 40;
  else if (step) pause = roundMinutes(pause, step);
  return addClockMinutes(start, targetMinutes + pause);
}

export function calculateDay(entry: DayEntry, settings: Settings, editable: boolean): CalculatedDay {
  const date = new Date(`${entry.date}T00:00:00`);
  const entryMonthKey = entry.date.slice(0, 7);
  const weekday = WEEKDAY_KEYS[date.getDay()];
  const holidays = holidaysForYear(date.getFullYear(), settings.holidayRegion, settings.customHolidays);
  const holidayName = holidays.get(entry.date) ?? '';
  const isWeekend = weekday === 'sat' || weekday === 'sun';
  const weekdaySetting = settings.weekdays[weekday];
  const baseRemark = remarkBase(entry.remark);
  const isCompDay = baseRemark === 'Zeitausgleich';
  const isVacationDay = baseRemark === 'Urlaub';
  const isSickDay = baseRemark === 'krank';
  const isHolidayRemark = baseRemark === 'Feiertag';
  const hasAbsenceRemark = ABSENCE_REMARKS.has(baseRemark);
  const holidayBlocksTarget = Boolean(holidayName) || isHolidayRemark;
  const workAllowed = weekdaySetting.workAllowed;
  const beforeTrackingStart = entryMonthKey < settings.trackingStartMonth;
  const targetMinutes = beforeTrackingStart || !workAllowed || hasAbsenceRemark || holidayBlocksTarget ? 0 : weekdaySetting.targetMinutes;
  const start = parseTime(entry.start);
  const end = parseTime(entry.end);
  const gross = start !== null && end !== null ? Math.max(0, end - start) : 0;
  const automaticPause = gross > 0 ? automaticPauseMinutes(gross, settings.roundingMode) : 0;
  const manualPause = parseTime(entry.pause);
  const pauseMinutes = entry.pauseManual && manualPause !== null ? manualPause : automaticPause;
  const actualMinutes =
    !workAllowed || isCompDay || holidayBlocksTarget
      ? 0
      : isSickDay || isVacationDay
        ? targetMinutes
        : gross > 0
          ? Math.max(0, gross - pauseMinutes)
          : 0;
  const plusMinutes = isCompDay ? 0 : actualMinutes > targetMinutes ? actualMinutes - targetMinutes : 0;
  const hasUserInteraction = Boolean(entry.start || entry.end || entry.remark || (entry.pauseManual && entry.pause));
  const countsPendingAsMinus = settings.minusCountingMode === 'planned_days';
  const minusMinutes =
    !isWeekend && targetMinutes > actualMinutes && !holidayBlocksTarget && (countsPendingAsMinus || hasUserInteraction)
      ? targetMinutes - actualMinutes
      : 0;
  const warnings: string[] = [];

  if (actualMinutes > 10 * 60) warnings.push('Mehr als 10 Stunden Arbeitszeit');
  if (settings.warnBeforeSix && start !== null && start < 6 * 60) warnings.push('Beginn vor 06:00 Uhr');
  if (settings.warnAfterSix && end !== null && end > 18 * 60) warnings.push('Ende nach 18:00 Uhr');
  const step = roundingStep(settings.roundingMode);
  if (step && (!isMinuteValue(entry.start, step) || !isMinuteValue(entry.end, step))) {
    warnings.push(`Zeit nicht im ${step}-Minuten-Raster`);
  }

  return {
    ...entry,
    pause: entry.pauseManual ? entry.pause : pauseMinutes ? `${Math.floor(pauseMinutes / 60)}:${String(pauseMinutes % 60).padStart(2, '0')}` : '',
    weekday,
    weekdayLabel: WEEKDAY_LABELS[weekday],
    holidayName: holidayName || (isHolidayRemark ? 'Feiertag' : ''),
    targetMinutes,
    actualMinutes,
    plusMinutes,
    minusMinutes,
    warnings,
    editable
  };
}

export function calculateMonth(
  entries: DayEntry[],
  settings: Settings,
  key: string,
  carryInMinutes: number,
  editable: boolean
): { days: CalculatedDay[]; summary: MonthSummary } {
  const days = normalizeMonthEntries(entries, key).map((entry) => calculateDay(entry, settings, editable));
  const plusMinutes = days.reduce((sum, day) => sum + day.plusMinutes, 0);
  const minusMinutes = days.reduce((sum, day) => sum + day.minusMinutes, 0);
  const monthDeltaMinutes = plusMinutes - minusMinutes;
  const saldoMinutes = carryInMinutes + monthDeltaMinutes;
  const thresholds = settings.trafficThresholds;
  let trafficLight: 'green' | 'yellow' | 'red' = 'green';
  if (saldoMinutes >= 0) {
    if (saldoMinutes >= thresholds.plusRedFromMinutes) trafficLight = 'red';
    else if (saldoMinutes > thresholds.plusGreenUntilMinutes || saldoMinutes > thresholds.plusYellowUntilMinutes) trafficLight = 'yellow';
  } else {
    const debt = Math.abs(saldoMinutes);
    if (debt >= thresholds.minusRedFromMinutes) trafficLight = 'red';
    else if (debt > thresholds.minusGreenUntilMinutes && debt <= thresholds.minusYellowUntilMinutes) trafficLight = 'yellow';
  }
  return {
    days,
    summary: {
      monthKey: key,
      carryInMinutes,
      plusMinutes,
      minusMinutes,
      monthDeltaMinutes,
      saldoMinutes,
      trafficLight,
      warningCount: days.reduce((sum, day) => sum + day.warnings.length, 0)
    }
  };
}
