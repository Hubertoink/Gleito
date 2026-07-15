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

export function roundMinutes(minutes: number, stepMinutes: number): number {
  if (stepMinutes === 10) {
    const remainder = minutes % stepMinutes;
    return remainder <= 5 ? minutes - remainder : minutes + (stepMinutes - remainder);
  }
  return Math.floor((minutes + stepMinutes / 2) / stepMinutes) * stepMinutes;
}

export function roundClock(value: string, stepMinutes: number): string {
  const minutes = parseTime(value);
  if (minutes === null) return value;
  return formatClock(roundMinutes(minutes, stepMinutes));
}

export function roundDuration(value: string, stepMinutes: number): string {
  const minutes = parseTime(value);
  if (minutes === null) return value;
  return formatMinutes(roundMinutes(minutes, stepMinutes));
}

export function isMinuteValue(value: string, stepMinutes: number): boolean {
  const minutes = parseTime(value);
  return minutes === null || minutes % stepMinutes === 0;
}

export function roundClockToTen(value: string): string {
  return roundClock(value, 10);
}

export function roundDurationToTen(value: string): string {
  return roundDuration(value, 10);
}

export function isTenMinuteValue(value: string): boolean {
  return isMinuteValue(value, 10);
}

export function addClockMinutes(value: string, minutesToAdd: number): string {
  const start = parseTime(value);
  if (start === null) return '';
  return formatClock(start + minutesToAdd);
}
