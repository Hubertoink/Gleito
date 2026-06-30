import type { CalculatedDay, MonthSummary, Settings } from './domain/types';
import { holidayRegionName } from './domain/holidays';
import { monthName } from './domain/calc';
import { formatMinutes } from './domain/time';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPrintHtml(settings: Settings, days: CalculatedDay[], summary: MonthSummary): string {
  const trafficClass = `traffic-${summary.trafficLight}`;
  const trafficLabel = summary.trafficLight === 'green' ? 'Gruen' : summary.trafficLight === 'yellow' ? 'Gelb' : 'Rot';
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
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 0; }
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
    <div style="text-align:right">
      <strong>${escapeHtml(settings.dienststelle || settings.kostenstelle || 'Dienststelle')}</strong><br />
      ${escapeHtml(holidayRegionName(settings.holidayRegion))}
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
