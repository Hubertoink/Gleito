import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { DayEntry, MonthData, Settings, TrafficThresholds } from '../domain/types';
import { defaultSettings, normalizeMonthEntries } from '../domain/calc';

const wasmUrl = new URL('sql.js/dist/sql-wasm.wasm', import.meta.url).toString();

export interface AppDatabase {
  loadSettings(): Settings;
  saveSettings(settings: Settings): Promise<void>;
  loadMonth(monthKey: string): MonthData;
  saveMonth(monthKey: string, days: DayEntry[]): Promise<void>;
  listMonthKeys(): string[];
  resetAll(settings?: Settings): Promise<void>;
  exportBytes(): Uint8Array;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type LegacyStoredSettings = Partial<Settings> & { roundToTenMinutes?: boolean };

const LEGACY_DEFAULT_OVERTIME_LIMIT_MINUTES = 40 * 60;
const LEGACY_DEFAULT_TRAFFIC_THRESHOLDS: TrafficThresholds = {
  plusGreenUntilMinutes: 20 * 60,
  plusYellowUntilMinutes: 40 * 60,
  plusRedFromMinutes: 60 * 60,
  minusGreenUntilMinutes: 10 * 60,
  minusYellowUntilMinutes: 10 * 60,
  minusRedFromMinutes: 11 * 60
};

function matchesLegacyPlusThresholds(thresholds: Partial<TrafficThresholds> | undefined): boolean {
  return (
    thresholds?.plusGreenUntilMinutes === LEGACY_DEFAULT_TRAFFIC_THRESHOLDS.plusGreenUntilMinutes &&
    thresholds.plusYellowUntilMinutes === LEGACY_DEFAULT_TRAFFIC_THRESHOLDS.plusYellowUntilMinutes &&
    thresholds.plusRedFromMinutes === LEGACY_DEFAULT_TRAFFIC_THRESHOLDS.plusRedFromMinutes
  );
}

function matchesLegacyMinusThresholds(thresholds: Partial<TrafficThresholds> | undefined): boolean {
  return (
    thresholds?.minusGreenUntilMinutes === LEGACY_DEFAULT_TRAFFIC_THRESHOLDS.minusGreenUntilMinutes &&
    thresholds.minusYellowUntilMinutes === LEGACY_DEFAULT_TRAFFIC_THRESHOLDS.minusYellowUntilMinutes &&
    thresholds.minusRedFromMinutes === LEGACY_DEFAULT_TRAFFIC_THRESHOLDS.minusRedFromMinutes
  );
}

export function mergeSettings(stored: LegacyStoredSettings): Settings {
  const defaults = defaultSettings();
  const { roundToTenMinutes, ...storedSettings } = stored;
  const setupGuideCompleted = stored.setupGuideCompleted ?? Object.keys(stored).length > 0;
  const roundingMode = stored.roundingMode ?? (roundToTenMinutes ? '10' : defaults.roundingMode);
  const hasLegacyPlusThresholds = matchesLegacyPlusThresholds(stored.trafficThresholds);
  const hasLegacyMinusThresholds = matchesLegacyMinusThresholds(stored.trafficThresholds);
  const overtimeLimitMinutes =
    stored.overtimeLimitMinutes === LEGACY_DEFAULT_OVERTIME_LIMIT_MINUTES && hasLegacyPlusThresholds && hasLegacyMinusThresholds
      ? defaults.overtimeLimitMinutes
      : stored.overtimeLimitMinutes ?? defaults.overtimeLimitMinutes;
  const trafficThresholds = {
    ...defaults.trafficThresholds,
    ...stored.trafficThresholds,
    ...(hasLegacyPlusThresholds
      ? {
          plusGreenUntilMinutes: defaults.trafficThresholds.plusGreenUntilMinutes,
          plusYellowUntilMinutes: defaults.trafficThresholds.plusYellowUntilMinutes,
          plusRedFromMinutes: defaults.trafficThresholds.plusRedFromMinutes
        }
      : {}),
    ...(hasLegacyMinusThresholds
      ? {
          minusGreenUntilMinutes: defaults.trafficThresholds.minusGreenUntilMinutes,
          minusYellowUntilMinutes: defaults.trafficThresholds.minusYellowUntilMinutes,
          minusRedFromMinutes: defaults.trafficThresholds.minusRedFromMinutes
        }
      : {})
  };
  return {
    ...defaults,
    ...storedSettings,
    overtimeLimitMinutes,
    roundingMode,
    setupGuideCompleted,
    weekdays: { ...defaults.weekdays, ...stored.weekdays },
    trafficThresholds
  };
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS months (
      month_key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const settings = db.exec('SELECT json FROM settings WHERE id = 1');
  if (settings.length === 0) {
    db.run('INSERT INTO settings (id, json) VALUES (1, ?)', [JSON.stringify(defaultSettings())]);
  }
}

class SqlAppDatabase implements AppDatabase {
  constructor(private readonly sql: SqlJsStatic, private readonly db: Database) {}

  loadSettings(): Settings {
    const rows = this.db.exec('SELECT json FROM settings WHERE id = 1');
    const json = rows[0]?.values[0]?.[0] as string | undefined;
    return mergeSettings(parseJson<LegacyStoredSettings>(json, {}));
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.db.run('UPDATE settings SET json = ? WHERE id = 1', [JSON.stringify(settings)]);
    await persist(this);
  }

  loadMonth(monthKey: string): MonthData {
    const rows = this.db.exec('SELECT json FROM months WHERE month_key = ?', [monthKey]);
    const json = rows[0]?.values[0]?.[0] as string | undefined;
    const month = parseJson<MonthData>(json, { days: [] });
    return { days: normalizeMonthEntries(month.days, monthKey) };
  }

  async saveMonth(monthKey: string, days: DayEntry[]): Promise<void> {
    const month = JSON.stringify({ days: normalizeMonthEntries(days, monthKey) });
    this.db.run(
      `INSERT INTO months (month_key, json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(month_key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      [monthKey, month]
    );
    await persist(this);
  }

  listMonthKeys(): string[] {
    const rows = this.db.exec('SELECT month_key FROM months ORDER BY month_key ASC');
    if (rows.length === 0) return [];
    return rows[0].values.map((value) => String(value[0]));
  }

  async resetAll(settings: Settings = defaultSettings()): Promise<void> {
    this.db.run('DELETE FROM months');
    this.db.run('UPDATE settings SET json = ? WHERE id = 1', [JSON.stringify(settings)]);
    await persist(this);
  }

  exportBytes(): Uint8Array {
    return this.db.export();
  }
}

async function persist(database: AppDatabase) {
  if (window.gleito) await window.gleito.saveDb(database.exportBytes());
  else localStorage.setItem('gleito-sqlite', btoa(String.fromCharCode(...database.exportBytes())));
}

export async function openDatabase(): Promise<AppDatabase> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let bytes: Uint8Array | null = null;
  if (window.gleito) {
    bytes = await window.gleito.loadDb();
  } else {
    const stored = localStorage.getItem('gleito-sqlite');
    if (stored) bytes = Uint8Array.from(atob(stored), (char) => char.charCodeAt(0));
  }
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  migrate(db);
  return new SqlAppDatabase(SQL, db);
}
