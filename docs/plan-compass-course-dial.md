# Implementierungsplan: 360°-Kompass-Dial für Kursangaben

**Status:** Implementiert (Branch `feat/compass-course-dial`)  
**Bezug:** Ereignisprotokoll (`LogEntryEditor`), Felder MgK / rwK / Windrichtung  
**Vorbild im Projekt:** `EventTimeInput24h` (spezialisierte Eingabe + Text-Fallback, keine API-Änderung)

---

## 1. Ziel und Nicht-Ziele

### Ziel
- Eingabe von Kurswinkeln (0°–360°) über einen **mobil tauglichen Kompass-Ring** (Drag/Tap).
- **Hybrid-Eingabe:** Dial + numerisches Feld (wie bei der Uhrzeit).
- Einheitliche Normalisierung (`000`–`360`, Speicherung als String ohne `°`).
- Wiederverwendbare Komponente für **MgK**, **rwK** und optional **Wind** (Gradmodus).

### Nicht-Ziele (v1)
- Keine Änderung am Server-Schema oder Verschlüsselungsformat.
- Keine Device-Orientation / echter Kompass des Geräts (optional Phase 2).
- Kein Ersatz der Ablenkungstabelle (`DeviationForm`) – bleibt 10°-Raster.
- Windrichtung bleibt **kompatibel** mit bestehenden Kardinalwerten (`N`, `NNE`, …) aus Wetter-API.

---

## 2. Ist-Analyse

| Feld | Speicherformat | UI heute | Besonderheit |
|------|----------------|----------|--------------|
| `mgk` | String, z. B. `"042"` | Text `placeholder="e.g. 180"` | Grad, PDF/CSV mit `°` |
| `rwk` | String, z. B. `"038"` | Text | Grad |
| `windDirection` | String | Text | Oft **Kardinal** (`NW`) via OpenWeather; manuell auch Grad möglich |

**Betroffene Dateien (Lesen/Schreiben, unverändert speichern):**
- `client/src/components/LogEntryEditor.tsx` – Formular + Tabelle
- `client/src/utils/logEntryPayload.ts` – `normalizeLogEvent`
- `client/src/services/pdfExport.ts`, `csvExport.ts` – Export
- `client/src/services/demoLogbookData.ts` – Demo-Daten

**Referenz-Pattern:** `EventTimeInput24h.tsx` + `parseTimeToHHMM` / `joinTimeHHMM` in `logEntryPayload.ts`.

---

## 3. Architektur

```
client/src/utils/courseAngle.ts          # Parsing, Normalisierung, Winkel-Mathe
client/src/components/CourseDialInput.tsx # UI: SVG-Ring + Zahleneingabe
client/src/components/CourseDialField.tsx # Label + Fehler + Modus (optional)
client/src/App.css                       # .course-dial-* Styles
client/src/components/LogEntryEditor.tsx # Integration MgK/rwk/Wind
client/src/i18n/locales/{de,en}.json     # Strings
```

### 3.1 Utility-Schicht `courseAngle.ts`

| Funktion | Verhalten |
|----------|-----------|
| `parseCourseAngle(value)` | `"185"`, `"185°"`, `" 042 "` → `185` oder `null` |
| `formatCourseAngle(degrees, pad?)` | `185` → `"185"` oder `"185"` / `"042"` (pad optional) |
| `normalizeCourseAngleString(value)` | Parse oder Fallback; für `normalizeLogEvent` |
| `pointerAngleToDegrees(clientX, clientY, cx, cy)` | `atan2`, 0° = Nord, Uhrzeigersinn maritim |
| `degreesToCardinal(deg)` | 16-Sektoren (bestehende Logik aus Wetter-Import) |
| `cardinalToDegrees(label)` | Reverse für Dial-Anzeige bei Kardinal-Strings |
| `snapDegrees(deg, step)` | `step` 1, 5 oder 10 |

**Konvention:** 0° = Nord, Winkel im Uhrzeigersinn (Kompass/Navigation), konsistent mit `wind.deg` in `LogEntryEditor`.

### 3.2 Komponente `CourseDialInput`

**Props:**
```ts
interface CourseDialInputProps {
  value: string                    // roher Formularwert
  onChange: (value: string) => void
  disabled?: boolean
  step?: 1 | 5 | 10                // Standard: 1
  allowCardinal?: boolean          // Wind: true → Anzeige/Export Kardinal optional
  displayMode?: 'degrees' | 'cardinal' | 'auto'
  'aria-label': string
  id?: string
}
```

**UI-Aufbau:**
1. **SVG-Ring** (ca. 200–240 px Desktop, min. 160 px Mobile)
   - Gradmarken alle 30° (Labels 000, 030, … 330)
   - Zeiger / Highlight-Bogen bei aktuellem Wert
   - `touch-action: none` auf Ringfläche
2. **Zentrum:** große Anzeige `185°` oder `NW`
3. **Darunter:** `<input type="text" inputMode="numeric">` mit Validierung on blur
4. **Fein/Grob-Toggle** (optional): 1° / 5° / 10° (lokal in `sessionStorage` merken)

**Interaktion:**
- `pointerdown` → `setPointerCapture` → `pointermove` → Winkel berechnen → snappen → `onChange`
- Tap auf Ring: Winkel zum Tap-Punkt
- Tastatur am Zahleneingang: Pfeiltasten ±step (wenn fokussiert)

**Barrierefreiheit:**
- `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={360}`, `aria-valuenow`, `aria-label`
- Zahleneingang bleibt voll bedienbar ohne Dial
- Fokus-Reihenfolge: Input vor Dial oder umgekehrt (Input zuerst empfohlen)

### 3.3 Windrichtung: Modus-Entscheidung

**Empfehlung v1:** Zwei Darstellungsmodi, **ein Speicher-String**:

| Modus | Speicher | Dial |
|-------|----------|------|
| Grad | `"225"` | Standard-Dial |
| Kardinal | `"SW"` | Dial zeigt Sektor-Mitte (225°), Änderung schreibt Kardinal |

- Wetter-Import (`handleFetchWeather`) setzt weiter Kardinal → Dial mappt auf Sektor.
- Nutzer kann auf Grad umschalten (kleiner Link „Als Grad“ / Toggle).
- `normalizeLogEvent`: erkennt Kardinal vs. Zahl, keine erzwungene Konvertierung beim Laden.

---

## 4. Integration `LogEntryEditor`

### 4.1 Layout (mobil-first)

**Problem:** Formular ist bereits dicht (`form-grid`).

**Lösung:** Kurs-Block als **eigene Sektion** „Kurs“ mit Tabs:

```
[ MgK ] [ rwK ]     ← Tab-Leiste (Segmented Control)
┌─────────────────────────┐
│     CourseDialInput      │  ← ein Dial, Wert je Tab
│     + Zahleneingang      │
└─────────────────────────┘
```

- Ein Dial, State wechselt mit Tab (`activeCourseField: 'mgk' | 'rwk'`).
- Spart Platz; MgK/rwk werden nacheinander gesetzt (typischer Workflow).

**Windrichtung:** eigene Zeile unter Wetter-Grid; kompakter Dial (kleinere `size="sm"`) oder ausklappbar „Wind am Kompass setzen“.

### 4.2 Ersetzungen

| Alt | Neu |
|-----|-----|
| `<input>` MgK | `<CourseDialInput value={evMgk} … />` |
| `<input>` rwK | Tab + gleicher Dial |
| `<input>` Wind | `<CourseDialInput allowCardinal displayMode="auto" … />` |

### 4.3 `normalizeLogEvent`

```ts
mgk: normalizeCourseAngleString(e.mgk, { allowEmpty: true }),
rwk: normalizeCourseAngleString(e.rwk, { allowEmpty: true }),
windDirection: normalizeWindDirectionString(e.windDirection), // Kardinal ODER Grad-String
```

Bestehende Demo- und Export-Daten bleiben gültig.

---

## 5. Styling (`App.css`)

- `.course-dial` – Container, max-width, zentriert
- `.course-dial__svg` – `width: 100%; aspect-ratio: 1`
- `.course-dial__ring` – stroke, hover/active
- `.course-dial__needle` – transform `rotate(${deg}deg)`
- `.course-dial__value` – tabular-nums, große Schrift
- `.course-dial__input` – wie `.time-input-24h`
- `.course-dial-tabs` – Segmented Control (bestehende `--app-accent-*` Tokens)
- **Responsive:** `@media (max-width: 640px)` – Dial max  min(72vw, 220px); Touch-Target Ring ≥ 44 px

**Theme:** `currentColor` / CSS-Variablen (`--app-text`, `--app-accent-light`) – Dark/Light via `themes.css`.

---

## 6. Internationalisierung

Neue Keys unter `logs.*`:

| Key | DE | EN |
|-----|----|----|
| `course_dial_hint` | Am Ring drehen oder Grad eingeben | Drag the ring or enter degrees |
| `course_step_fine` | 1° | 1° |
| `course_step_medium` | 5° | 5° |
| `course_step_coarse` | 10° | 10° |
| `course_tab_mgk` | MgK | MgK |
| `course_tab_rwk` | rwK | rwK |
| `course_invalid` | Ungültiger Kurs (0–360) | Invalid course (0–360) |
| `wind_mode_cardinal` | Kardinal | Cardinal |
| `wind_mode_degrees` | Grad | Degrees |

---

## 7. Phasen und Aufwand

### Phase A – Fundament (1–1,5 Tage)
- [ ] `courseAngle.ts` + Unit-Tests (Vitest einrichten falls noch nicht vorhanden)
- [ ] `CourseDialInput` (nur Grad, step 1/5, Pointer + Input)
- [ ] CSS Grundlayout
- [ ] Story/manuell: isoliert in kleiner Demo-Route oder Storybook (optional)

**Akzeptanz:** Dial setzt 0–360, Input synchron, Mobile Chrome/Safari getestet.

### Phase B – LogEntryEditor MgK/rwk (1 Tag)
- [ ] Tab-UI MgK / rwK
- [ ] Integration, `normalizeLogEvent`
- [ ] Read-only: Dial disabled, Wert nur Anzeige

**Akzeptanz:** Ereignis speichern/laden/PDF unverändert korrekt; Skipper-Signatur-Flow unberührt.

### Phase C – Windrichtung (0,5–1 Tag)
- [ ] `allowCardinal` / `displayMode`
- [ ] Wetter-Import kompatibel
- [ ] Toggle Kardinal ↔ Grad

**Akzeptanz:** API-Wind `NW` zeigt Dial auf NW; manuelle Grad-Eingabe möglich.

### Phase D – Polish (1–1,5 Tage)
- [ ] Fein/Grob-Schritte + Persistenz
- [ ] Tastatur (Pfeiltasten), Fokus-Stile
- [ ] Reduzierte Bewegung (`prefers-reduced-motion`: nur Input, Dial statisch)
- [ ] Plausible-Event optional: `Course Dial Used` (nur wenn Analytics gewünscht)
- [ ] Dokumentation in `docs/plausible-events.md` falls Event

### Phase E – QA & Edge Cases (0,5 Tag)
- [ ] Leerer Wert, 360 → 0 oder 360 (festlegen: **360 als Eingabe → speichern `360` oder `000`** – Empfehlung: intern 0–359 speichern, Anzeige 360 = 0)
- [ ] Sehr lange Formulare auf kleinen Screens (Scroll, kein Layout-Sprung)
- [ ] Offline/PWA, kein Regression bei `buildLogEntryPayload` / Signatur-Hash

**Gesamtaufwand:** ca. **4–5 Entwicklertage** für vollständige Implementierung inkl. Wind + A11y + QA.

---

## 8. Tests

### Unit (`courseAngle.ts`)
- Parse: `"042"`, `"360"`, `"999"` (invalid), `"NW"` (wind helper)
- `pointerAngleToDegrees` mit festen Koordinaten
- `snapDegrees(47, 5)` → 45
- `degreesToCardinal` / `cardinalToDegrees` Roundtrip

### Komponente (Testing Library)
- `onChange` bei simuliertem Pointer-Event (oder direktem `setValue` via Input)
- Disabled-State
- `aria-valuenow` aktualisiert

### Manuell / UAT
| # | Schritt | Erwartung |
|---|---------|-----------|
| 1 | Neues Ereignis, MgK am Dial auf 090 | Tabelle zeigt `90°`, PDF/CSV `90` |
| 2 | rwK per Tastatur `270` | Dial zeigt West |
| 3 | Wetter laden | Wind `NW`, Dial passend |
| 4 | iPhone Safari, Daumen-Drag | Kein Scroll-Leaken, Wert stabil |
| 5 | Nur Tastatur | Input allein speicherbar |
| 6 | Bestehenden Eintrag bearbeiten | Alte Werte korrekt im Dial |

---

## 9. Risiken und Mitigationen

| Risiko | Mitigation |
|--------|------------|
| Dial zu groß auf Mobile | Tabs + max-width; Wind einklappbar |
| Scroll vs. Drag | `touch-action: none` nur am Ring |
| Kardinal/Grad-Inkonsistenz | `displayMode="auto"`, kein Silent-Overwrite |
| Signatur-Hash ändert sich | Nur Normalisierung die bereits gültige Strings erlaubt; keine Rundung beim Speichern ohne Nutzeraktion |
| Performance bei vielen Events | Dial nur im Formular, nicht in Tabelle |

---

## 10. Optionale Erweiterungen (Post-v1)

1. **MgK → rwK aus Ablenkungstabelle** vorschlagen (Lookup `deviations[roundedMgK]`).
2. **DeviceOrientation** für Ring-Ausrichtung (mit Permission-Hinweis).
3. **Haptik** `navigator.vibrate(10)` bei Snap (Android).
4. **DeviationForm:** visueller Kompass statt nur Grid (separate Story).

---

## 11. Abnahmekriterien (Definition of Done)

- [ ] MgK und rwK im Ereignisformular per Dial + Input editierbar (Desktop + Mobile).
- [ ] Windrichtung: Dial + Kardinal/Grad kompatibel mit Wetter-Import.
- [ ] Keine Backend-/Migrations-Änderung; bestehende Logbücher laden unverändert.
- [ ] PDF/CSV/Signatur-Verhalten identisch zu heute (nur Darstellung/Eingabe verbessert).
- [ ] WCAG: Slider + Input bedienbar, `prefers-reduced-motion` berücksichtigt.
- [ ] DE/EN vollständig übersetzt.

---

## 12. Empfohlene Umsetzungsreihenfolge (Commits)

1. `feat(course): add courseAngle utilities and tests`
2. `feat(course): add CourseDialInput component and styles`
3. `feat(logs): integrate compass dial for MgK and rwK`
4. `feat(logs): wind direction dial with cardinal support`
5. `fix(logs): a11y and reduced-motion for course dial`
6. `docs: compass course dial plan and plausible event` (optional)
