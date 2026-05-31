# NMEA-Import — Recherche & Entscheidungsnotizen

Stand: 2026-05-31 · Status: **In Umsetzung** (`feature/nmea-journal-import`)

Anlass: Nutzeranfrage, ob Kapteins Daagbok um NMEA-Empfang erweiterbar sei.

## Kurzfassung

| Ansatz | Machbarkeit (PWA) | Empfehlung |
|--------|-------------------|------------|
| **Live-NMEA** (Serial/TCP/Bluetooth vom Plotter) | Praktisch nein (Browser-Sandbox, iOS) | Nicht als reine PWA versprechen |
| **NMEA-Dateiimport** | Ja (Parsing im Client) | Sinnvoller nächster Schritt, wenn überhaupt |
| **GPX-Import** (bereits vorhanden) | Ja | Für die meisten Freizeit-Skipper der praktischere Weg |

---

## Aktueller Stand in Kapteins Daagbok

- **PWA** (installierbar, offline-fähig), kein nativer App-Store-Wrapper
- **Position:** `navigator.geolocation` (Geräte-GPS) in `LogEntryEditor.tsx`
- **Tracks:** Upload von **GPX/KML/GeoJSON** → Karte, Streckenstatistik (`trackUpload.ts`, `LogEntryEditor.tsx`)
- **Log-Ereignisse** u. a.: Zeit, MgK/rwk, Wind (Richtung/Stärke/Druck), Seegang, Wetter, Strom, Krängung, Segel/Motor, Log, Distanz, GPS-Koordinaten, Bemerkungen (`logEntryPayload.ts`)

Es gibt **keinen** NMEA-Parser und **keinen** Live-Datenstrom.

---

## Warum Live-NMEA in einer PWA schwierig ist

Typische NMEA-Quellen an Bord und Browser-Fähigkeiten:

| Quelle | PWA-tauglich? |
|--------|----------------|
| USB/Serial (RS422/232) | Kaum — Web Serial API nur Chrome/Edge, **nicht iOS/Safari**, am Tablet/Phone selten praktikabel |
| TCP/UDP (z. B. Port 10110) | **Nein** — Browser haben keine Raw-Sockets |
| Bluetooth-NMEA | Sehr eingeschränkt (Web Bluetooth), iOS praktisch unbrauchbar |
| Handy-GPS | **Ja** — Geolocation API (bereits implementiert), aber **kein NMEA vom Plotter** |

Weitere PWA-Limits:

- Kein zuverlässiger **Hintergrundbetrieb** für kontinuierlichen Empfang
- **HTTPS-App → lokales Boot-Netz** (`192.168.x.x`): Mixed Content, CORS, ggf. Local-Network-Permissions
- iPad/iPhone als installierte PWA besonders restriktiv

**Umweg (später optional):** Gateway im Boot (z. B. SignalK) mit WebSocket/HTTP — PWA verbindet sich dann zu einem **Server**, nicht direkt zu NMEA. Setup-Aufwand, eher für Technikaffine.

**Native Hülle** (Capacitor, Electron, …) würde Serial/TCP/Bluetooth erweitern — wäre keine reine PWA mehr.

---

## Was ist eine NMEA-Datei?

**NMEA 0183** = textbasiertes Protokoll aus **Einzelzeilen-Sätzen**, z. B.:

```
$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
$HDT,274.3,T*2F
$MWV,274.5,R,15.2,N,A*2B
$DPT,12.4,0.5*42
```

Eine `.nmea`- oder `.log`-Datei ist ein **Zeitstempel-Stream** — alles, was der Logger in diesem Zeitraum mitgeschrieben hat.

**Nicht alle Telemetriedaten sind garantiert enthalten.** Es hängt ab von:

1. Sensoren an Bord (GPS ja, Wind nur mit Windgeber, …)
2. Logger-/Multiplexer-Konfiguration
3. Empfang während der Aufzeichnung

Ein reiner GPS-Logger liefert praktisch nur Position/Kurs/Fahrt.

---

## Was könnte ein NMEA-Dateiimport in der App bewirken?

Mapping zu bestehenden Logbuch-Feldern (Auszug):

| NMEA-Satz (Beispiel) | Inhalt | Nutzen |
|----------------------|--------|--------|
| RMC / GGA / GLL | Position, Zeit, oft SOG/COG | GPS-Koordinaten, **Track** (analog GPX), Kurs |
| VTG / VHW | Fahrt über Grund/Wasser, Kurs | Streckenstatistik, Kursfelder |
| HDT / HDG / HDM | Peilung/Kompass | MgK/rwk-Vorschläge |
| MWV / MWD | Wind | Windfelder im Reisetag |
| DPT / DBT | Tiefe | aktuell kein eigenes Feld |
| MTW | Wassertemperatur | ggf. Bemerkungen |
| XDR | diverse Transducer | abhängig vom Gerät |

**Mehrwert gegenüber GPX:**

- Track **plus** zeitlich zugeordnete Wind-/Kursdaten (wenn in der Datei vorhanden)
- Automatisches Vorschlagen von Log-Ereignissen aus Bord-Sensoren
- Eine Quelle (Bordanlage) statt nur Handy-GPS

**Was NMEA typischerweise nicht liefert** (bleibt manuell / Wetter-API):

- Seegang, Wetter-Symbolik, Strom, Krängung
- Crew, Hafen, Bemerkungen, Tankstände
- Segel/Motor-Konfiguration im nautischen Sinne

NMEA = **Sensor-Telemetrie**, kein **Skipper-Logbuch**.

---

## Wird NMEA an Bord üblicherweise aufgezeichnet & exportiert?

**Teilweise — selten so einfach wie GPX für Endnutzer.**

| Quelle | Typischer Export | Einfach für Freizeit-Skipper? |
|--------|------------------|-------------------------------|
| Chartplotter (Garmin, Raymarine, B&G, …) | **GPX** (Track/Route) | ✅ oft (SD/USB/App) |
| Chartplotter | Roh-NMEA | ⚠️ selten direkt |
| WiFi-Multiplexer, SignalK, Raspi | NMEA-Datei oder Stream | ⚠️ Technikaffine |
| PC-Software (OpenCPN, …) | NMEA-Log | ⚠️ |

**GPX ist der de-facto-Standard** für „Track mit nach Hause nehmen“. NMEA-Rohlogs sind Nischen- oder Profi-/Tüftler-Setup.

---

## Mögliche Roadmap (wenn wir es angehen)

### Phase 1 — NMEA-Dateiimport (PWA-kompatibel)

- Parser für gängige Sätze: RMC, GGA, GLL, VTG, optional MWV/MWD, HDT
- Track aus Positions-Sätzen (wie GPX-Pipeline)
- UI: Upload neben GPX/KML in `LogEntryEditor`
- Checksummen-Validierung (`*XX`), Encoding, gemischte Talker-IDs (GP, GN, …)

### Phase 2 — Anreicherung Log-Ereignisse

- Aus NMEA-Stream pro Zeitpunkt Wind/Kurs/Position in Log-Events vorschlagen
- Nutzer bestätigt/korrigiert (kein blindes Überschreiben)

### Phase 3 — optional, nicht PWA-pur

- SignalK-WebSocket (Nutzer konfiguriert Boot-URL)
- Oder native Wrapper / Companion-Bridge

**Nicht empfohlen als Phase 1:** Live-NMEA direkt aus der PWA.

---

## Antwortvorlage für Nutzer

> Als reine Browser-App können wir keinen direkten NMEA-Anschluss (Serial/TCP vom Plotter) zuverlässig anbieten — mobile Browser erlauben das nicht, besonders auf iPhone/iPad.  
> Position über Handy-GPS und GPX-Tracks (Export vom Plotter oder Nav-App) funktionieren bereits.  
> Ein **Import von NMEA-Dateien** (vom Gateway oder Logger) ist grundsätzlich denkbar und könnte Track plus ggf. Wind/Kurs ins Logbuch übernehmen — das prüfen wir für eine spätere Version.  
> Für die meisten Skipper ist **GPX vom Plotter** der einfachere Weg.

---

## Offene Fragen für spätere Planung

- Welche NMEA-Varianten melden Nutzer realistisch (0183 vs. NMEA 2000 nur über Gateway)?
- Reicht Parser-Abdeckung für 95 % der Dateien mit RMC+GGA+MWV?
- Sollen importierte Rohdaten gespeichert werden oder nur abgeleitete GPX/Events?
- Datenschutz: NMEA-Datei lokal parsen, nichts an Server senden (passt zu E2E-Modell)
- Plausible-Event analog `GPS Track Uploaded` → z. B. `NMEA File Imported`?

## Referenzen

- [NMEA 0183](https://www.nmea.org/) — Protokollstandard
- [SignalK](https://signalk.org/) — moderne Boot-API, WebSocket
- [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) — Browser, eingeschränkt
- Bestehender Code: `client/src/services/trackUpload.ts`, `client/src/components/LogEntryEditor.tsx`
