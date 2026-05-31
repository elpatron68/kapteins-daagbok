# Code-Statistik — Kapteins Daagbok

Erstellt am **31. Mai 2026** mit [cloc](https://github.com/AlDanial/cloc) v1.98.

## Methode

```bash
cloc . \
  --exclude-dir=node_modules,dist,.git,userfeedback,.cursor,.planning \
  --md
```

Ausgeschlossen: Build-Artefakte (`dist/`), Abhängigkeiten (`node_modules/`), lokales Feedback, Cursor-/Planungs-Artefakte.

## Gesamtübersicht

| Language | files | blank | comment | code |
| :--- | ---: | ---: | ---: | ---: |
| TypeScript | 145 | 3012 | 540 | 23599 |
| JSON | 14 | 4 | 0 | 15005 |
| CSS | 3 | 743 | 45 | 4837 |
| XML | 3 | 0 | 0 | 4302 |
| HTML | 5 | 160 | 0 | 1411 |
| Markdown | 8 | 390 | 12 | 1077 |
| JavaScript | 8 | 117 | 43 | 709 |
| Bourne Shell | 3 | 81 | 21 | 412 |
| YAML | 1 | 3 | 0 | 55 |
| Dockerfile | 2 | 20 | 21 | 39 |
| SVG | 4 | 0 | 0 | 27 |
| **SUM** | **196** | **4530** | **682** | **51473** |

### Anwendungscode (TypeScript, JavaScript, CSS)

Ohne JSON, GPX/XML, HTML, Docs und Assets — näher an der eigentlichen Implementierung:

| Language | files | blank | comment | code |
| :--- | ---: | ---: | ---: | ---: |
| TypeScript | 145 | 3012 | 540 | 23599 |
| CSS | 3 | 743 | 45 | 4837 |
| JavaScript | 8 | 117 | 43 | 709 |
| **SUM** | **156** | **3872** | **628** | **29145** |

> **Hinweis:** Der hohe JSON-Anteil (~15k Zeilen) stammt überwiegend aus i18n-Locale-Dateien (`client/src/i18n/locales/*.json`). XML (~4,3k Zeilen) sind Demo-GPX-Tracks unter `client/src/assets/demo/`.

## Aufteilung nach Bereich

| Bereich | Dateien | Leer | Kommentar | Code |
| :--- | ---: | ---: | ---: | ---: |
| `client/` | 154 | 3398 | 557 | 43534 |
| `server/` | 20 | 399 | 54 | 4426 |
| `scripts/` | 9 | 193 | 59 | 1065 |
| `docs/` | 8 | 418 | 0 | 2079 |

### `client/`

| Language | files | blank | comment | code |
| :--- | ---: | ---: | ---: | ---: |
| TypeScript | 129 | 2625 | 499 | 21291 |
| JSON | 10 | 4 | 0 | 12898 |
| CSS | 3 | 743 | 45 | 4837 |
| XML | 3 | 0 | 0 | 4302 |
| Markdown | 1 | 13 | 0 | 60 |
| JavaScript | 2 | 5 | 5 | 56 |
| HTML | 1 | 0 | 0 | 47 |
| SVG | 4 | 0 | 0 | 27 |
| Dockerfile | 1 | 8 | 8 | 16 |
| **SUM** | **154** | **3398** | **557** | **43534** |

### `server/`

| Language | files | blank | comment | code |
| :--- | ---: | ---: | ---: | ---: |
| TypeScript | 16 | 387 | 41 | 2308 |
| JSON | 3 | 0 | 0 | 2095 |
| Dockerfile | 1 | 12 | 13 | 23 |
| **SUM** | **20** | **399** | **54** | **4426** |

### `scripts/`

| Language | files | blank | comment | code |
| :--- | ---: | ---: | ---: | ---: |
| JavaScript | 6 | 112 | 38 | 653 |
| Bourne Shell | 3 | 81 | 21 | 412 |
| **SUM** | **9** | **193** | **59** | **1065** |

## Größte Quelldateien (TypeScript & CSS)

| Datei | blank | comment | code |
| :--- | ---: | ---: | ---: |
| `client/src/App.css` | 730 | 31 | 4430 |
| `client/src/components/LogEntryEditor.tsx` | 176 | 17 | 1929 |
| `client/src/components/UserProfilePage.tsx` | 52 | 0 | 746 |
| `client/src/components/LiveLogView.tsx` | 50 | 2 | 711 |
| `client/src/App.tsx` | 85 | 21 | 656 |
| `client/src/components/CrewForm.tsx` | 82 | 117 | 644 |
| `client/src/components/VesselForm.tsx` | 55 | 8 | 558 |
| `client/src/services/auth.ts` | 80 | 66 | 556 |
| `client/src/services/logbookBackup.ts` | 56 | 0 | 545 |
| `client/src/components/AuthOnboarding.tsx` | 49 | 25 | 542 |
| `client/src/components/StatsDashboard.tsx` | 43 | 0 | 521 |
| `client/src/components/LogbookDashboard.tsx` | 46 | 2 | 508 |
| `client/src/components/InvitationAcceptance.tsx` | 59 | 0 | 461 |
| `client/src/components/LogEntriesList.tsx` | 50 | 4 | 447 |
| `client/src/services/sync.ts` | 70 | 29 | 428 |

## Kurzfassung

- **~51k** physische Codezeilen gesamt (inkl. Locales, Demo-GPX, Docs).
- **~29k** Zeilen reiner Anwendungscode (TS/JS/CSS).
- **~21k** TypeScript im Client, **~2,3k** im Server.
- Größte Einzeldatei: `App.css` (~4,4k Zeilen), größte Komponente: `LogEntryEditor.tsx` (~1,9k Zeilen).

## Report aktualisieren

```bash
cloc . \
  --exclude-dir=node_modules,dist,.git,userfeedback,.cursor,.planning \
  --md > docs/cloc-report-raw.md
```

Für eine reine Markdown-Tabelle reicht `--md`; dieser Report fasst mehrere cloc-Läufe manuell zusammen.
