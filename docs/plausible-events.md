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
| Onboarding Tour Completed | Onboarding-Tour bis zum letzten Schritt durchlaufen (`AppTourContext.tsx`) | — |
| Onboarding Tour Skipped | Tour übersprungen (Skip, Escape, Klick auf Backdrop) | `step`: Tour-Schritt-ID (z.B. `welcome`, `entry_track`) |
| Invite Generated | Einladungslink erzeugt (`SettingsForm.tsx`) | — |
| Invite Accepted | Einladung angenommen und Logbuch beigetreten (`InvitationAcceptance.tsx`) | — |
| PDF Exported | PDF-Export eines Reisetags (`LogEntryEditor.tsx`, `LogEntriesList.tsx`) | `scope`: `entry` |
| CSV Exported | CSV-Download aus der Eintragsliste (`LogEntriesList.tsx`) | — |
| CSV Shared | CSV über Web Share API geteilt (`LogEntriesList.tsx`) | — |

## Bewusst nicht getrackt

- **Demo-Logbuch:** Beim automatischen Seed (`demoLogbook.ts`) werden keine Events ausgelöst — nur echte Nutzeraktionen zählen.
- **Manuelle Signaturen:** Nur Passkey-Signaturen lösen `Entry Signed` aus.
- **PII:** Keine Inhalte aus verschlüsselten Logbüchern in Properties.

## Typische Funnels (Plausible Goals)

Empfohlene Goal-Ketten für Auswertung:

1. **Aktivierung:** Account Created → Logbook Created → Travel Day Created → Travel Day Saved
2. **Onboarding:** Account Created → Onboarding Tour Completed (vs. Onboarding Tour Skipped)
3. **Kollaboration:** Invite Generated → Invite Accepted
4. **Export:** Travel Day Saved → PDF Exported / CSV Exported

## Entwicklung

```ts
import { PlausibleEvents, trackPlausibleEvent } from './services/analytics.js'

trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_SAVED)
trackPlausibleEvent(PlausibleEvents.ENTRY_SIGNED, { role: 'skipper' })
```

Lokal ohne Plausible-Script ist `trackPlausibleEvent` ein No-Op. In Production im Browser-Netzwerk-Tab auf Requests an die Plausible-Instanz prüfen.
