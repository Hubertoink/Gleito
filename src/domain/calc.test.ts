import { describe, expect, it } from 'vitest';
import { holidaysForYear } from './holidays';
import { autoEndForStart, calculateMonth, daysInMonth, defaultSettings, emptyEntry, requiredPauseMinutes, resolveCurrentWorkMonth } from './calc';
import { roundClockToTen, roundDurationToTen } from './time';

describe('holiday generation', () => {
  it('includes Baden-Württemberg holidays', () => {
    const holidays = holidaysForYear(2026, 'BW');
    expect(holidays.get('2026-01-06')).toBe('Heilige Drei Könige');
    expect(holidays.get('2026-04-03')).toBe('Karfreitag');
    expect(holidays.get('2026-06-04')).toBe('Fronleichnam');
  });

  it('switches region-specific holidays', () => {
    const bw = holidaysForYear(2026, 'BW');
    const be = holidaysForYear(2026, 'BE');
    expect(bw.get('2026-01-06')).toBe('Heilige Drei Könige');
    expect(be.get('2026-01-06')).toBeUndefined();
    expect(be.get('2026-03-08')).toBe('Internationaler Frauentag');
  });
});

describe('time rules', () => {
  it('rounds commercially to ten minutes', () => {
    expect(roundClockToTen('08:12')).toBe('08:10');
    expect(roundClockToTen('08:15')).toBe('08:20');
    expect(roundClockToTen('08:20')).toBe('08:20');
    expect(roundDurationToTen('0:12')).toBe('0:10');
    expect(roundDurationToTen('0:15')).toBe('0:20');
    expect(roundDurationToTen('0:20')).toBe('0:20');
  });

  it('calculates legal pauses and auto end times', () => {
    expect(requiredPauseMinutes(6 * 60)).toBe(0);
    expect(requiredPauseMinutes(6 * 60 + 1)).toBe(30);
    expect(requiredPauseMinutes(9 * 60 + 45)).toBe(45);
    expect(autoEndForStart('10:00', 8 * 60)).toBe('18:30');
    expect(autoEndForStart('08:00', 9 * 60 + 15, true)).toBe('18:05');
  });
});

describe('month calculation', () => {
  it('calculates plus, minus and carryover', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-01';
    const holidays = holidaysForYear(2026, settings.holidayRegion);
    const jan = daysInMonth('2026-01').map((date) => {
      if (holidays.has(date)) return emptyEntry(date);
      const day = new Date(`${date}T00:00:00`).getDay();
      if (day >= 1 && day <= 4) return { ...emptyEntry(date), start: '10:00', end: '18:30' };
      if (day === 5) return { ...emptyEntry(date), start: '10:00', end: '17:30' };
      return emptyEntry(date);
    });
    jan[1] = { ...jan[1], end: '17:00' };
    const janResult = calculateMonth(jan, settings, '2026-01', 60, true);
    expect(janResult.summary.carryInMinutes).toBe(60);
    expect(janResult.summary.saldoMinutes).toBe(30);

    const feb = daysInMonth('2026-02').map((date) => {
      if (holidays.has(date)) return emptyEntry(date);
      const day = new Date(`${date}T00:00:00`).getDay();
      if (day >= 1 && day <= 4) return { ...emptyEntry(date), start: '10:00', end: '18:30' };
      if (day === 5) return { ...emptyEntry(date), start: '10:00', end: '17:30' };
      return emptyEntry(date);
    });
    feb[1] = { ...feb[1], end: '19:30' };
    const febResult = calculateMonth(feb, settings, '2026-02', janResult.summary.saldoMinutes, true);
    expect(febResult.summary.carryInMinutes).toBe(30);
    expect(febResult.days.find((day) => day.date === '2026-02-02')?.plusMinutes).toBe(60);
  });

  it('does not create negative carry before the configured start month', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    const june = calculateMonth([], settings, '2026-06', 0, true);
    expect(june.summary.carryInMinutes).toBe(0);
    expect(june.summary.minusMinutes).toBe(0);
  });

  it('clamps the current work month to the configured start month when the start month moves earlier', () => {
    const resolved = resolveCurrentWorkMonth({
      trackingStartMonth: '2026-06',
      currentWorkMonth: '2026-07',
      monthKeys: [],
      preferStartMonthIfEarlier: true
    });

    expect(resolved).toBe('2026-06');
  });

  it('treats Ausgleichstag as a minus withdrawal from the overtime account', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    const result = calculateMonth(
      [{ ...emptyEntry('2026-07-06'), start: '10:00', end: '18:30', remark: 'Ausgleichstag' }],
      settings,
      '2026-07',
      0,
      true
    );
    const day = result.days.find((entry) => entry.date === '2026-07-06');
    expect(day?.targetMinutes).toBe(8 * 60);
    expect(day?.actualMinutes).toBe(0);
    expect(day?.plusMinutes).toBe(0);
    expect(day?.minusMinutes).toBe(8 * 60);
  });

  it('treats krank like a fulfilled target day without changing plus or minus', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    const result = calculateMonth([{ ...emptyEntry('2026-07-07'), remark: 'krank' }], settings, '2026-07', 0, true);
    const day = result.days.find((entry) => entry.date === '2026-07-07');
    expect(day?.targetMinutes).toBe(8 * 60);
    expect(day?.actualMinutes).toBe(8 * 60);
    expect(day?.plusMinutes).toBe(0);
    expect(day?.minusMinutes).toBe(0);
  });

  it('treats Urlaub like a fulfilled target day without changing plus or minus', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    const result = calculateMonth([{ ...emptyEntry('2026-07-08'), remark: 'Urlaub' }], settings, '2026-07', 0, true);
    const day = result.days.find((entry) => entry.date === '2026-07-08');
    expect(day?.targetMinutes).toBe(8 * 60);
    expect(day?.actualMinutes).toBe(8 * 60);
    expect(day?.plusMinutes).toBe(0);
    expect(day?.minusMinutes).toBe(0);
  });

  it('treats Feiertag as neutral even when times are entered', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-01';
    const result = calculateMonth(
      [{ ...emptyEntry('2026-01-06'), start: '10:00', end: '18:30' }],
      settings,
      '2026-01',
      0,
      true
    );
    const day = result.days.find((entry) => entry.date === '2026-01-06');
    expect(day?.holidayName).toBe('Heilige Drei Könige');
    expect(day?.targetMinutes).toBe(0);
    expect(day?.actualMinutes).toBe(0);
    expect(day?.plusMinutes).toBe(0);
    expect(day?.minusMinutes).toBe(0);
  });

  it('treats a manual Feiertag remark as neutral without requiring times', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    const result = calculateMonth([{ ...emptyEntry('2026-07-08'), remark: 'Feiertag' }], settings, '2026-07', 0, true);
    const day = result.days.find((entry) => entry.date === '2026-07-08');
    expect(day?.holidayName).toBe('Feiertag');
    expect(day?.targetMinutes).toBe(0);
    expect(day?.actualMinutes).toBe(0);
    expect(day?.plusMinutes).toBe(0);
    expect(day?.minusMinutes).toBe(0);
  });

  it('ignores time entries on weekdays that are not allowed for work', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    settings.weekdays.sat.workAllowed = false;
    const result = calculateMonth([{ ...emptyEntry('2026-07-04'), start: '10:00', end: '18:30' }], settings, '2026-07', 0, true);
    const day = result.days.find((entry) => entry.date === '2026-07-04');
    expect(day?.targetMinutes).toBe(0);
    expect(day?.actualMinutes).toBe(0);
    expect(day?.plusMinutes).toBe(0);
    expect(result.summary.plusMinutes).toBe(0);
  });

  it('can ignore untouched target days in explicit-only minus mode', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    settings.minusCountingMode = 'explicit_only';
    const result = calculateMonth(
      [
        { ...emptyEntry('2026-07-06'), start: '10:00', end: '16:30' },
        emptyEntry('2026-07-07')
      ],
      settings,
      '2026-07',
      0,
      true
    );
    expect(result.days.find((entry) => entry.date === '2026-07-06')?.minusMinutes).toBe(120);
    expect(result.days.find((entry) => entry.date === '2026-07-07')?.minusMinutes).toBe(0);
  });

  it('uses configured plus and minus traffic thresholds', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    settings.minusCountingMode = 'explicit_only';
    settings.trafficThresholds.plusGreenUntilMinutes = 20 * 60;
    settings.trafficThresholds.plusRedFromMinutes = 60 * 60;
    let result = calculateMonth([], settings, '2026-07', 30 * 60, true);
    expect(result.summary.trafficLight).toBe('yellow');
    result = calculateMonth([], settings, '2026-07', -(11 * 60), true);
    expect(result.summary.trafficLight).toBe('red');
  });

  it('rounds the automatic 45 minute pause to 50 minutes when ten-minute rounding is enabled', () => {
    const settings = defaultSettings();
    settings.trackingStartMonth = '2026-07';
    settings.roundToTenMinutes = true;
    settings.weekdays.mon.targetMinutes = 9 * 60;

    const result = calculateMonth(
      [{ ...emptyEntry('2026-07-06'), start: '08:00', end: '17:45' }],
      settings,
      '2026-07',
      0,
      true
    );
    const day = result.days.find((entry) => entry.date === '2026-07-06');

    expect(day?.pause).toBe('0:50');
    expect(day?.actualMinutes).toBe(8 * 60 + 55);
    expect(day?.minusMinutes).toBe(5);
  });
});
