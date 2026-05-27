# Kapteins Daagbox (Kapteins Daagbog)

## What This Is

Kapteins Daagbox is a modern, mobile-first Progressive Web Application (PWA) designed for private yacht owners and captains to manage their ship's logbook digitally. The application enables users to log vessel master data, owner details, crew information, and daily logbook entries conforming to official maritime standards.

## Core Value

Providing a private-by-design, fully offline-capable mobile maritime logbook that respects absolute user privacy by storing data in an end-to-end (E2E) encrypted server-side database (with local-first browser cache), while assisting the skipper with GPS position capture and automated weather integration.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **GEN-01**: Mobile-first responsive UI matching the host operating system's design language (Android/Material or iOS/Cupertino)
- [ ] **GEN-02**: Multilingual support (German/English), auto-detecting system language on first start, and letting users switch via menu
- [ ] **MASTER-01**: Ship's master data, owner, and crew entry form based on standard templates
- [ ] **LOG-01**: Logbook entry form capturing nautical/journey events
- [ ] **LOG-02**: Automated weather and sea state pre-filling using OpenWeatherMap API
- [ ] **LOG-03**: GPS device integration to capture current coordinates
- [ ] **AUTH-01**: Passwordless user registration and authentication via Passkeys (WebAuthn)
- [ ] **CRYPTO-01**: Client-side End-to-End Encryption (E2E) of all sensitive user data using Web Crypto API
- [ ] **LOGBOOK-01**: Multi-logbook support allowing a user to manage any number of logbooks
- [ ] **DATA-01**: Local-first database sync to zero-knowledge server storage
- [ ] **DATA-02**: Complete offline capability to ensure usability at sea with background sync
- [ ] **DATA-03**: CSV export of logged data for easy sharing (download, email, etc.)

### Out of Scope

- **Cleartext server-side storage** — Excluded by design to ensure absolute data privacy.
- **Social sharing or community features** — Focus is purely on private logbook management.

## Context

- The target audience is private boat owner/captains.
- An example PDF document (`example/AC_Nautik_Logbuch_A4_DEF-1.pdf`) is provided in the workspace, with Page 2 mapping to Vessel/Owner/Crew data and Page 4 mapping to log entries.
- The app needs to support both Android and iOS installation.

## Constraints

- **Storage**: Client-side IndexedDB for offline-first caching, synced with an end-to-end (E2E) encrypted server database.
- **Privacy**: Zero-knowledge architecture. No unencrypted user data on the server; no external telemetry.
- **Offline**: The app must load and operate fully without internet access (using Service Workers), caching operations to sync later.
- **Languages**: German and English.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| E2E Server Sync | Allows multi-device access and backup while retaining zero-knowledge privacy | — Pending |
| Passkey Auth | Passwordless, highly secure login using standard WebAuthn | — Pending |
| Multi-Logbook Setup | Supports skippers managing multiple boats/journeys | — Pending |
| PWA Architecture | Ensures cross-platform installation on iOS/Android without App Store overhead | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-26 after initialization*
