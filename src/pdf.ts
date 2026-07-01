import type { CalculatedDay, MonthSummary, Settings } from './domain/types';
import { monthName } from './domain/calc';
import { formatMinutes } from './domain/time';
import mannheimLogo from '../assets/Mannheim_Weiß.png?inline';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isOfficialCityLayout(settings: Settings): boolean {
  return settings.pdfExportLayout === 'stadt-mannheim';
}

function splitMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

function adjacentMonthName(key: string, offset: number): string {
  const { year, month } = splitMonthKey(key);
  const date = new Date(year, month - 1 + offset, 1);
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(date);
}

function timeOrEmpty(value: string): string {
  return value || '';
}

function durationOrEmpty(minutes: number, showZero = false): string {
  if (!minutes && !showZero) return '';
  return formatMinutes(minutes);
}

function splitSignedMinutes(minutes: number, forceZero = false): { plus: string; minus: string } {
  if (minutes > 0) return { plus: durationOrEmpty(minutes, forceZero), minus: '' };
  if (minutes < 0) return { plus: forceZero ? '0:00' : '', minus: durationOrEmpty(Math.abs(minutes), true) };
  return { plus: forceZero ? '0:00' : '', minus: forceZero ? '0:00' : '' };
}

function remarkForCity(day: CalculatedDay): string {
  if (day.holidayName) return day.holidayName;
  if (day.remark === 'Ausgleichstag') return 'Zeitausgleich';
  return day.remark;
}

function cityDataRows(days: CalculatedDay[]): string {
  return days
    .map((day) => {
      const hasTimeEntry = Boolean(day.start || day.end || day.pause);
      const hasRemark = Boolean(day.remark);
      const showZeroDuration = hasTimeEntry || day.remark === 'Ausgleichstag';
      const remark = remarkForCity(day);
      return `
        <tr>
          <td class="num">${Number(day.date.slice(-2))}</td>
          <td class="weekday">${day.weekdayLabel}</td>
          <td>${escapeHtml(timeOrEmpty(day.start))}</td>
          <td>${escapeHtml(timeOrEmpty(day.end))}</td>
          <td>${escapeHtml(day.pause || (showZeroDuration ? '00:00' : ''))}</td>
          <td>${durationOrEmpty(day.actualMinutes, showZeroDuration)}</td>
          <td>${durationOrEmpty(day.targetMinutes, day.targetMinutes > 0 && (hasTimeEntry || hasRemark))}</td>
          <td>${durationOrEmpty(day.plusMinutes)}</td>
          <td>${durationOrEmpty(day.minusMinutes)}</td>
          <td class="remark ${day.holidayName ? 'holiday-text' : ''}">${escapeHtml(remark)}</td>
        </tr>`;
    })
    .join('');
}

function buildCityPrintHtml(settings: Settings, days: CalculatedDay[], summary: MonthSummary): string {
  const { year, month } = splitMonthKey(summary.monthKey);
  const previousMonth = adjacentMonthName(summary.monthKey, -1);
  const nextMonth = adjacentMonthName(summary.monthKey, 1);
  const hasWeekendWork = days.some((day) => (day.weekday === 'sat' || day.weekday === 'sun') && day.actualMinutes > 0);
  const footerNotes = [
    ...(hasWeekendWork ? ['Wochenenden berechnet !'] : []),
    ...Array.from(new Set(days.flatMap((day) => day.warnings)))
  ];
  const carrySplit = splitSignedMinutes(summary.carryInMinutes);
  const saldoComponents = {
    plus: Math.max(summary.carryInMinutes, 0) + summary.plusMinutes,
    minus: Math.max(-summary.carryInMinutes, 0) + summary.minusMinutes
  };
  const carryOutSplit = splitSignedMinutes(summary.saldoMinutes, true);
  const phase = summary.trafficLight === 'green' ? 'GRUEN' : summary.trafficLight === 'yellow' ? 'GELB' : 'ROT';
  const department = settings.dienststelle || settings.kostenstelle || '';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10pt; }
    .stadt-page {
      width: 210mm;
      min-height: 297mm;
      padding: 10mm 22mm 4mm 22mm;
      position: relative;
    }
    .sheet { width: 166mm; margin: 0 auto; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    .top-table td {
      border: 1.5pt solid #000;
      height: 11mm;
      vertical-align: top;
      padding: 1mm 1.4mm;
    }
    .top-label { display: block; font-size: 7pt; line-height: 1; }
    .top-value { display: block; font-size: 13pt; line-height: 1.25; text-align: center; }
    .month-cell { border-right: 0 !important; }
    .top-title {
      font-size: 18pt;
      font-weight: 700;
      text-align: center;
      vertical-align: middle !important;
    }
    .title-logo {
      border-left: 0 !important;
      border-right: 1.5pt solid #000;
      border-top: 1.5pt solid #000;
      border-bottom: 1.5pt solid #000;
      padding: 0 1.4mm !important;
      vertical-align: middle !important;
    }
    .title-logo-inner {
      display: grid;
      grid-template-columns: 37mm 1fr;
      align-items: center;
      height: 100%;
    }
    .city-logo {
      font-size: 14.5pt;
      font-weight: 700;
      letter-spacing: 0;
      white-space: nowrap;
      text-align: right;
      vertical-align: middle !important;
      color: #111;
      overflow: hidden;
    }
    .city-logo span { color: #6b6b6b; font-weight: 400; }
    .city-logo sup { font-size: 7pt; }
    .person-row {
      display: grid;
      grid-template-columns: 1fr 35mm 55mm;
      border-left: 1.5pt solid #000;
      border-right: 1.5pt solid #000;
      border-bottom: 1.5pt solid #000;
      min-height: 13mm;
    }
    .person-cell { padding: 0.8mm 1.2mm; }
    .name-label { display: block; font-size: 7pt; font-weight: 700; line-height: 1; }
    .name-value { display: block; font-size: 16pt; line-height: 1.05; }
    .hash-cell {
      font-size: 10pt;
      font-weight: 700;
      text-align: center;
      padding-top: 1.5mm;
    }
    .version-cell {
      text-align: right;
      font-size: 10pt;
      font-weight: 700;
      line-height: 1.55;
      padding: 0.7mm 1.4mm;
    }
    .time-table { border-left: 0; border-right: 1.5pt solid #000; }
    .time-table th, .time-table td {
      border: 0.35pt solid #aaa;
      height: 4.95mm;
      padding: 0 1mm;
      text-align: center;
      vertical-align: middle;
      font-weight: 400;
    }
    .time-table thead th {
      border-color: #000;
      font-size: 7pt;
      line-height: 1.15;
      background: #fff;
    }
    .time-table thead .group {
      font-size: 9pt;
      font-weight: 700;
      height: 6.4mm;
      border-bottom: 0 !important;
    }
    .time-table thead .sub {
      font-size: 8pt;
      height: 5.2mm;
    }
    .time-table thead .tiny { font-size: 7pt; }
    .time-table thead tr:nth-child(2) th:nth-child(-n+8) {
      border-top: 0 !important;
    }
    .time-table thead .carry-label {
      text-align: left;
      font-size: 7pt;
      font-weight: 700;
      padding-left: 1mm;
    }
    .time-table thead .carry-value {
      text-align: center;
      font-size: 11pt;
      font-weight: 700;
    }
    .time-table thead .carry-plus {
      border-left: 1.5pt solid #000 !important;
    }
    .time-table thead .carry-minus {
      border-right: 1.5pt solid #000 !important;
    }
    .time-table tbody td {
      font-size: 10pt;
      height: 4.8mm;
      line-height: 1;
    }
    .time-table .num { text-align: right; padding-right: 2mm; }
    .time-table .weekday { text-align: left; padding-left: 1mm; }
    .time-table .remark {
      text-align: left;
      font-size: 11pt;
      padding-left: 1mm;
      white-space: nowrap;
      overflow: hidden;
    }
    .time-table .holiday-text { text-align: right; padding-right: 1.5mm; }
    .time-table tbody td:nth-child(1),
    .time-table tbody td:nth-child(2),
    .time-table tbody td:nth-child(5),
    .time-table tbody td:nth-child(9),
    .time-table tbody td:nth-child(10) { border-right: 1.5pt solid #000; }
    .time-table tbody td:nth-child(1),
    .time-table tbody td:nth-child(6) { border-left: 1.5pt solid #000; }
    .time-table tfoot td {
      height: 7.4mm;
      font-size: 9pt;
      font-weight: 700;
      border: 0;
      text-align: center;
      vertical-align: middle;
      padding: 0 1mm;
    }
    .time-table tfoot .summary-label {
      border: 0 !important;
      border-left-style: hidden !important;
      text-align: right;
      padding-right: 2mm;
    }
    .time-table tfoot tr:first-child .summary-label {
      border-top: 0 !important;
    }
    .time-table tfoot .summary-plus {
      border-left: 1.5pt solid #000;
      border-right: 0.35pt solid #aaa;
    }
    .time-table tfoot .summary-minus {
      border-right: 1.5pt solid #000;
    }
    .time-table tfoot .summary-carry-cell {
      border-left: 1.5pt solid #000;
      border-right: 1.5pt solid #000;
      border-bottom: 0;
      padding: 0;
      vertical-align: top;
    }
    .time-table tfoot .summary-carry-spacer {
      border-left: 1.5pt solid #000;
      border-right: 1.5pt solid #000;
    }
    .time-table tfoot tr:first-child .summary-plus,
    .time-table tfoot tr:first-child .summary-minus {
      border-top: 1.5pt solid #000;
    }
    .time-table tfoot tr:last-child .summary-plus,
    .time-table tfoot tr:last-child .summary-minus {
      border-bottom: 1.5pt solid #000;
    }
    .thick-left { border-left: 1.5pt solid #000 !important; }
    .thick-right { border-right: 1.5pt solid #000 !important; }
    .thick-top { border-top: 1.5pt solid #000 !important; }
    .thick-bottom { border-bottom: 1.5pt solid #000 !important; }
    .footer-grid {
      display: grid;
      grid-template-columns: 64mm 24mm 24mm 54mm;
      align-items: start;
      min-height: 24mm;
      margin-top: -36mm;
    }
    .weekend-note {
      font-weight: 700;
      font-style: italic;
      font-size: 10pt;
      padding: 3mm 0 0 8mm;
    }
    .phase-box { grid-column: 1 / 2; grid-row: 1; padding-top: 16mm; display: grid; gap: 2mm; }
    .phase-value {
      border: 1.5pt solid #000;
      width: 24mm;
      height: 11mm;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11pt;
      font-weight: 700;
      margin-left: 2mm;
    }
    .phase-note {
      font-weight: 700;
      font-style: italic;
      font-size: 8pt;
      min-height: 8mm;
      margin-left: 8mm;
      line-height: 1.2;
    }
    .phase-note div { min-height: 4mm; }
    .carry-out {
      border: 1.5pt solid #000;
      height: 10.5mm;
      padding: 1mm;
      font-size: 7pt;
      font-weight: 700;
    }
    .carry-out strong {
      display: block;
      text-align: center;
      font-size: 10pt;
      margin-top: 1mm;
    }
    .signature-grid {
      position: absolute;
      left: 22mm;
      right: 22mm;
      bottom: 25mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10mm;
      margin-top: 0;
    }
    .signature-grid > div { position: relative; }
    .signature {
      height: 18mm;
      border-left: 0.8pt solid #000;
      border-bottom: 0.35pt solid #aaa;
      padding: 1mm;
      font-size: 8pt;
      position: relative;
    }
    .signature .role {
      position: absolute;
      left: 1mm;
      bottom: -5mm;
      font-size: 8pt;
    }
    .confirm {
      position: absolute;
      left: 0;
      right: 0;
      top: 8mm;
      text-align: center;
      font-size: 9pt;
      font-weight: 700;
      margin-top: 0;
      line-height: 1.25;
    }
    .created-by {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 1.5mm;
      text-align: center;
      font-size: 7pt;
    }
  </style>
</head>
<body>
  <main class="stadt-page">
    <section class="sheet">
      <table class="top-table">
        <colgroup>
          <col style="width: 17mm" />
          <col style="width: 36mm" />
          <col style="width: 25mm" />
          <col style="width: 37mm" />
          <col style="width: 51mm" />
        </colgroup>
        <tr>
          <td><span class="top-label">Dienststelle</span><span class="top-value">${escapeHtml(department)}</span></td>
          <td class="month-cell"><span class="top-label"><strong>Kalendermonat / Jahr</strong></span><span class="top-value"><strong>${month} / ${year}</strong></span></td>
          <td class="title-logo" colspan="3">
            <div class="title-logo-inner">
              <div class="top-title">Zeitkonto</div>
              <div class="city-logo"><span>STADT</span>MANNHEIM<sup>2</sup></div>
            </div>
          </td>
        </tr>
      </table>
      <div class="person-row">
        <div class="person-cell"><span class="name-label">Name, Vorname</span><span class="name-value">${escapeHtml(settings.employeeName)}</span></div>
        <div class="hash-cell">${escapeHtml(settings.personalNumber || '')}</div>
        <div class="version-cell">Version 2026-03b<br />${escapeHtml(settings.kostenstelle || '')}</div>
      </div>

      <table class="time-table">
        <colgroup>
          <col style="width: 8mm" />
          <col style="width: 8mm" />
          <col style="width: 12mm" />
          <col style="width: 12mm" />
          <col style="width: 12mm" />
          <col style="width: 12mm" />
          <col style="width: 12mm" />
          <col style="width: 12mm" />
          <col style="width: 12mm" />
          <col style="width: 66mm" />
        </colgroup>
        <thead>
          <tr>
            <th rowspan="4" class="thick-left thick-right thick-top">Kalen-<br />der-<br />tag</th>
            <th rowspan="4" class="thick-right thick-top">Wo-<br />chen-<br />tag</th>
            <th colspan="2" class="group thick-top">Arbeits-</th>
            <th class="group thick-top">Pause</th>
            <th colspan="4" class="group thick-left thick-right thick-top">Arbeitszeit</th>
            <th class="group thick-top thick-right">Bemerkungen</th>
          </tr>
          <tr>
            <th class="sub">beginn</th>
            <th class="sub">ende</th>
            <th class="tiny">Abwesend</th>
            <th class="sub thick-left">Ist</th>
            <th class="sub">Soll</th>
            <th class="sub">Plus</th>
            <th class="sub thick-right">Minus</th>
            <th class="tiny thick-right">(z.B. Urlaub, Krankheit,<br />Zeitausgleich, Ausgleichstag)</th>
          </tr>
          <tr>
            <th class="tiny">Std./Min.</th>
            <th class="tiny">Std./Min.</th>
            <th class="tiny">Std./Min.</th>
            <th class="tiny thick-left">Std./Min.</th>
            <th class="tiny">Std./Min.</th>
            <th class="tiny">Std./Min.</th>
            <th class="tiny thick-right">Std./Min.</th>
            <th class="carry-label thick-right">Übertrag aus Monat</th>
          </tr>
          <tr>
            <th colspan="2">Uhrzeit</th>
            <th colspan="3">Zeitdauer</th>
            <th class="carry-value carry-plus">${carrySplit.plus}</th>
            <th class="carry-value carry-minus">${carrySplit.minus}</th>
            <th class="carry-value thick-right">${escapeHtml(previousMonth)}</th>
          </tr>
        </thead>
        <tbody>
          ${cityDataRows(days)}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" class="summary-label">Summe +/-</td>
            <td class="summary-plus">${durationOrEmpty(summary.plusMinutes)}</td>
            <td class="summary-minus">${durationOrEmpty(summary.minusMinutes)}</td>
            <td class="summary-carry-spacer"></td>
          </tr>
          <tr>
            <td colspan="7" class="summary-label">Saldo</td>
            <td class="summary-plus">${durationOrEmpty(saldoComponents.plus, true)}</td>
            <td class="summary-minus">${durationOrEmpty(saldoComponents.minus, true)}</td>
            <td class="summary-carry-spacer"></td>
          </tr>
          <tr>
            <td colspan="7" class="summary-label">Übertrag</td>
            <td class="summary-plus">${carryOutSplit.plus}</td>
            <td class="summary-minus">${carryOutSplit.minus}</td>
            <td class="summary-carry-cell"><div class="carry-out">Übertrag nach Monat<strong>${escapeHtml(nextMonth)}</strong></div></td>
          </tr>
        </tfoot>
      </table>

      <div class="footer-grid">
        <div class="weekend-note"></div>
        <div class="phase-box">
          <div class="phase-note">${footerNotes.map((note) => `<div>${escapeHtml(note)}</div>`).join('')}</div>
          <div>${escapeHtml(settings.kostenstelle || '')}</div>
          <div>Phase:<span class="phase-value">${phase}</span></div>
        </div>
      </div>

      <div class="signature-grid">
        <div class="signature">Unterschrift:<span class="role">Führungskraft</span></div>
        <div>
          <div class="signature">Unterschrift:<span class="role">Mitarbeiter*in</span></div>
          <div class="confirm">Hiermit wird die Richtigkeit des Übertrags<br />und aller Einträge bestätigt.</div>
        </div>
      </div>
    </section>
    <div class="created-by">Dieser Ausdruck wurde mit dem EXCEL-Zeitkonto des Fachbereich Organisation und Personal erstellt</div>
  </main>
</body>
</html>`;
}

export function buildPrintHtml(settings: Settings, days: CalculatedDay[], summary: MonthSummary): string {
  if (isOfficialCityLayout(settings)) return buildCityPrintHtml(settings, days, summary);

  const trafficClass = `traffic-${summary.trafficLight}`;
  const trafficLabel = summary.trafficLight === 'green' ? 'Grün' : summary.trafficLight === 'yellow' ? 'Gelb' : 'Rot';
  const rows = days
    .map(
      (day) => `
        <tr>
          <td>${Number(day.date.slice(-2))}</td>
          <td>${day.weekdayLabel}</td>
          <td>${escapeHtml(day.start)}</td>
          <td>${escapeHtml(day.end)}</td>
          <td>${escapeHtml(day.pause)}</td>
          <td>${day.actualMinutes ? formatMinutes(day.actualMinutes) : ''}</td>
          <td>${day.targetMinutes ? formatMinutes(day.targetMinutes) : ''}</td>
          <td>${day.plusMinutes ? formatMinutes(day.plusMinutes) : ''}</td>
          <td>${day.minusMinutes ? formatMinutes(day.minusMinutes) : ''}</td>
          <td>${escapeHtml(day.remark || day.holidayName)}</td>
        </tr>`
    )
    .join('');
  const warnings = days.flatMap((day) => day.warnings.map((warning) => `${day.date}: ${warning}`));

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #171717; font-size: 10px; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; gap: 18px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 0; }
    .brand { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; text-align: right; }
    .brand img { width: 210px; height: auto; object-fit: contain; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 14px; margin-bottom: 10px; }
    .box { border: 1px solid #111; padding: 5px; min-height: 28px; }
    .label { display: block; color: #555; font-size: 8px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #999; padding: 3px 4px; vertical-align: middle; }
    th { background: #ecece8; font-weight: 700; }
    td:nth-child(10) { text-align: left; }
    td { text-align: center; height: 18px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 10px 0; }
    .traffic { text-transform: uppercase; font-weight: 700; }
    .traffic-green { background: #e7f5ea; border-color: #6ea977; color: #24552c; }
    .traffic-yellow { background: #fff6dc; border-color: #d3ad47; color: #7a5700; }
    .traffic-red { background: #ffeceb; border-color: #cc5a4a; color: #862d22; }
    .warnings { border: 1px solid #aaa; padding: 6px; min-height: 34px; margin-bottom: 14px; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 30px; }
    .line { border-top: 1px solid #111; padding-top: 5px; min-height: 34px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Gleitzeitnachweis</h1>
      <h2>${monthName(summary.monthKey)}</h2>
    </div>
    <div class="brand">
      <img src="${mannheimLogo}" alt="Stadt Mannheim" />
      <div>
        <strong>${escapeHtml(settings.dienststelle || settings.kostenstelle || 'Dienststelle')}</strong><br />
      </div>
    </div>
  </header>
  <section class="meta">
    <div class="box"><span class="label">Name</span>${escapeHtml(settings.employeeName)}</div>
    <div class="box"><span class="label">Kostenstelle</span>${escapeHtml(settings.kostenstelle)}</div>
    <div class="box"><span class="label">Personalnummer</span>${escapeHtml(settings.personalNumber)}</div>
    <div class="box"><span class="label">Amt / FB / EB</span>${escapeHtml(settings.department)}</div>
    <div class="box"><span class="label">Übertrag</span>${formatMinutes(summary.carryInMinutes)}</div>
    <div class="box"><span class="label">Saldo</span>${formatMinutes(summary.saldoMinutes)}</div>
  </section>
  <table>
    <thead>
      <tr>
        <th style="width:5%">Tag</th><th style="width:6%">Wo</th><th style="width:9%">Beginn</th><th style="width:9%">Ende</th><th style="width:8%">Pause</th>
        <th style="width:9%">Ist</th><th style="width:9%">Soll</th><th style="width:8%">Plus</th><th style="width:8%">Minus</th><th>Bemerkungen</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <section class="summary">
    <div class="box"><span class="label">Plus</span>${formatMinutes(summary.plusMinutes)}</div>
    <div class="box"><span class="label">Minus</span>${formatMinutes(summary.minusMinutes)}</div>
    <div class="box"><span class="label">Monat +/-</span>${formatMinutes(summary.monthDeltaMinutes)}</div>
    <div class="box"><span class="label">Saldo</span>${formatMinutes(summary.saldoMinutes)}</div>
    <div class="box traffic ${trafficClass}"><span class="label">Ampel</span>${trafficLabel}</div>
  </section>
  <section class="warnings">
    <strong>Hinweise:</strong> ${warnings.length ? escapeHtml(warnings.join(' | ')) : 'Keine Hinweise'}
  </section>
  <section class="signatures">
    <div class="line">Datum und Unterschrift Beschäftigte/r</div>
    <div class="line">Sachlich und rechnerisch richtig</div>
    <div class="line">Führungskraft / Aufsicht</div>
  </section>
</body>
</html>`;
}
