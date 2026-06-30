import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Archive, CalendarDays, Download, Eye, Lock, Save, Settings as SettingsIcon, SlidersHorizontal, X } from 'lucide-react';
import type { AppDatabase } from './data/db';
import { openDatabase } from './data/db';
import {
  autoEndForStart,
  calculateMonth,
  defaultSettings,
  emptyEntry,
  monthKey as keyForDate,
  monthName,
  normalizeMonthEntries
} from './domain/calc';
import type { DayEntry, Settings, WeekdayKey } from './domain/types';
import { holidayRegions } from './domain/holidays';
import { formatMinutes, roundClockToTen } from './domain/time';
import { buildPrintHtml } from './pdf';
import mannheimLogo from '../assets/Mannheim_Weiß.png';
import appLogo from '../assets/Logo.ico';
import bgArlind from '../assets/pexels-arlindphotography-36724787.jpg';
import bgMagnus from '../assets/pexels-magnusflechsenhaar-3841412.jpg';
import bgMasood from '../assets/pexels-masoodaslami-11728829.jpg';
import './styles.css';

type ToastState = {
  message: string;
  tone: 'success' | 'error' | 'info';
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  persistent?: boolean;
} | null;

type ToastTone = NonNullable<ToastState>['tone'];
type UpdateStatusPayload = {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
};

const WEEKDAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Di' },
  { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'So' }
];

const REMARKS = ['', 'Urlaub', 'krank', 'Zeitkonto', 'Ausgleichstag', 'Feiertag', 'Rufbereitschaft'];

function minutesInput(minutes: number): string {
  return formatMinutes(minutes).padStart(5, '0');
}

function parseDuration(value: string): number {
  const match = /^(-)?(\d{1,3}):([0-5]\d)$/.exec(value.trim());
  if (!match) return 0;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return match[1] ? -total : total;
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  return keyForDate(new Date(year, month - 1 + delta, 1));
}

function monthRange(fromKey: string, toKey: string): string[] {
  if (fromKey > toKey) return [];
  const result: string[] = [];
  let cursor = fromKey;
  while (cursor <= toKey) {
    result.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return result;
}

async function carryInForMonth(db: AppDatabase, settings: Settings, key: string): Promise<number> {
  if (key <= settings.trackingStartMonth) return settings.initialCarryoverMinutes;
  let carry = settings.initialCarryoverMinutes;
  for (const currentKey of monthRange(settings.trackingStartMonth, shiftMonth(key, -1))) {
    const monthData = db.loadMonth(currentKey);
    const result = calculateMonth(monthData.days, settings, currentKey, carry, true);
    carry = result.summary.saldoMinutes;
  }
  return carry;
}

export default function App() {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [activeMonth, setActiveMonth] = useState(keyForDate(new Date()));
  const [homeMonth, setHomeMonth] = useState(keyForDate(new Date()));
  const [storedMonthKeys, setStoredMonthKeys] = useState<string[]>([]);
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [carryIn, setCarryIn] = useState(0);
  const [view, setView] = useState<'month' | 'settings'>('month');
  const [lockedView, setLockedView] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null);
  const manualUpdateCheckRef = useRef(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const todayMonth = keyForDate(new Date());
  const todayDateKey = new Date().toISOString().slice(0, 10);
  const editable = !lockedView;
  const archiveMonths = useMemo(
    () =>
      storedMonthKeys
        .filter((month) => month < homeMonth || (month === homeMonth && homeMonth === todayMonth))
        .sort((a, b) => b.localeCompare(a)),
    [storedMonthKeys, homeMonth, todayMonth]
  );
  const calculated = useMemo(
    () => calculateMonth(entries, settings, activeMonth, carryIn, editable),
    [entries, settings, activeMonth, carryIn, editable]
  );
  const backgroundSource = useMemo(() => {
    if (!settings.backgroundEnabled) return '';
    const rotation = [bgArlind, bgMagnus, bgMasood];
    const [, month] = activeMonth.split('-').map(Number);
    return rotation[(month - 1) % rotation.length];
  }, [settings.backgroundEnabled, activeMonth]);
  const effectiveWindowOpacity = backgroundSource ? 0.46 : 0.98;
  const effectiveSurfaceOpacity = backgroundSource && settings.translucentSurfaces ? 0.82 : 0.98;
  const effectiveTableOpacity = backgroundSource && settings.translucentSurfaces ? 0.84 : 0.98;

  function resolveCurrentWorkMonth(loadedSettings: Settings, startMonth: string, monthKeys: string[]) {
    if (monthKeys.length === 0) return startMonth;
    if (loadedSettings.currentWorkMonth) {
      return loadedSettings.currentWorkMonth >= startMonth ? loadedSettings.currentWorkMonth : startMonth;
    }
    const latestStoredMonth = [...monthKeys].sort((a, b) => b.localeCompare(a))[0];
    const inferredNextMonth = shiftMonth(latestStoredMonth, 1);
    return inferredNextMonth >= startMonth ? inferredNextMonth : startMonth;
  }

  async function hydrateFromDatabase(database: AppDatabase, preferredMonth?: string) {
    const loadedSettings = database.loadSettings();
    const startMonth = loadedSettings.trackingStartMonth || todayMonth;
    const monthKeys = database.listMonthKeys();
    const currentWorkMonth = resolveCurrentWorkMonth(loadedSettings, startMonth, monthKeys);
    const candidateMonth = preferredMonth ?? currentWorkMonth;
    const initialMonth =
      candidateMonth < startMonth ? startMonth : candidateMonth || (todayMonth < startMonth ? startMonth : todayMonth);
    setDb(database);
    setStoredMonthKeys(monthKeys);
    setSettings({ ...loadedSettings, trackingStartMonth: startMonth, currentWorkMonth });
    setActiveMonth(initialMonth);
    setHomeMonth(currentWorkMonth);
    const monthData = database.loadMonth(initialMonth);
    setEntries(monthData.days);
    setCarryIn(await carryInForMonth(database, { ...loadedSettings, trackingStartMonth: startMonth }, initialMonth));
  }

  useEffect(() => {
    openDatabase().then((database) => {
      void hydrateFromDatabase(database);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (toast.actionLabel || toast.persistent) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!window.gleito) return;
    void window.gleito.getVersion().then(setAppVersion);
    const unsubscribe = window.gleito.onUpdateStatus((payload) => {
      const next = payload as UpdateStatusPayload;
      setUpdateStatus(next);
      if (next.state === 'checking' && manualUpdateCheckRef.current) {
        setToast({ message: 'Suche nach Updates ...', tone: 'info', persistent: true });
      }
      if (next.state === 'available') {
        manualUpdateCheckRef.current = false;
        setToast({
          message: `Update ${next.version ?? ''} verfügbar`,
          tone: 'info',
          actionLabel: 'Jetzt laden',
          onAction: async () => {
            setToast({ message: 'Update wird geladen ...', tone: 'info', persistent: true });
            await window.gleito?.downloadAppUpdate();
          },
          persistent: true
        });
      }
      if (next.state === 'downloading') {
        setToast({
          message: `Update wird geladen${typeof next.percent === 'number' ? ` (${next.percent}%)` : ' ...'}`,
          tone: 'info',
          persistent: true
        });
      }
      if (next.state === 'downloaded') {
        manualUpdateCheckRef.current = false;
        setToast({
          message: `Update ${next.version ?? ''} bereit`,
          tone: 'success',
          actionLabel: 'Jetzt neu starten',
          onAction: async () => {
            await window.gleito?.installAppUpdate();
          },
          persistent: true
        });
      }
      if (next.state === 'not-available' && manualUpdateCheckRef.current) {
        manualUpdateCheckRef.current = false;
        setToast({ message: 'Keine neue Version gefunden', tone: 'info' });
      }
      if (next.state === 'error') {
        manualUpdateCheckRef.current = false;
        setToast({ message: next.message || 'Update fehlgeschlagen', tone: 'error' });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!db) return;
    setEntries(db.loadMonth(activeMonth).days);
    carryInForMonth(db, settings, activeMonth).then(setCarryIn);
  }, [db, activeMonth, settings]);

  async function saveEntries(next: DayEntry[]) {
    setEntries(next);
    if (!db) return;
    await db.saveMonth(activeMonth, next);
    setStoredMonthKeys(db.listMonthKeys());
    const nextCarry = await carryInForMonth(db, settings, activeMonth);
    setCarryIn(nextCarry);
  }

  async function saveSettings(next: Settings) {
    setSettings(next);
    if (!db) return;
    await db.saveSettings(next);
    setCarryIn(await carryInForMonth(db, next, activeMonth));
  }

  async function persistCurrentWorkMonth(nextMonth: string) {
    const nextSettings = { ...settings, currentWorkMonth: nextMonth };
    setSettings(nextSettings);
    setHomeMonth(nextMonth);
    if (!db) return;
    await db.saveSettings(nextSettings);
  }

  function updateEntry(date: string, patch: Partial<DayEntry>) {
    if (!editable) return;
    const next = normalizeMonthEntries(entries, activeMonth).map((entry) =>
      entry.date === date ? { ...entry, ...patch } : entry
    );
    void saveEntries(next);
  }

  function updateRemark(date: string, remark: string) {
    const patch: Partial<DayEntry> =
      remark === 'Ausgleichstag'
        ? { remark, start: '', end: '', pause: '', pauseManual: false, endManual: false }
        : { remark };
    updateEntry(date, patch);
  }

  function setFieldRef(date: string, field: 'start' | 'end' | 'pause' | 'remark') {
    return (element: HTMLInputElement | null) => {
      fieldRefs.current[`${date}:${field}`] = element;
    };
  }

  function focusNextWorkday(date: string) {
    const nextDay = calculated.days.find((day) => day.date > date && day.targetMinutes > 0);
    if (!nextDay) return;
    fieldRefs.current[`${nextDay.date}:start`]?.focus();
  }

  function handleTimeBlur(entry: DayEntry, field: 'start' | 'end', value: string) {
    const rounded = settings.roundToTenMinutes ? roundClockToTen(value) : value;
    const patch: Partial<DayEntry> = { [field]: rounded };
    const day = calculated.days.find((item) => item.date === entry.date);
    if (field === 'start' && rounded && !entry.endManual && day?.targetMinutes) {
      patch.end = autoEndForStart(rounded, day.targetMinutes);
      patch.endManual = false;
    }
    if (field === 'end') patch.endManual = Boolean(rounded);
    updateEntry(entry.date, patch);
  }

  function openArchiveMonth(next: string) {
    if (!next) return;
    setLockedView(true);
    setActiveMonth(next);
  }

  async function triggerManualUpdateCheck() {
    if (!window.gleito) {
      showToast('Update-Suche nur in der Desktop-App verfügbar', 'info');
      return;
    }
    manualUpdateCheckRef.current = true;
    const result = await window.gleito.checkForAppUpdate();
    if (!result.supported) {
      manualUpdateCheckRef.current = false;
      showToast('Update-Suche nur in installierten Versionen verfügbar', 'info');
      return;
    }
    if (result.started === false) {
      showToast('Update-Suche läuft bereits', 'info');
    }
  }

  function showToast(
    message: string,
    tone: ToastTone,
    actionLabel?: string,
    onAction?: () => void | Promise<void>,
    persistent = false
  ) {
    setToast({ message, tone, actionLabel, onAction, persistent });
  }

  function unlockArchiveMonth() {
    const unlock = window.confirm('Vergangene Monate sollen normalerweise nur angesehen werden. Bearbeitung wirklich entsperren?');
    if (!unlock) return;
    setLockedView(false);
  }

  async function exportPdf() {
    const html = buildPrintHtml(settings, calculated.days, calculated.summary);
    const fileName = `Gleitzettel_${activeMonth}_${settings.employeeName || 'Monat'}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
    try {
      const path = window.gleito ? await window.gleito.exportPdf(html, fileName) : null;
      if (path) showToast('PDF exportiert', 'success');
      return path;
    } catch (error) {
      showToast('PDF-Export fehlgeschlagen', 'error');
      return null;
    }
  }

  async function closeMonth() {
    const exported = await exportPdf();
    if (!exported) return;
    const nextMonth = shiftMonth(activeMonth, 1);
    if (db) {
      const nextMonthData = db.loadMonth(nextMonth);
      await db.saveMonth(nextMonth, nextMonthData.days);
      setStoredMonthKeys(db.listMonthKeys());
    }
    await persistCurrentWorkMonth(nextMonth);
    setLockedView(false);
    setActiveMonth(nextMonth);
    setShowCloseModal(false);
  }

  async function exportBackup() {
    if (!db || !window.gleito) {
      showToast('Export nur in der Desktop-App verfuegbar', 'info');
      return;
    }
    const fileName = `Gleitzettel_Backup_${settings.employeeName || 'Daten'}.gleito`.replace(/[\\/:*?"<>| ]/g, '_');
    const result = await window.gleito.exportBackup(db.exportBytes(), fileName);
    if (result) showToast('Daten exportiert', 'success');
  }

  async function importBackup() {
    if (!window.gleito) {
      showToast('Import nur in der Desktop-App verfuegbar', 'info');
      return;
    }
    const bytes = await window.gleito.importBackup();
    if (!bytes) return;
    await window.gleito.saveDb(bytes);
    const database = await openDatabase();
    await hydrateFromDatabase(database, activeMonth);
    showToast('Daten importiert', 'success');
  }

  async function resetAllData() {
    if (!db) return;
    const freshSettings = defaultSettings();
    await db.resetAll(freshSettings);
    await hydrateFromDatabase(db, freshSettings.currentWorkMonth);
    setLockedView(false);
    setView('settings');
    setShowResetModal(false);
    showToast('Alle Daten wurden zurueckgesetzt', 'info');
  }

  if (!db) {
    return <main className="loading">Gleitzettel wird vorbereitet...</main>;
  }

  return (
    <main
      className="app-shell"
      style={{
        ['--surface-opacity' as string]: String(effectiveSurfaceOpacity),
        ['--table-opacity' as string]: String(effectiveTableOpacity),
        ['--window-opacity' as string]: String(effectiveWindowOpacity),
        ['--app-background-image' as string]: backgroundSource ? `url("${backgroundSource}")` : 'none'
      }}
    >
      <header className="topbar">
        <div>
          <p className="eyebrow app-eyebrow"><img className="app-logo-mark" src={appLogo} alt="" aria-hidden="true" />Lokaler Gleitzeitnachweis</p>
          <h1>{view === 'month' ? monthName(activeMonth) : 'Einstellungen'}</h1>
        </div>
        <div className="actions">
          <img className="mannheim-logo" src={mannheimLogo} alt="Stadt Mannheim" />
          <button
            className={lockedView ? 'return-button' : view === 'month' ? 'active' : ''}
            onClick={() => {
              setView('month');
              setActiveMonth(homeMonth);
              setLockedView(false);
            }}
            title="Monat"
          >
            <CalendarDays size={18} /> {lockedView ? '-> Monat' : 'Monat'}
          </button>
          <label className="archive-picker" title="Archiv">
            <Archive size={16} />
            <select value={lockedView ? activeMonth : ''} onChange={(event) => openArchiveMonth(event.currentTarget.value)}>
              <option value="">Archiv</option>
              {archiveMonths.map((month) => (
                <option key={month} value={month}>
                  {monthName(month)}
                </option>
              ))}
            </select>
          </label>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')} title="Einstellungen">
            <SettingsIcon size={18} /> Einstellungen
          </button>
          <button onClick={exportPdf} title="PDF exportieren">
            <Download size={18} /> PDF
          </button>
        </div>
      </header>

      {view === 'settings' ? (
        <SettingsPanel
          settings={settings}
          appVersion={appVersion}
          updateStatus={updateStatus}
          onChange={saveSettings}
          onExportBackup={exportBackup}
          onImportBackup={importBackup}
          onCheckForUpdates={triggerManualUpdateCheck}
          onResetAllData={() => setShowResetModal(true)}
        />
      ) : (
        <>
          {lockedView && (
            <section className="archive-banner">
              <span className="badge">
                <Eye size={14} /> Nur Ansicht
              </span>
              <button className="ghost-button" onClick={unlockArchiveMonth}>
                Bearbeiten entsperren
              </button>
            </section>
          )}

          <MonthSummaryBand
            summary={calculated.summary}
            position="top"
            settings={settings}
            action={
              <button className="close-month-button" onClick={() => setShowCloseModal(true)} disabled={lockedView}>
                <Lock size={16} /> Monat abschliessen
              </button>
            }
          />

          <section className="table-shell">
          <section className="table-wrap">
            <table className="month-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Wo</th>
                  <th>Beginn</th>
                  <th>Ende</th>
                  <th>Pause</th>
                  <th>Ist</th>
                  <th>Soll</th>
                  <th>Plus</th>
                  <th>Minus</th>
                  <th>Bemerkungen</th>
                  <th>Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {calculated.days.map((day) => (
                  <tr
                    key={day.date}
                    className={`${day.weekday === 'sat' || day.weekday === 'sun' ? 'weekend' : ''} ${day.holidayName ? 'holiday' : ''} ${day.date === todayDateKey ? 'today' : ''} ${
                      settings.highlightOpenPlannedDays &&
                      day.targetMinutes > 0 &&
                      !day.start &&
                      !day.end &&
                      !day.remark
                        ? 'open-day'
                        : ''
                    }`}
                  >
                    <td>{Number(day.date.slice(-2))}</td>
                    <td>{day.weekdayLabel}</td>
                    <td>
                      <input
                        ref={setFieldRef(day.date, 'start')}
                        disabled={!editable}
                        type="time"
                        value={day.start}
                        onChange={(event) => updateEntry(day.date, { start: event.currentTarget.value })}
                        onBlur={(event) => handleTimeBlur(day, 'start', event.currentTarget.value)}
                      />
                    </td>
                    <td>
                      <input
                        ref={setFieldRef(day.date, 'end')}
                        disabled={!editable}
                        type="time"
                        value={day.end}
                        onChange={(event) => updateEntry(day.date, { end: event.currentTarget.value, endManual: Boolean(event.currentTarget.value) })}
                        onBlur={(event) => handleTimeBlur(day, 'end', event.currentTarget.value)}
                      />
                    </td>
                    <td>
                      <input
                        ref={setFieldRef(day.date, 'pause')}
                        disabled={!editable}
                        className="duration"
                        value={day.pause}
                        placeholder="auto"
                        onChange={(event) => updateEntry(day.date, { pause: event.currentTarget.value, pauseManual: true })}
                        onKeyDown={(event) => {
                          if (event.key === 'Tab' && !event.shiftKey) {
                            event.preventDefault();
                            focusNextWorkday(day.date);
                          }
                        }}
                      />
                    </td>
                    <td>{day.actualMinutes ? formatMinutes(day.actualMinutes) : ''}</td>
                    <td>{day.targetMinutes ? formatMinutes(day.targetMinutes) : ''}</td>
                    <td className="plus">{day.plusMinutes ? formatMinutes(day.plusMinutes) : ''}</td>
                    <td className="minus">{day.minusMinutes ? formatMinutes(day.minusMinutes) : ''}</td>
                    <td>
                      <RemarkField
                        inputRef={setFieldRef(day.date, 'remark')}
                        disabled={!editable}
                        value={day.remark}
                        placeholder={day.holidayName}
                        options={REMARKS}
                        onChange={(remark) => updateRemark(day.date, remark)}
                      />
                    </td>
                    <td className="warnings">
                      {day.warnings.length > 0 && (
                        <span className="warning-badge">
                          <AlertTriangle size={15} /> {day.warnings.length}
                          <span className="warning-tooltip">
                            {day.warnings.map((warning) => (
                              <span key={warning}>{warning}</span>
                            ))}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          </section>
          <MonthSummaryBand summary={calculated.summary} position="bottom" settings={settings} />
        </>
      )}
      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          <div className="toast-body">
            <span>{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button className="toast-action" onClick={() => void toast.onAction?.()}>
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
      {showCloseModal && (
        <div className="modal-backdrop" onClick={() => setShowCloseModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Monat abschliessen</h2>
              <button className="icon-button" onClick={() => setShowCloseModal(false)} aria-label="Schliessen">
                <X size={16} />
              </button>
            </div>
            <p className="modal-copy">
              Beim Abschliessen wird der aktuelle Monat als PDF exportiert. Nur wenn der Export erfolgreich gespeichert wurde, springt die App in den Folgemonat.
            </p>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setShowCloseModal(false)}>Abbrechen</button>
              <button onClick={closeMonth}>Jetzt abschliessen</button>
            </div>
          </div>
        </div>
      )}
      {showResetModal && (
        <div className="modal-backdrop" onClick={() => setShowResetModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Neu einrichten</h2>
              <button className="icon-button" onClick={() => setShowResetModal(false)} aria-label="Schliessen">
                <X size={16} />
              </button>
            </div>
            <p className="modal-copy">
              Alle Monate und Einstellungen werden zurückgesetzt. Danach kannst du den Gleitzettel neu einrichten.
            </p>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setShowResetModal(false)}>Abbrechen</button>
              <button className="danger-button" onClick={resetAllData}>Alles zurücksetzen</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MonthSummaryBand({
  summary,
  position,
  action,
  settings
}: {
  summary: ReturnType<typeof calculateMonth>['summary'];
  position: 'top' | 'bottom';
  action?: ReactNode;
  settings: Settings;
}) {
  if (position === 'top') {
    return (
      <section className="table-summary-band top">
        <div className="summary-action">{action}</div>
        <div className="summary-person">
          <span>{settings.employeeName}{settings.personalNumber ? ` (${settings.personalNumber})` : ''}</span>
          <strong>{settings.department || settings.dienststelle || 'Amt / FB / EB'}</strong>
        </div>
        <div className="summary-metric">
          <span>Plus</span>
          <strong className="summary-plus">{formatMinutes(summary.plusMinutes)}</strong>
        </div>
        <div className="summary-metric">
          <span>Minus</span>
          <strong className="summary-minus">{formatMinutes(summary.minusMinutes)}</strong>
        </div>
        <div className="summary-metric balance">
          <span>Übertrag</span>
          <strong>{formatMinutes(summary.carryInMinutes)}</strong>
        </div>
        <div className="summary-metric">
          <span>Summe +/-</span>
          <strong>{formatMinutes(summary.monthDeltaMinutes)}</strong>
        </div>
        <div className={`summary-inline-item ampel ${summary.trafficLight}`}>
          <span>Ampel</span>
          <strong>{summary.trafficLight === 'green' ? 'Gruen' : summary.trafficLight === 'yellow' ? 'Gelb' : 'Rot'}</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="table-summary-band bottom">
      <div className="summary-metric">
        <span>Plus</span>
        <strong className="summary-plus">{formatMinutes(summary.plusMinutes)}</strong>
      </div>
      <div className="summary-metric">
        <span>Minus</span>
        <strong className="summary-minus">{formatMinutes(summary.minusMinutes)}</strong>
      </div>
      <div className="summary-metric balance">
        <span>Übertrag</span>
        <strong>{formatMinutes(summary.carryInMinutes)}</strong>
      </div>
      <div className="summary-metric">
        <span>Saldo</span>
        <strong>{formatMinutes(summary.saldoMinutes)}</strong>
      </div>
      <div className={`summary-inline-item ampel ${summary.trafficLight}`}>
        <span>Ampel</span>
        <strong>{summary.trafficLight === 'green' ? 'Gruen' : summary.trafficLight === 'yellow' ? 'Gelb' : 'Rot'}</strong>
      </div>
    </section>
  );
}

function DurationSettingInput({
  value,
  onCommit,
  type = 'text'
}: {
  value: string;
  onCommit: (value: string) => void;
  type?: 'text' | 'month';
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type={type}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => onCommit(draft)}
    />
  );
}

function RemarkField({
  inputRef,
  disabled,
  value,
  placeholder,
  options,
  onChange
}: {
  inputRef: (element: HTMLInputElement | null) => void;
  disabled: boolean;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      });
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className={`remark-field ${open ? 'open' : ''}`}
    >
      <input
        ref={inputRef}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(false)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <button
        type="button"
        className="remark-toggle"
        disabled={disabled}
        aria-label="Bemerkungen anzeigen"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        ▼
      </button>
      {open && !disabled &&
        createPortal(
          <div
            ref={menuRef}
            className="remark-menu-overlay"
            style={{ top: `${menuStyle.top}px`, left: `${menuStyle.left}px`, width: `${menuStyle.width}px` }}
          >
            {options.map((option) => (
              <button
                type="button"
                key={option || 'empty'}
                className={`remark-option ${value === option ? 'selected' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option || 'Leeren'}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function SettingsPanel({
  settings,
  appVersion,
  updateStatus,
  onChange,
  onExportBackup,
  onImportBackup,
  onCheckForUpdates,
  onResetAllData
}: {
  settings: Settings;
  appVersion: string;
  updateStatus: UpdateStatusPayload | null;
  onChange: (settings: Settings) => Promise<void>;
  onExportBackup: () => Promise<void>;
  onImportBackup: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onResetAllData: () => void | Promise<void>;
}) {
  const [showTrafficSettings, setShowTrafficSettings] = useState(false);

  function update(patch: Partial<Settings>) {
    void onChange({ ...settings, ...patch });
  }

  function updateWeekday(key: WeekdayKey, patch: Partial<Settings['weekdays'][WeekdayKey]>) {
    void onChange({
      ...settings,
      weekdays: { ...settings.weekdays, [key]: { ...settings.weekdays[key], ...patch } }
    });
  }

  function updateTraffic(key: keyof Settings['trafficThresholds'], value: string) {
    update({
      trafficThresholds: {
        ...settings.trafficThresholds,
        [key]: Math.max(0, parseDuration(value))
      }
    });
  }

  return (
    <section className="settings-grid">
      <div className="panel">
        <h2>Person</h2>
        <label>Name<input value={settings.employeeName} onChange={(e) => update({ employeeName: e.currentTarget.value })} /></label>
        <label>Dienststelle<input value={settings.dienststelle} onChange={(e) => update({ dienststelle: e.currentTarget.value })} /></label>
        <label>Kostenstelle<input value={settings.kostenstelle} onChange={(e) => update({ kostenstelle: e.currentTarget.value })} /></label>
        <label>Personalnummer<input value={settings.personalNumber} onChange={(e) => update({ personalNumber: e.currentTarget.value })} /></label>
        <label>Amt / FB / EB<input value={settings.department} onChange={(e) => update({ department: e.currentTarget.value })} /></label>
        <div className="backup-actions">
          <button type="button" className="ghost-button" onClick={() => void onExportBackup()}>Daten exportieren</button>
          <button type="button" className="ghost-button" onClick={() => void onImportBackup()}>Daten importieren</button>
        </div>
        <div className="backup-actions">
          <button type="button" className="danger-button" onClick={() => void onResetAllData()}>Alle Daten zurücksetzen</button>
        </div>
      </div>

      <div className="panel">
        <h2>Arbeitszeit</h2>
        <div className="weekday-settings">
          {WEEKDAYS.map((day) => (
            <div className="weekday-row" key={day.key}>
              <span>{day.label}</span>
              <DurationSettingInput
                value={minutesInput(settings.weekdays[day.key].targetMinutes)}
                onCommit={(value) => updateWeekday(day.key, { targetMinutes: Math.max(0, parseDuration(value)) })}
              />
              <label className="check"><input type="checkbox" checked={settings.weekdays[day.key].workAllowed} onChange={(e) => updateWeekday(day.key, { workAllowed: e.currentTarget.checked })} /> erlaubt</label>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Regeln</h2>
        <label>Startmonat Gleitzettel<DurationSettingInput type="month" value={settings.trackingStartMonth} onCommit={(value) => update({ trackingStartMonth: value || settings.trackingStartMonth })} /></label>
        <label>Übertrag Jahresbeginn<DurationSettingInput value={formatMinutes(settings.initialCarryoverMinutes)} onCommit={(value) => update({ initialCarryoverMinutes: parseDuration(value) })} /></label>
        <label>Mehrarbeitsstunden-Obergrenze<DurationSettingInput value={minutesInput(settings.overtimeLimitMinutes)} onCommit={(value) => update({ overtimeLimitMinutes: Math.max(1, parseDuration(value)) })} /></label>
        <label>Minuszählung
          <select value={settings.minusCountingMode} onChange={(e) => update({ minusCountingMode: e.currentTarget.value as Settings['minusCountingMode'] })}>
            <option value="planned_days">Offene Solltage als Minus zählen</option>
            <option value="explicit_only">Nur echte Minuseinträge zählen</option>
          </select>
        </label>
        <button type="button" className="ghost-button threshold-toggle" onClick={() => setShowTrafficSettings((current) => !current)}>
          <SlidersHorizontal size={16} /> Ampelgrenzen Mehrarbeit
        </button>
        {showTrafficSettings && (
          <div className="threshold-grid">
            <div className="threshold-block">
              <strong>Plusstunden</strong>
              <label>Gruen bis<DurationSettingInput value={minutesInput(settings.trafficThresholds.plusGreenUntilMinutes)} onCommit={(value) => updateTraffic('plusGreenUntilMinutes', value)} /></label>
              <label>Gelb bis<DurationSettingInput value={minutesInput(settings.trafficThresholds.plusYellowUntilMinutes)} onCommit={(value) => updateTraffic('plusYellowUntilMinutes', value)} /></label>
              <label>Rot ab<DurationSettingInput value={minutesInput(settings.trafficThresholds.plusRedFromMinutes)} onCommit={(value) => updateTraffic('plusRedFromMinutes', value)} /></label>
            </div>
            <div className="threshold-block">
              <strong>Minusstunden</strong>
              <label>Gruen bis<DurationSettingInput value={minutesInput(settings.trafficThresholds.minusGreenUntilMinutes)} onCommit={(value) => updateTraffic('minusGreenUntilMinutes', value)} /></label>
              <label>Gelb bis<DurationSettingInput value={minutesInput(settings.trafficThresholds.minusYellowUntilMinutes)} onCommit={(value) => updateTraffic('minusYellowUntilMinutes', value)} /></label>
              <label>Rot ab<DurationSettingInput value={minutesInput(settings.trafficThresholds.minusRedFromMinutes)} onCommit={(value) => updateTraffic('minusRedFromMinutes', value)} /></label>
            </div>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={settings.warnBeforeSix} onChange={(e) => update({ warnBeforeSix: e.currentTarget.checked })} /> Warnung vor 06:00 Uhr</label>
        <label className="check"><input type="checkbox" checked={settings.warnAfterSix} onChange={(e) => update({ warnAfterSix: e.currentTarget.checked })} /> Warnung nach 18:00 Uhr</label>
        <label className="check"><input type="checkbox" checked={settings.roundToTenMinutes} onChange={(e) => update({ roundToTenMinutes: e.currentTarget.checked })} /> Kaufmännisch auf 10 Minuten runden</label>
      </div>

      <div className="panel">
        <h2>Feiertage</h2>
        <label>Bundesland
          <select value={settings.holidayRegion} onChange={(e) => update({ holidayRegion: e.currentTarget.value as Settings['holidayRegion'] })}>
            {holidayRegions().map((region) => <option value={region.key} key={region.key}>{region.name}</option>)}
          </select>
        </label>
        <label>Zusätzliche freie Tage
          <textarea
            value={settings.customHolidays.join('\n')}
            placeholder="2026-12-24"
            onChange={(e) => update({ customHolidays: e.currentTarget.value.split(/\s+/).filter(Boolean) })}
          />
        </label>
        <p className="hint"><Save size={14} /> Änderungen werden automatisch gespeichert.</p>
      </div>

      <div className="panel">
        <h2>Darstellung</h2>
        <label className="check"><input type="checkbox" checked={settings.backgroundEnabled} onChange={(e) => update({ backgroundEnabled: e.currentTarget.checked })} /> Hintergrundbild anzeigen</label>
        <label className="check"><input type="checkbox" checked={settings.translucentSurfaces} onChange={(e) => update({ translucentSurfaces: e.currentTarget.checked })} /> Kacheltransparenz aktivieren</label>
        <label className="check"><input type="checkbox" checked={settings.highlightOpenPlannedDays} onChange={(e) => update({ highlightOpenPlannedDays: e.currentTarget.checked })} /> Offene Soll-Tage dezent markieren</label>
      </div>

      <div className="panel">
        <h2>Updates</h2>
        <p className="hint">Version {appVersion || '...'}</p>
        <div className="backup-actions">
          <button type="button" className="ghost-button" onClick={() => void onCheckForUpdates()}>
            Nach Updates suchen
          </button>
        </div>
        {updateStatus && updateStatus.state !== 'not-available' && (
          <p className="hint">
            {updateStatus.state === 'checking' && 'Suche läuft'}
            {updateStatus.state === 'available' && `Update ${updateStatus.version ?? ''} gefunden`}
            {updateStatus.state === 'downloading' && `Download ${updateStatus.percent ?? 0}%`}
            {updateStatus.state === 'downloaded' && `Update ${updateStatus.version ?? ''} bereit`}
            {updateStatus.state === 'error' && (updateStatus.message || 'Update fehlgeschlagen')}
          </p>
        )}
      </div>
    </section>
  );
}
