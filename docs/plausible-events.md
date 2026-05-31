# Plausible Custom Events

Kapteins Daagbok nutzt [Plausible Analytics](https://plausible.io/) mit dem Script `script.tagged-events.js` auf der Domain `kapteins-daagbok.eu`. Custom Events werden über `window.plausible()` ausgelöst (siehe `client/src/services/analytics.ts`).

**Datenschutz:** Es werden keine personenbezogenen Daten in Event-Properties übermittelt (keine Nutzernamen, Hafennamen, Koordinaten o.ä.).

## Setup

1. Script in `client/index.html` (bereits eingebunden)
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
| Photo Uploaded | Foto hochgeladen (`PhotoCapture.tsx`, `CrewForm.tsx`) | `context`: `logbook` \| `crew`, bei Crew zusätzlich `role`: `skipper` \| `crew` |
| Backup Exported | Backup-Datei heruntergeladen (`LogbookBackupPanel.tsx`) | `entries`, `photos` (Anzahlen, keine Inhalte) |
| Backup Restored | Backup wiederhergestellt (`LogbookBackupPanel.tsx`) | `entries`, `photos`, `mode`: `same_id` \| `overwrite` \| `new_id` |
| Push Enabled | Crew-Änderungs-Push aktiviert (`PushNotificationSettings.tsx`) | — |
| Push Disabled | Crew-Änderungs-Push deaktiviert (`PushNotificationSettings.tsx`) | — |
| Footer Link Clicked | Klick auf Autoren-Link im App-Footer (`AppFooter.tsx`) | — |
| Profile Opened | Profilseite geöffnet (`UserProfilePage.tsx`, einmal pro Mount) | — |
| Passkey Added | Passkey erfolgreich registriert (`UserProfilePage.tsx`) | `labeled`: `true` \| `false` (optionaler Name gesetzt) |
| Passkey Removed | Passkey entfernt, mindestens ein Key verbleibt (`UserProfilePage.tsx`) | — |
| Passkey Renamed | Passkey-Name gespeichert (`UserProfilePage.tsx`) | — |
| Last Passkey Remove Hinted | Löschen des einzigen Passkeys abgebrochen — Hinweisdialog zur Kontolöschung (`UserProfilePage.tsx`) | — |
| Local PIN Set | Lokaler PIN gesetzt oder geändert (`UserProfilePage.tsx`) | `action`: `set` \| `change` |
| Local PIN Removed | Lokaler PIN entfernt (`UserProfilePage.tsx`) | — |
| Device Forgotten | Account aus Schnell-Login-Liste dieses Geräts entfernt (`UserProfilePage.tsx`) | — |
| Recovery Rotated | Neuer 12-Wörter-Wiederherstellungsschlüssel erstellt (`UserProfilePage.tsx`) | — |

## Bewusst nicht getrackt

- **Demo-Logbuch:** Beim automatischen Seed (`demoLogbook.ts`) werden keine Events ausgelöst — nur echte Nutzeraktionen zählen.
- **Manuelle Signaturen:** Nur Passkey-Signaturen lösen `Entry Signed` aus.
- **PII:** Keine Inhalte aus verschlüsselten Logbüchern in Properties.
- **Profil-KPIs:** Statistik-Karten und User-ID-Kopieren werden nicht getrackt (reine Anzeige bzw. zu granular).
- **Kontolöschung:** `Account Deleted` bleibt in `auth.ts` — unabhängig davon, ob die Gefahrenzone auf der Profilseite oder früher in den Einstellungen genutzt wurde.

## Typische Funnels (Plausible Goals)

Empfohlene Goal-Ketten für Auswertung:

1. **Aktivierung:** Account Created → Logbook Created → Travel Day Created → Travel Day Saved
2. **Onboarding:** Account Created → Onboarding Tour Completed (vs. Onboarding Tour Skipped)
3. **Kollaboration:** Invite Generated → Invite Accepted
4. **Öffentliche Freigabe:** Logbook Shared → Public Link Opened
5. **Export:** Travel Day Saved → PDF Exported / CSV Exported
6. **Datensicherung:** Backup Exported → Backup Restored
7. **Kontosicherheit:** Profile Opened → Passkey Added / Local PIN Set / Recovery Rotated; Last Passkey Remove Hinted → Account Deleted (selten, aber aussagekräftig)

## Entwicklung

```ts
import { PlausibleEvents, trackPlausibleEvent } from './services/analytics.js'

trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_SAVED)
trackPlausibleEvent(PlausibleEvents.ENTRY_SIGNED, { role: 'skipper' })
```

Lokal ohne Plausible-Script ist `trackPlausibleEvent` ein No-Op. In Production im Browser-Netzwerk-Tab auf Requests an die Plausible-Instanz prüfen.
