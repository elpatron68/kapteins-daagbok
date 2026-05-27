# Requirements: Kapteins Daagbox

**Defined:** 2026-05-26
**Core Value:** A private, offline-first mobile ship's logbook that stores E2E encrypted data on a server with local caching, supporting passwordless Passkeys and multiple logbooks.

## v1 Requirements

These requirements represent the core scope for the initial release.

### UI & UX (UI)
- [ ] **UI-01**: Mobile-first responsive UI shell adapted to modern mobile and tablet viewport widths.
- [ ] **UI-02**: Language switcher in the menu supporting German and English.
- [ ] **UI-03**: Automatic translation locale detection matching the device's system language on first start.

### Vessel Profile & Crew (VESSEL)
- [ ] **VESSEL-01**: Form to record and update Vessel Profile fields (Yachtname, Heimathafen, Charterfirma, Eigner, Kennzeichen/Zulassungsnummer, Funk-Rufzeichen, ATIS-Nr, MMSI-Nr).
- [ ] **VESSEL-02**: Form to record Skipper profile details (Name, Anschrift, Geburtstag, Tel-Nr, Nationalität, Pass-Nr, Blutgruppe, Allergien, Krankheiten).
- [ ] **VESSEL-03**: Interface to add, update, and remove up to 6 Crew member profiles with fields identical to the skipper.

### Deviation Table (DEV)
- [ ] **DEV-01**: Grid inputs allowing entry of magnetic compass deviation (Ablenkung) for headings (MgK) from 000° to 360° in 10° steps.
- [ ] **DEV-02**: Persistent local storage of deviation table data with simple update capabilities.

### Logbook Entries (LOG)
- [ ] **LOG-01**: Chronological list page displaying all recorded journeys and travel days.
- [ ] **LOG-02**: General logbook headers capturing Date, Day of Travel, Departure (Reise von) and Destination (nach).
- [ ] **LOG-03**: Event records for journeys capturing: Time, MgK (Compass Heading), rwK/KüG (Chart Course), Wind pressure (hPa), Wind direction, Wind strength, Sea state (Seegang), Weather (icon choices), Current (Strom), Heel (Lage), Sails (G, F, S, StF) or Motor hours, Log reading, Distance, GPS Coordinates, and Remarks.
- [ ] **LOG-04**: Daily consumption controls checking morning/refilled/evening/consumption stats for freshwater and fuel.
- [ ] **LOG-05**: Verification check forcing names of signing skipper/crew in block letters to sign off the day.

### Integrations & Helpers (INT)
- [ ] **INT-01**: GPS coordinate fetch using browser Geolocation API to auto-fill latitude/longitude in the log entry.
- [ ] **INT-02**: Settings panel to store and save custom OpenWeatherMap API keys locally in the browser (LocalStorage).
- [ ] **INT-03**: Weather pre-fill function invoking OpenWeatherMap API using coordinates to auto-populate wind, pressure, and weather state (when online).

### Authentication & Multi-Logbook (AUTH)
- [ ] **AUTH-01**: Passwordless user registration and login via Passkeys (WebAuthn).
- [ ] **AUTH-02**: Creating, renaming, and deleting multiple logbooks per user.
- [ ] **AUTH-03**: Switching active logbooks in the UI, re-loading stored cache.

### Cryptography (CRYPTO)
- [ ] **CRYPTO-01**: Client-side encryption of vessel profiles, crew files, deviation tables, and log entries using AES-GCM-256 before syncing.
- [ ] **CRYPTO-02**: Derivation of the primary E2E symmetric key using WebAuthn PRF (Pseudo-Random Function) extension, with a 12-word recovery phrase fallback.
- [ ] **CRYPTO-03**: Secure local persistence of derived E2E key in the browser (e.g. encrypted in memory or standard session context, not plain LocalStorage).

### System & Offline (SYS)
- [ ] **SYS-01**: Service worker installation caching all assets (HTML, CSS, JS, Fonts) to allow complete offline launch.
- [ ] **SYS-02**: Local-first caching in IndexedDB (Dexie) syncing securely with E2E encrypted server storage.
- [ ] **SYS-03**: Client-side CSV generation converting log entries into download-ready CSV files.
- [ ] **SYS-04**: File sharing triggering browser Web Share API or custom email protocols with the CSV data.

## v2 Requirements

These requirements are deferred to future milestones.

### PDF & Graphics
- **PDF-01**: Generate formatted PDF export representing official AC Nautik logbook page layout.
- **PHOTO-01**: Capture and attach photos from device camera to logbook entries.

### Navigation & Tracking
- **TRACK-01**: Continuous background GPS track logging (with user permission) mapping sailed routes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Plaintext server storage / backend processing | Excluded by design to enforce absolute privacy. |
| Skipper/Crew social sharing profiles | Excluded to keep app purely private. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 1 | Pending |
| VESSEL-01 | Phase 3 | Pending |
| VESSEL-02 | Phase 3 | Pending |
| VESSEL-03 | Phase 3 | Pending |
| DEV-01 | Phase 3 | Pending |
| DEV-02 | Phase 3 | Pending |
| LOG-01 | Phase 3 | Pending |
| LOG-02 | Phase 3 | Pending |
| LOG-03 | Phase 3 | Pending |
| LOG-04 | Phase 3 | Pending |
| LOG-05 | Phase 3 | Pending |
| INT-01 | Phase 3 | Pending |
| INT-02 | Phase 3 | Pending |
| INT-03 | Phase 3 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| CRYPTO-01 | Phase 1 | Pending |
| CRYPTO-02 | Phase 1 | Pending |
| CRYPTO-03 | Phase 1 | Pending |
| SYS-01 | Phase 1 | Pending |
| SYS-02 | Phase 2 | Pending |
| SYS-03 | Phase 4 | Pending |
| SYS-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-26*
*Last updated: 2026-05-26 after initial definition*
