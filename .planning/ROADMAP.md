# Roadmap: Kapteins Daagbox

## Overview

Kapteins Daagbox will be built in four logical phases following a clean data-to-UI progression. We start by building the PWA and local database foundations (Phase 1), followed by the vessel and crew static profile editors (Phase 2), then the core logbook journal entries and dynamic sensors/API integrations (Phase 3), and finally, local CSV export utilities and host platform CSS adjustments (Phase 4).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation & Data Infrastructure** - Initialize PWA, database, and translations
- [ ] **Phase 2: Master Data Management (Stammdaten)** - Build boat profile, crew manager, and deviation table
- [ ] **Phase 3: Logbook Entries & Integration** - Form sheets, GPS coordinates, and Weather API integrations
- [ ] **Phase 4: CSV Export & UI Polish** - CSV generation, share triggers, and adaptive CSS layout

## Phase Details

### Phase 1: Foundation & Data Infrastructure
**Goal**: Initialize the PWA development bundle, service worker caching, IndexedDB database client, and translation hooks.
**Depends on**: Nothing (first phase)
**Requirements**: UI-02, UI-03, SYS-01, SYS-02
**Success Criteria**:
  1. App loads instantly with offline assets from a service worker.
  2. German and English languages are switchable via menu, and the initial language is auto-detected from browser locales.
  3. Dexie.js database client is initialized with working Yacht, Crew, Deviation, and LogEntry tables.
**Plans**: 2 plans

Plans:
- [ ] 01-01: Initialize Vite React TS, configure vite-plugin-pwa, set up the layout shell, and add react-i18next translations.
- [ ] 02-01: Initialize Dexie.js schemas and implement a Database Settings view to check storage capability.

### Phase 2: Master Data Management (Stammdaten)
**Goal**: Implement forms for vessel profile metadata, skipper and crew personal files, and the compass deviation grid.
**Depends on**: Phase 1
**Requirements**: VESSEL-01, VESSEL-02, VESSEL-03, DEV-01, DEV-02
**Success Criteria**:
  1. User can successfully save and update the Yacht profile.
  2. User can add, edit, and remove up to 6 crew records.
  3. User can input compass headings (MgK) and save corresponding magnetic deviation values.
**Plans**: 2 plans

Plans:
- [ ] 02-01: Build Yacht and Crew editing components and wire them to Dexie.js collections.
- [ ] 02-02: Build the Deviation grid (Steuertafel) covering 000° to 360° headings.

### Phase 3: Logbook Entries & Integration
**Goal**: Develop the journey listing, entry form sheets, GPS coordinate prefill, and OpenWeatherMap assistance lookup.
**Depends on**: Phase 2
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, INT-01, INT-02, INT-03
**Success Criteria**:
  1. User can create daily logbook entries, record hourly events, and track water/diesel consumption.
  2. User can pre-fill current coordinates with one tap (via browser Geolocation).
  3. User can fetch and prefill weather description, pressure, and wind speed/direction using OpenWeatherMap API (with offline fallbacks).
  4. User can sign off the daily entry.
**Plans**: 2 plans

Plans:
- [ ] 03-01: Build logbook list view and daily log entry header, sails, and consumption forms.
- [ ] 03-02: Implement event log forms, Geolocation API integration, and OpenWeatherMap service helper.

### Phase 4: CSV Export & UI Polish
**Goal**: Implement client-side CSV file download, share dialog hooks, local storage persistent request, and platform CSS themes.
**Depends on**: Phase 3
**Requirements**: SYS-03, SYS-04, UI-01
**Success Criteria**:
  1. User can download a standard CSV file matching their logbook entries.
  2. User can launch the native mail or share panel with the generated CSV data.
  3. The interface renders elements in platform-adaptive styles matching iOS Cupertino or Android Material.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Implement CSV export service and link it to the Web Share API.
- [ ] 04-02: Implement storage persistence prompt, PWA install prompt warnings, and apply OS-adaptive UI themes.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Data Infrastructure | 0/2 | Not started | - |
| 2. Master Data Management (Stammdaten) | 0/2 | Not started | - |
| 3. Logbook Entries & Integration | 0/2 | Not started | - |
| 4. CSV Export & UI Polish | 0/2 | Not started | - |
