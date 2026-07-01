import ExcelJS from 'exceljs';
import type { CalculatedDay, Settings } from './domain/types';
import { parseTime } from './domain/time';

type ForderungsnachweisExport = {
  bytes: Uint8Array;
  filledRows: number;
};

type TablePosition = {
  headerRow: number;
  dayColumn: number;
};

const DATA_ROW_OFFSET = 2;
const MAX_DAY_ROWS = 31;
const WEEKDAY_COLUMN_OFFSET = -1;

const COLUMN_OFFSET = {
  day: 0,
  start: 1,
  end: 2,
  overtime: 3,
  night: 5,
  sunday: 6,
  saturdayAfternoon: 7,
  saturdayEvening: 8,
  holiday: 9,
  christmasEveOrNewYearsEve: 11,
  mealAllowance: 21
} as const;

function dateForDayOffset(dateKey: string, offset: number): Date {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date;
}

function isHolidayLike(day: CalculatedDay): boolean {
  return Boolean(day.holidayName) || day.remark === 'Feiertag';
}

function overlapMinutes(start: number, end: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

function decimalHours(minutes: number): number | '' {
  if (minutes <= 0) return '';
  return Math.round((minutes / 60) * 100) / 100;
}

function monthParts(monthKey: string): { year: number; month: number } {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
}

function hasFormula(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return Boolean(value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value));
}

function formulaResult(value: ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue): ExcelJS.CellValue {
  if ('result' in value) return value.result as ExcelJS.CellValue;
  return '';
}

function removeTemplateFormulas(workbook: ExcelJS.Workbook) {
  for (const worksheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      for (let column = 1; column <= worksheet.columnCount; column += 1) {
        const cell = row.getCell(column);
        if (hasFormula(cell.value)) {
          cell.value = formulaResult(cell.value);
        }
      }
    }
  }
}

function setMergedValue(worksheet: ExcelJS.Worksheet, address: string, value: ExcelJS.CellValue) {
  worksheet.getCell(address).master.value = value;
}

function populateHeader(worksheet: ExcelJS.Worksheet, settings: Settings, monthKey: string) {
  const { year, month } = monthParts(monthKey);
  setMergedValue(worksheet, 'AM6', month);
  setMergedValue(worksheet, 'AN6', year);
  setMergedValue(worksheet, 'AK7', settings.personalNumber || '');
  setMergedValue(worksheet, 'AK8', settings.employeeName || '');
  setMergedValue(worksheet, 'AK9', settings.dienststelle || settings.department || '');
}

function grossWorkInterval(day: CalculatedDay): { start: number; end: number } | null {
  const start = parseTime(day.start);
  const end = parseTime(day.end);
  if (start === null || end === null) return null;
  return { start, end: end <= start ? end + 24 * 60 : end };
}

function netMinutes(day: CalculatedDay): number {
  const interval = grossWorkInterval(day);
  if (!interval) return 0;
  const pause = parseTime(day.pause) ?? 0;
  return Math.max(0, interval.end - interval.start - pause);
}

function isFullTime(settings: Settings): boolean {
  const weeklyTargetMinutes = Object.values(settings.weekdays).reduce(
    (sum, day) => sum + (day.workAllowed ? day.targetMinutes : 0),
    0
  );
  return weeklyTargetMinutes === 39 * 60;
}

function bridgesLunchWindow(day: CalculatedDay): boolean {
  const interval = grossWorkInterval(day);
  if (!interval) return false;
  return interval.start <= 11 * 60 && interval.end >= 14 * 60;
}

function mealAllowanceValue(day: CalculatedDay, workMinutes: number, settings: Settings): number {
  if (settings.hasCanteenAccess || !isFullTime(settings)) return 0;
  if (workMinutes >= 6 * 60 && bridgesLunchWindow(day)) return 1;
  if (workMinutes > 0 && workMinutes < 6 * 60) return 0.5;
  return 0;
}

function specialHours(day: CalculatedDay) {
  const interval = grossWorkInterval(day);
  const result = {
    night: 0,
    sunday: 0,
    saturdayAfternoon: 0,
    saturdayEvening: 0,
    holiday: 0,
    christmasEveOrNewYearsEve: 0
  };
  if (!interval) return result;

  for (const dayOffset of [0, 1]) {
    const calendarDate = dateForDayOffset(day.date, dayOffset);
    const dayStart = dayOffset * 24 * 60;
    const weekday = calendarDate.getDay();
    const month = calendarDate.getMonth() + 1;
    const date = calendarDate.getDate();
    const segment = overlapMinutes(interval.start, interval.end, dayStart, dayStart + 24 * 60);
    if (!segment) continue;

    result.night += overlapMinutes(interval.start, interval.end, dayStart, dayStart + 6 * 60);
    result.night += overlapMinutes(interval.start, interval.end, dayStart + 21 * 60, dayStart + 24 * 60);

    if (weekday === 0) {
      result.sunday += segment;
    }

    if (weekday === 6) {
      result.saturdayAfternoon += overlapMinutes(interval.start, interval.end, dayStart + 13 * 60, dayStart + 20 * 60);
      result.saturdayEvening += overlapMinutes(interval.start, interval.end, dayStart + 20 * 60, dayStart + 21 * 60);
    }

    if ((month === 12 && date === 24) || (month === 12 && date === 31)) {
      result.christmasEveOrNewYearsEve += overlapMinutes(interval.start, interval.end, dayStart + 14 * 60, dayStart + 24 * 60);
    }
  }

  if (isHolidayLike(day)) {
    result.holiday = interval.end - interval.start;
  }

  return result;
}

function findTablePosition(worksheet: ExcelJS.Worksheet): TablePosition {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 80); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= Math.min(worksheet.columnCount, 40); column += 1) {
      if (row.getCell(column).value === 1 && row.getCell(column + 1).value === 2 && row.getCell(column + 2).value === 3) {
        return { headerRow: rowNumber, dayColumn: column };
      }
    }
  }
  return { headerRow: 13, dayColumn: 2 };
}

function setHours(row: ExcelJS.Row, baseColumn: number, offset: number, minutes: number): number {
  const cell = row.getCell(baseColumn + offset);
  cell.value = decimalHours(minutes);
  if (minutes > 0) cell.numFmt = '0.00';
  return minutes;
}

export async function buildForderungsnachweisWorkbook(
  templateBytes: Uint8Array,
  days: CalculatedDay[],
  monthKey: string,
  settings: Settings
): Promise<ForderungsnachweisExport> {
  const workbook = new ExcelJS.Workbook();
  const templateBuffer = templateBytes.buffer.slice(
    templateBytes.byteOffset,
    templateBytes.byteOffset + templateBytes.byteLength
  ) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(templateBuffer);
  removeTemplateFormulas(workbook);
  const worksheet = workbook.worksheets[0];
  populateHeader(worksheet, settings, monthKey);
  const position = findTablePosition(worksheet);
  const firstDataRow = position.headerRow + DATA_ROW_OFFSET;
  const daysByNumber = new Map(days.map((day) => [Number(day.date.slice(8, 10)), day]));
  const { month } = monthParts(monthKey);
  const totals = new Map<number, number>();

  function addTotal(offset: number, minutes: number) {
    totals.set(offset, (totals.get(offset) ?? 0) + minutes);
  }

  for (let dayNumber = 1; dayNumber <= MAX_DAY_ROWS; dayNumber += 1) {
    const row = worksheet.getRow(firstDataRow + dayNumber - 1);
    const day = daysByNumber.get(dayNumber);
    const hasDayInMonth = Boolean(day) && month === Number(day?.date.slice(5, 7));

    row.getCell(position.dayColumn + WEEKDAY_COLUMN_OFFSET).value = hasDayInMonth ? day?.weekdayLabel || '' : '';
    row.getCell(position.dayColumn + COLUMN_OFFSET.day).value = hasDayInMonth ? dayNumber : '';
    row.getCell(position.dayColumn + COLUMN_OFFSET.start).value = day?.start || '';
    row.getCell(position.dayColumn + COLUMN_OFFSET.end).value = day?.end || '';
    row.getCell('AN').value = hasDayInMonth ? dayNumber : '';

    for (const offset of Object.values(COLUMN_OFFSET).filter((offset) => offset >= COLUMN_OFFSET.overtime)) {
      row.getCell(position.dayColumn + offset).value = '';
    }

    if (!day || !hasDayInMonth) {
      row.commit();
      continue;
    }

    const regularMinutes = netMinutes(day);
    const specials = specialHours(day);
    const mealAllowance = mealAllowanceValue(day, regularMinutes, settings);

    addTotal(COLUMN_OFFSET.night, setHours(row, position.dayColumn, COLUMN_OFFSET.night, specials.night));
    addTotal(COLUMN_OFFSET.sunday, setHours(row, position.dayColumn, COLUMN_OFFSET.sunday, specials.sunday));
    addTotal(COLUMN_OFFSET.saturdayAfternoon, setHours(row, position.dayColumn, COLUMN_OFFSET.saturdayAfternoon, specials.saturdayAfternoon));
    addTotal(COLUMN_OFFSET.saturdayEvening, setHours(row, position.dayColumn, COLUMN_OFFSET.saturdayEvening, specials.saturdayEvening));
    addTotal(COLUMN_OFFSET.holiday, setHours(row, position.dayColumn, COLUMN_OFFSET.holiday, specials.holiday));
    addTotal(COLUMN_OFFSET.christmasEveOrNewYearsEve, setHours(row, position.dayColumn, COLUMN_OFFSET.christmasEveOrNewYearsEve, specials.christmasEveOrNewYearsEve));
    addTotal(COLUMN_OFFSET.mealAllowance, setHours(row, position.dayColumn, COLUMN_OFFSET.mealAllowance, mealAllowance * 60));
    row.commit();
  }

  const totalRow = worksheet.getRow(firstDataRow + MAX_DAY_ROWS);
  for (const [offset, minutes] of totals) {
    const cell = totalRow.getCell(position.dayColumn + offset);
    cell.value = decimalHours(minutes);
    if (minutes > 0) cell.numFmt = '0.00';
  }
  totalRow.commit();

  const bytes = await workbook.xlsx.writeBuffer();
  return { bytes: new Uint8Array(bytes), filledRows: days.length };
}
