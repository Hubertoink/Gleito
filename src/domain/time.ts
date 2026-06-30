export function parseTime(value: string): number | null {
  if (!value) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}:${mins.toString().padStart(2, '0')}`;
}

export function formatClock(totalMinutes: number): string {
  const day = 24 * 60;
  const normalized = ((totalMinutes % day) + day) % day;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function roundClockToTen(value: string): string {
  const minutes = parseTime(value);
  if (minutes === null) return value;
  const rounded = Math.floor((minutes + 5) / 10) * 10;
  return formatClock(rounded);
}

export function isTenMinuteValue(value: string): boolean {
  const minutes = parseTime(value);
  return minutes === null || minutes % 10 === 0;
}

export function addClockMinutes(value: string, minutesToAdd: number): string {
  const start = parseTime(value);
  if (start === null) return '';
  return formatClock(start + minutesToAdd);
}
