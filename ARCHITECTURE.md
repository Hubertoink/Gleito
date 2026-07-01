# Gleito Architektur

Gleito ist eine lokale Desktop-App fuer den Gleitzeitnachweis. Die Anwendung besteht aus einer React/Vite-Oberflaeche, einer Electron-Huelle fuer Dateisystem- und Update-Funktionen und einer lokalen SQLite-Datenbank auf Basis von `sql.js`.

## Technologiestack

- UI: React 19, TypeScript, Vite, CSS in `src/styles.css`
- Desktop: Electron 31 mit isoliertem Renderer und Preload-Bridge
- Persistenz: `sql.js`, gespeichert als SQLite-Datei im Electron-UserData-Verzeichnis
- Exporte: PDF ueber Electron `printToPDF`, Excel ueber `exceljs`
- Updates und Releases: `electron-updater`, `electron-builder`, GitHub Releases
- Tests: Vitest, aktuell vor allem fuer Domain- und Zeitlogik

## Verzeichnisstruktur

```text
src/
  App.tsx              Haupt-UI, Monatsansicht, Einstellungen, Exportaktionen
  main.tsx             React-Einstiegspunkt
  styles.css           App-weites Styling
  data/db.ts           SQLite-Abstraktion, Migration und Persistenz
  domain/types.ts      Gemeinsame Datentypen
  domain/calc.ts       Monats-, Tages- und Saldo-Berechnungen
  domain/time.ts       Zeitformatierung, Parsing und Rundung
  domain/holidays.ts   Feiertagslogik
  pdf.ts               HTML fuer PDF-Ausgabe
  excelExport.ts       Forderungsnachweis-Export

electron/
  main.ts              Electron Main Process, Fenster, IPC, Dateidialoge, Updates
  preload.ts           Sichere Bridge zwischen Renderer und Main Process

assets/
  Logo, Mannheim-Grafik, Hintergrundbilder und Excel-Vorlage

.github/workflows/
  release.yml          Windows-Release und Update-Artefakte per GitHub Actions
```

Die generierten Dateien `electron/*.js`, `electron/*.d.ts`, `dist/` und `dist-electron/` entstehen aus Build-Schritten und sind nicht die primaeren Quellen.

## Laufzeitaufbau

Beim Start erstellt `electron/main.ts` ein `BrowserWindow` mit Context Isolation und ohne Node-Integration. Im Entwicklungsmodus laedt Electron den Vite-Dev-Server, im Paket die gebaute `dist/index.html`.

Der Renderer ruft `openDatabase()` in `src/data/db.ts` auf. In der Desktop-App fragt diese Funktion ueber `window.gleito.loadDb()` die SQLite-Datei aus dem Electron-UserData-Verzeichnis ab. Wenn keine Datei existiert, wird eine neue Datenbank erzeugt und migriert. Im Browser-Fallback wird dieselbe Datenbank als Base64 im `localStorage` gespeichert.

Die React-Komponente in `src/App.tsx` laedt Einstellungen, bestimmt den Startmonat, laedt die Monatseintraege und berechnet daraus mit `calculateMonth()` die sichtbaren Tageswerte und Summen.

## Datenmodell

Die SQLite-Datenbank hat zwei Tabellen:

- `settings`: genau ein JSON-Dokument mit den App-Einstellungen.
- `months`: ein JSON-Dokument je Monat, identifiziert durch `month_key` im Format `YYYY-MM`.

Die fachlichen Typen liegen in `src/domain/types.ts`. Wichtig sind:

- `Settings`: Personendaten, Arbeitszeitregeln, Warnungen, Exportlayout, Darstellungsoptionen und Startverhalten.
- `DayEntry`: gespeicherte Eingaben pro Tag.
- `CalculatedDay`: berechnete Tagesdaten inklusive Soll, Ist, Plus, Minus, Warnungen und Editierbarkeit.
- `MonthSummary`: Monats- und Saldo-Zusammenfassung.

Neue Einstellungsfelder werden ueber `defaultSettings()` und `mergeSettings()` migrationsfreundlich eingebunden. Dadurch bekommen auch bestehende Datenbanken Default-Werte fuer neue Felder.

## Fachlogik

Die zentrale Berechnung liegt in `src/domain/calc.ts`:

- `defaultSettings()` definiert die Standardkonfiguration.
- `monthKey()`, `daysInMonth()` und `normalizeMonthEntries()` erzeugen stabile Monatsschluessel und vollstaendige Monatslisten.
- `calculateDay()` berechnet je Tag Sollzeit, Istzeit, Plus/Minus, Pausen, Feiertage und Warnungen.
- `calculateMonth()` fasst Tage zu Monatswerten und Ampelstatus zusammen.
- `resolveCurrentWorkMonth()` bestimmt den aktuellen Arbeitsmonat im Zusammenspiel mit Startmonat und vorhandenen gespeicherten Monaten.

Zeit-Parsing, Rundung und Formatierung sind bewusst in `src/domain/time.ts` ausgelagert, damit UI und Exporte dieselben Regeln verwenden.

## UI-Fluss

`src/App.tsx` verwaltet den groessten Teil des App-Zustands:

- Datenbankinstanz und Einstellungen
- aktiver Monat und Arbeitsmonat
- Archivmodus mit gesperrter Bearbeitung
- Eingaben, berechnete Werte, Exportmenues, Modale und Toasts
- Setup-Guide und Einstellungsansicht

Monatseingaben werden sofort ueber `saveEntries()` in die Datenbank geschrieben. Einstellungen werden ueber `saveSettings()` gespeichert und koennen Rueckwirkungen auf Arbeitsmonat, Startmonat oder Archivstatus haben.

Der Archivmodus unterscheidet zwischen dem aktuellen Arbeitsmonat und aelteren gespeicherten Monaten. Archivmonate werden gesperrt angezeigt, koennen aber bewusst entsperrt werden.

## Electron-Bridge und IPC

Der Renderer spricht nicht direkt mit Node-APIs. `electron/preload.ts` stellt stattdessen `window.gleito` bereit. Die Bridge kapselt unter anderem:

- Datenbank laden und speichern
- Backup exportieren und importieren
- PDF exportieren
- Excel-Vorlage laden und Excel-Datei speichern
- App-Version abfragen
- externe Links oeffnen
- Update suchen, herunterladen und installieren
- Update-Statusereignisse abonnieren

Die zugehoerigen Handler liegen in `electron/main.ts`. Das trennt UI-Code von Dateisystemzugriffen und haelt die Electron-Sicherheitsgrenzen klar.

## Persistenz und Backups

In der Desktop-App wird die SQLite-Datei als `gleitzettel.sqlite` unter `app.getPath('userData')` gespeichert. Jede Aenderung exportiert die komplette `sql.js`-Datenbank als Bytes und schreibt sie ueber IPC auf die Platte.

Backups sind dieselben Datenbankbytes mit der Dateiendung `.gleito`. Der Import ersetzt die App-Datenbank und hydratisiert den UI-State anschliessend neu.

## Exporte

PDF-Exporte entstehen zweistufig:

1. `src/pdf.ts` baut ein vollstaendiges HTML-Dokument fuer das gewaehlte Layout.
2. `electron/main.ts` laedt dieses HTML in ein verstecktes Fenster und schreibt per `printToPDF()` eine A4-PDF.

Excel-Exporte verwenden `assets/Forderungsnachweis.xlsx` als Vorlage. `src/excelExport.ts` laedt die Vorlage mit `exceljs`, entfernt berechnete Formeln aus der Vorlage, fuellt Kopf- und Tagesdaten und gibt die fertigen Workbook-Bytes an Electron zur Speicherung zurueck.

## Update- und Release-Flow

Die Version steht in `package.json` und `package-lock.json`. `electron-builder` nutzt diese Version fuer Installationsdateien und Update-Metadaten.

Der Workflow `.github/workflows/release.yml` laeuft bei Tags `v*`. Er prueft, dass die Package-Version zum Git-Tag passt, erstellt bei Bedarf ein GitHub Release und veroeffentlicht die Windows-Artefakte. Die App nutzt `electron-updater`, fragt beim Start gepackter Versionen nach Updates und laesst Downloads bewusst durch den Benutzer anstossen.

Typischer Release-Ablauf:

```powershell
npm version 0.9.x --no-git-tag-version
npm run build
npm test
git add package.json package-lock.json src electron .github
git commit -m "Release v0.9.x"
git tag v0.9.x
git push origin main
git push origin v0.9.x
```

## Entwicklung

Wichtige Skripte:

```powershell
npm run dev        # Vite und Electron fuer lokale Entwicklung
npm run build      # TypeScript, Vite und Electron-Bundles bauen
npm test           # Vitest-Testlauf
npm run start      # Build ausfuehren und Electron starten
npm run dist:win   # Windows-Installer lokal bauen, ohne zu veroeffentlichen
```

Bei Aenderungen an Fachlogik sollten Tests in `src/domain/calc.test.ts` ergaenzt werden. Bei Aenderungen an IPC oder Release-Logik lohnt sich zusaetzlich ein manueller Test in der gepackten App, weil Updates und native Dialoge im Dev-Modus nur eingeschraenkt aussagekraeftig sind.
