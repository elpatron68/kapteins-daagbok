# Plausible Custom Events

Kapteins Daagbok nutzt [Plausible Analytics](https://plausible.io/) mit dem Script `script.tagged-events.js`. Custom Events werden über `window.plausible()` ausgelöst (siehe `client/src/services/analytics.ts`).

**Konfiguration** (`.env`, Frontend-Container / Vite-Dev):

```env
PLAUSIBLE_ENABLED=true   # Staging: false
PLAUSIBLE_HOST=https://plausible.elpatron.me
```

Das Script wird über `plausible-bootstrap.js` geladen; `data-domain` ist der aktuelle Hostname. CSP in Nginx enthält `PLAUSIBLE_HOST` nur wenn aktiviert.

**Datenschutz:** Es werden keine personenbezogenen Daten in Event-Properties übermittelt (keine Nutzernamen, Hafennamen, Koordinaten o.ä.).

## Setup

1. `PLAUSIBLE_*` in `.env` setzen (Prod: enabled, Staging: disabled empfohlen)
2. Nach Deploy: Goals im Plausible-Dashboard anlegen — **Namen müssen exakt mit der Event-Spalte „Event name“ übereinstimmen** (Title Case, Leerzeichen)

## Event-Übersicht

| Event | Auslöser | Properties |
|-------|----------|------------|
| Account Created | Erfolgreiche Registrierung (`auth.ts`) | — |
| Logged In | Login oder Einladungs-Flow abgeschlossen (`App.tsx`) | — |
| Logbook Created | Neues Logbuch im Dashboard (`LogbookDashboard.tsx`) | — |
| Logbook Deleted | Logbuch gelöscht (`logbook.ts`) | — |
| Travel Day Created | Neuer Reisetag über „+“ in der Eintragsliste (`LogEntriesList.tsx`) | — |
| Travel Day Saved | Reisetag gespeichert (`LogEntryEditor.tsx`) | — |
| Entry Signed | Passkey-Signatur Skipper oder Crew (`LogEntryEditor.tsx`) | `role`: `skipper` \| `crew` |
| GPS Track Uploaded | GPX/KML/GeoJSON hochgeladen (`LogEntryEditor.tsx`) | — |
| NMEA Uploaded | NMEA-Datei erfolgreich gelesen und geparst (`NmeaImportWizard.tsx`) | `lines` (Anzahl Sätze), `candidates` (Vorschläge für Reisetag), `duplicate` (Datei schon importiert), `has_position` |
| NMEA Imported | NMEA-Vorschläge in Journal übernommen (`NmeaImportWizard.tsx`) | `mode`: `interval` \| `change` \| `both`, `events` (übernommene Einträge), `track` (GPS-Track mit importiert) |
| Vessel Saved | Schiffsdaten gespeichert (`VesselForm.tsx`) | — |
| Crew Saved | Skipper- oder Crew-Profil gespeichert (`CrewForm.tsx`) | `role`: `skipper` \| `crew`, `action`: `create` \| `update` |
| Account Deleted | Konto erfolgreich gelöscht (`auth.ts`) | — |
| Onboarding Tour Completed | Onboarding-Tour bis zum letzten Schritt durchlaufen (`AppTourContext.tsx`) | `mode`: `demo` (optional, bei Public-Demo) |
| Onboarding Tour Skipped | Tour vorzeitig beendet (Skip, Escape, Backdrop, `stopTour`) | `step`: Tour-Schritt-ID (z.B. `welcome`, `entry_track`), optional `mode`: `demo` |
| Demo Opened | Public-Demo unter `/demo` geöffnet (`DemoViewer.tsx`) | — |
| Invite Generated | Einladungslink erzeugt (`SettingsForm.tsx`) | — |
| Invite Accepted | Einladung angenommen und Logbuch beigetreten (`InvitationAcceptance.tsx`) | — |
| Logbook Shared | Öffentlicher Freigabelink aktiviert (`SettingsForm.tsx`) | — |
| Public Link Opened | Freigabelink unter `/share` erfolgreich geladen (`ReadOnlyViewer.tsx`) | — |
| PDF Exported | PDF-Export eines Reisetags (`LogEntryEditor.tsx`, `LogEntriesList.tsx`) | `scope`: `entry` |
| CSV Exported | CSV-Download aus der Eintragsliste (`LogEntriesList.tsx`) | — |
| CSV Shared | CSV über Web Share API geteilt (`LogEntriesList.tsx`) | — |
| Photo Uploaded | Foto hochgeladen (`photoAttachments.ts`, `PhotoCapture.tsx`, `CrewForm.tsx`) | `context`: `logbook` \| `live_log` \| `crew`, bei Crew zusätzlich `role`: `skipper` \| `crew` |
| Voice Memo Uploaded | Sprachnotiz gespeichert (`voiceAttachments.ts`) | `context`: `logbook` \| `live_log` |
| OWM Weather Fetched | Erfolgreicher OpenWeatherMap-API-Abruf (`weather.ts`, zentral nach HTTP 200) | `source`: siehe [OWM-Quellen](#owm-quellen) |
| AI Summary Generated | Erfolgreiche KI-Zusammenfassung eines Reisetags (`aiSummary.ts`) | — |
| Backup Exported | Backup-Datei heruntergeladen (`LogbookBackupPanel.tsx`, v2 ZIP) | `entries`, `photos`, `voiceMemos`, `bytes` (Anzahlen/Größe, keine Inhalte) |
| Backup Restored | Backup wiederhergestellt (`LogbookBackupPanel.tsx`, v2 ZIP) | `entries`, `photos`, `voiceMemos`, `bytes`, `mode`: `same_id` \| `overwrite` \| `new_id` |
| Push Enabled | Crew-Änderungs-Push aktiviert (`PushNotificationSettings.tsx`) | — |
| Push Disabled | Crew-Änderungs-Push deaktiviert (`PushNotificationSettings.tsx`) | — |
| Footer Link Clicked | Klick auf Autoren-Link im App-Footer (`AppFooter.tsx`) | — |
| Ko-fi Link Clicked | Klick auf Ko-fi-Unterstützen-Badge im App-Footer (`AppFooter.tsx`) | — |
| Profile Opened | Profilseite geöffnet (`UserProfilePage.tsx`, einmal pro Mount) | — |
| Passkey Added | Passkey erfolgreich registriert (`UserProfilePage.tsx`) | `labeled`: `true` \| `false` (optionaler Name gesetzt) |
| Passkey Removed | Passkey entfernt, mindestens ein Key verbleibt (`UserProfilePage.tsx`) | — |
| Passkey Renamed | Passkey-Name gespeichert (`UserProfilePage.tsx`) | — |
| Last Passkey Remove Hinted | Löschen des einzigen Passkeys abgebrochen — Hinweisdialog zur Kontolöschung (`UserProfilePage.tsx`) | — |
| Local PIN Set | Lokaler PIN gesetzt oder geändert (`UserProfilePage.tsx`) | `action`: `set` \| `change` |
| Local PIN Removed | Lokaler PIN entfernt (`UserProfilePage.tsx`) | — |
| Device Forgotten | Account aus Schnell-Login-Liste dieses Geräts entfernt (`UserProfilePage.tsx`) | — |
| Recovery Rotated | Neuer 12-Wörter-Wiederherstellungsschlüssel erstellt (`UserProfilePage.tsx`) | — |
| Language Changed | Sprache über UI-Wechsler gewählt (`i18nLanguages.ts` via Sprach-Button in App, Dashboard, Auth, Demo, Einladung, Share-Viewer) | `from`, `to`: ISO 639-1 (`de`, `en`, `da`, `sv`, `nb`) |
| Live Log Opened | Live-Journal-Ansicht geladen (`LiveLogView.tsx`, einmal pro Mount nach erfolgreichem Init) | — |
| Live Log Event Logged | Quick-Action erfolgreich ins heutige Journal geschrieben (`LiveLogView.tsx`) | `action`: siehe [Live-Log-Aktionen](#live-log-aktionen) |
| PWA Boot Watchdog Soft | Watchdog erkennt Start-Haenger und versucht sanfte Selbstheilung (`bootstrap-watchdog.js`) | `attempt` (Anzahl Wiederherstellungsversuche), `online` (`true`\|`false`), `reason`: `soft-reload` \| `offline-retry` |
| PWA Boot Watchdog Hard | Watchdog startet harte PWA-Reparatur (SW/Cache) nach erneutem Start-Haenger (`bootstrap-watchdog.js`) | `attempt`, `online`, `reason`: `hard-recovery` |
| PWA Boot Watchdog Fallback | Watchdog zeigt Recovery-UI nach ausgeschoepften Auto-Recovery-Versuchen (`bootstrap-watchdog.js`) | `attempt`, `online`, `reason`: `retries-exhausted` \| `offline-retries-exhausted` |
| PWA Boot Watchdog Manual Repair | Nutzer startet manuelle App-Reparatur im Fallback-Dialog (`bootstrap-watchdog.js`) | `attempt`, `online` |

### Live-Log-Aktionen

Property `action` bei **Live Log Event Logged** — stabile englische Schlüssel, keine Inhalte (kein Kurs, kein Kommentartext, keine Koordinaten):

| `action` | Button / Auslöser |
|----------|-------------------|
| `motor_start` | Motor Start |
| `motor_stop` | Motor Stop |
| `cast_off` | Ablegen |
| `moor` | Anlegen |
| `sails` | Segel (Modal bestätigt) |
| `course` | Kurs (Dial/Modal bestätigt) |
| `sog` | SOG |
| `stw` | STW |
| `fuel` | Diesel-Tank |
| `water` | Wasser-Tank |
| `wind` | Wind (Richtung/Stärke) |
| `pressure` | Luftdruck |
| `temp` | Temperatur |
| `precip` | Niederschlag |
| `sea_state` | Seegang |
| `position` | GPS-Position (manuell) |
| `comment` | Kommentar |
| `voice` | Sprachnotiz (Modal gespeichert) |
| `undo` | Letztes Ereignis rückgängig |

### OWM-Quellen

Property `source` bei **OWM Weather Fetched** — ein Event pro erfolgreichem API-Call (keine Koordinaten, kein Ortsname):

| `source` | Auslöser |
|----------|----------|
| `live_log` | OpenWeatherMap-Wetter im Live-Journal (`LiveLogView.tsx`) |
| `entry_editor` | Wetter-Button im Reisetag-Editor (`LogEntryEditor.tsx`, `handleFetchWeather`) |
| `entry_editor_gps_lookup` | GPS-Fallback per Ortsname im Reisetag-Editor (`LogEntryEditor.tsx`, `handleGetGps`) |

Fehlgeschlagene Abrufe (kein API-Key, Timeout, leere Antwort) lösen **kein** Event aus.

### PWA-Boot-Watchdog-Properties

Properties bei **PWA Boot Watchdog Soft / Hard / Fallback / Manual Repair**:

| Property | Typ | Bedeutung | Erlaubte Werte |
|----------|-----|-----------|----------------|
| `attempt` | number | Laufende Nummer des Recovery-Versuchs im aktuellen Startfenster | `1`, `2`, `3`, ... |
| `online` | boolean | Netzwerkstatus beim Trigger | `true` \| `false` |
| `reason` | string | Grund/Recovery-Pfad (nur bei Soft/Hard/Fallback) | `soft-reload`, `offline-retry`, `hard-recovery`, `retries-exhausted`, `offline-retries-exhausted` |

## Bewusst nicht getrackt

- **Demo-Logbuch:** Beim automatischen Seed (`demoLogbook.ts`) werden keine Events ausgelöst — nur echte Nutzeraktionen zählen.
- **Manuelle Signaturen:** Nur Passkey-Signaturen lösen `Entry Signed` aus.
- **PII:** Keine Inhalte aus verschlüsselten Logbüchern in Properties.
- **Profil-KPIs:** Statistik-Karten und User-ID-Kopieren werden nicht getrackt (reine Anzeige bzw. zu granular).
- **Sprache bei Erstbesuch:** Automatische Browser-/URL-Erkennung (`i18next-browser-languagedetector`, `?lng=`) löst kein `Language Changed` aus — nur explizite Klicks auf den Sprach-Button.
- **Live-Log Auto-Position:** Hintergrund-GPS alle 3 h (`LIVE_EVENT_CODES.AUTO_POSITION`) — automatisch, best-effort, kein Nutzer-Tap.
- **Live-Log Modals:** Öffnen/Abbrechen von Dialogen ohne Speichern; Wechsel Liste ↔ Live (nur `Live Log Opened` beim erneuten Mount).
- **Live-Log Editor-Link:** Öffnen des vollständigen Editors aus der Live-Ansicht.
- **NMEA-Import:** Abbrechen, Vorschau ohne Übernahme, Archiv-Entscheid (Archivieren/Verwerfen); fehlgeschlagene Datei-Lesevorgänge.
- **Kontolöschung:** `Account Deleted` bleibt in `auth.ts` — unabhängig davon, ob die Gefahrenzone auf der Profilseite oder früher in den Einstellungen genutzt wurde.

## Typische Funnels (Plausible Goals)

Empfohlene Goal-Ketten für Auswertung (nur Business!):

1. **Aktivierung:** Account Created → Logbook Created → Travel Day Created → Travel Day Saved
2. **Onboarding:** Account Created → Onboarding Tour Completed (vs. Onboarding Tour Skipped)
3. **Kollaboration:** Invite Generated → Invite Accepted
4. **Öffentliche Freigabe:** Logbook Shared → Public Link Opened
5. **Export:** Travel Day Saved → PDF Exported / CSV Exported
6. **Datensicherung:** Backup Exported → Backup Restored
7. **Kontosicherheit:** Profile Opened → Passkey Added / Local PIN Set / Recovery Rotated; Last Passkey Remove Hinted → Account Deleted (selten, aber aussagekräftig)
8. **Internationalisierung:** Language Changed (Verteilung `to`, Pfade mit Übersetzungs-Feedback)
9. **NMEA-Import:** NMEA Uploaded → NMEA Imported (Modus, `events`, optional Track; Upload-Funnel vs. Abbruch)
10. **Live-Journal:** Live Log Opened → Live Log Event Logged (Verteilung `action`; z. B. `position`, `course`, `motor_start`) → Photo Uploaded / Voice Memo Uploaded (Filter `context`: `live_log`)
11. **OpenWeatherMap:** OWM Weather Fetched (Verteilung `source`; Live-Journal vs. Reisetag-Editor)
12. **PWA-Stabilitaet:** PWA Boot Watchdog Soft → PWA Boot Watchdog Hard → PWA Boot Watchdog Fallback → PWA Boot Watchdog Manual Repair

## Entwicklung

```ts
import { PlausibleEvents, trackPlausibleEvent } from './services/analytics.js'

trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_SAVED)
trackPlausibleEvent(PlausibleEvents.ENTRY_SIGNED, { role: 'skipper' })
trackPlausibleEvent(PlausibleEvents.LANGUAGE_CHANGED, { from: 'de', to: 'da' })
trackPlausibleEvent(PlausibleEvents.LIVE_LOG_EVENT_LOGGED, { action: 'course' })
trackPlausibleEvent(PlausibleEvents.PHOTO_UPLOADED, { context: 'live_log' })
trackPlausibleEvent(PlausibleEvents.VOICE_MEMO_UPLOADED, { context: 'live_log' })
trackPlausibleEvent(PlausibleEvents.OWM_WEATHER_FETCHED, { source: 'live_log' })
trackPlausibleEvent(PlausibleEvents.NMEA_UPLOADED, { lines: 1200, candidates: 8, duplicate: false, has_position: true })
trackPlausibleEvent(PlausibleEvents.NMEA_IMPORTED, { mode: 'both', events: 6, track: true })
```

Lokal ohne Plausible-Script ist `trackPlausibleEvent` ein No-Op. In Production im Browser-Netzwerk-Tab auf Requests an die Plausible-Instanz prüfen.
