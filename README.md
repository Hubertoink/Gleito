# Gleito

Gleito ist eine lokale Desktop-App fuer den Gleitzeitnachweis. Die App speichert Arbeitszeiten monatsweise, berechnet Soll/Ist, Plus- und Minusstunden, zeigt Warnungen an und exportiert Monatsnachweise als PDF sowie einen Forderungsnachweis als Excel-Datei.

Die App ist fuer Windows als Electron-Anwendung gebaut und speichert die Daten lokal auf dem eigenen Rechner.

## Funktionen

- Monatsweise Zeiterfassung mit Start, Ende, Pause und Bemerkungen
- Automatische Soll-/Ist-Berechnung, Monatsdelta und Saldo
- Archivmodus fuer abgeschlossene oder fruehere Monate
- Optionaler Start mit dem zuletzt angesehenen Monat
- Warnungen fuer Arbeitszeitregeln und ungewoehnliche Zeiten
- Feiertagslogik nach Bundesland plus eigene freie Tage
- PDF-Export im Gleito-Layout oder offiziellen Stadtlayout Mannheim
- Excel-Export fuer den Forderungsnachweis
- Lokale Backups als `.gleito`-Datei
- Automatische Update-Pruefung in installierten Versionen

## Installation

Installierbare Windows-Versionen liegen unter den GitHub Releases:

```text
https://github.com/Hubertoink/Gleito/releases
```

Die Setup-Datei heisst nach dem Muster:

```text
Gleito-Setup-<version>.exe
```

## Entwicklung

Voraussetzungen:

- Node.js 24
- npm

Abhaengigkeiten installieren:

```powershell
npm ci
```

Entwicklungsmodus starten:

```powershell
npm run dev
```

Build erstellen:

```powershell
npm run build
```

Tests ausfuehren:

```powershell
npm test
```

Windows-Installer lokal bauen, ohne zu veroeffentlichen:

```powershell
npm run dist:win
```

## Datenhaltung

Gleito nutzt lokal eine SQLite-Datenbank ueber `sql.js`. In der installierten Desktop-App wird die Datenbank im Electron-UserData-Verzeichnis gespeichert. Backups exportieren dieselben Datenbankdaten als `.gleito`-Datei.

Es werden keine Serverdienste fuer die Zeiterfassung benoetigt.

## Projektstruktur

```text
src/                 React-App, Domain-Logik, Exporte und Datenzugriff
electron/            Electron Main Process und Preload-Bridge
assets/              Logo, Bilder und Excel-Vorlage
.github/workflows/   Release-Workflow fuer Windows und Auto-Updates
```

Mehr Details stehen in [ARCHITECTURE.md](ARCHITECTURE.md).

## Release

Releases werden ueber Git-Tags im Format `v*` erstellt. Der GitHub Actions Workflow prueft, dass der Tag zur Version in `package.json` passt, baut den Windows-Installer und veroeffentlicht die Update-Artefakte fuer `electron-updater`.

Kurzform:

```powershell
npm version 1.0.2 --no-git-tag-version
npm run build
npm test
git commit -am "Release v1.0.2"
git tag v1.0.2
git push origin main
git push origin v1.0.2
```

## Architektur

Die ausfuehrliche technische Beschreibung befindet sich in [ARCHITECTURE.md](ARCHITECTURE.md).
