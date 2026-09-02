import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildForderungsnachweisWorkbook } from './excelExport';
import { calculateMonth, defaultSettings, emptyEntry } from './domain/calc';

async function mealAllowanceCellFor(settings: ReturnType<typeof defaultSettings>, dayNumber = 2) {
  const template = new ExcelJS.Workbook();
  const worksheet = template.addWorksheet('Nachweis');
  worksheet.getCell('B1').value = 1;
  worksheet.getCell('C1').value = 2;
  worksheet.getCell('D1').value = 3;
  const templateBytes = new Uint8Array(await template.xlsx.writeBuffer());
  settings.trackingStartMonth = '2026-07';
  const date = `2026-07-${String(dayNumber).padStart(2, '0')}`;
  const days = calculateMonth(
    [{ ...emptyEntry(date), start: '10:00', end: '18:30' }],
    settings,
    '2026-07',
    0,
    true
  ).days;

  const result = await buildForderungsnachweisWorkbook(templateBytes, days, '2026-07', settings);
  const exported = new ExcelJS.Workbook();
  const exportedBuffer = result.bytes.buffer.slice(
    result.bytes.byteOffset,
    result.bytes.byteOffset + result.bytes.byteLength
  ) as unknown as Parameters<typeof exported.xlsx.load>[0];
  await exported.xlsx.load(exportedBuffer);
  return exported.worksheets[0].getCell(`W${dayNumber + 2}`).value;
}

describe('Forderungsnachweis Essensentschädigung', () => {
  it('writes 1.00 for a five-day week', async () => {
    const settings = defaultSettings();
    settings.hasCanteenAccess = false;

    expect(await mealAllowanceCellFor(settings)).toBe(1);
  });

  it('writes 0.50 for a four-day week', async () => {
    const settings = defaultSettings();
    settings.hasCanteenAccess = false;
    settings.weekdays.wed.workAllowed = false;
    settings.weekdays.sat.workAllowed = true;
    settings.weekdays.sat.targetMinutes = 0;

    expect(await mealAllowanceCellFor(settings)).toBe(0.5);
  });

  it('also recognizes four days when the fifth day has zero target time', async () => {
    const settings = defaultSettings();
    settings.hasCanteenAccess = false;
    settings.weekdays.fri.targetMinutes = 0;

    expect(await mealAllowanceCellFor(settings)).toBe(0.5);
  });

  it('does not write an allowance for a blocked day with old time entries', async () => {
    const settings = defaultSettings();
    settings.hasCanteenAccess = false;
    settings.weekdays.wed.workAllowed = false;

    expect(await mealAllowanceCellFor(settings, 1)).toBe('');
  });
});
