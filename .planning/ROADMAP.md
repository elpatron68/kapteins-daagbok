# Roadmap: Kapteins Daagbox

## Overview

Kapteins Daagbox will be built in four logical phases following a clean data-to-UI progression. We start by building the PWA and local database foundations (Phase 1), followed by the vessel and crew static profile editors (Phase 2), then the core logbook journal entries and dynamic sensors/API integrations (Phase 3), and finally, local CSV export utilities and host platform CSS adjustments (Phase 4).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation, Auth & E2E Crypto** - Setup client PWA, backend server, WebAuthn Passkeys, and E2E Web Crypto modules.
- [ ] **Phase 2: Sync Protocol & Multi-Logbooks** - Build sync backend/client cache and multi-logbook management views.
- [ ] **Phase 3: Master Data & Log entries** - Implement vessel forms, crew files, compass deviation grids, and log entries.
- [ ] **Phase 4: CSV Export & UI Polish** - CSV builder, Web Share API, sync/connection indicators, and OS themes.

## Phase Details

### Phase 1: Foundation, Auth & E2E Crypto
**Goal**: Setup client/backend codebases, WebAuthn Passkey registration/login APIs, and client-side encryption key derivation (PRF & recovery word helper).
**Depends on**: Nothing (first phase)
**Requirements**: UI-02, UI-03, SYS-01, AUTH-01, CRYPTO-01, CRYPTO-02, CRYPTO-03
**Success Criteria**:
  1. App shell runs offline via Service Worker, with German/English translations active.
  2. Backend server (TypeScript/Node/Postgres) provides functional endpoints for WebAuthn registration and assertion.
  3. User can register/login passwordlessly, generating and storing a secure, client-side derived E2E key (via PRF/recovery fallback).
**Plans**: 3 plans

Plans:
- [x] 01-01: Initialize Vite React TS client, Node.js Express TS server, Prisma PostgreSQL schema, and react-i18next locales.
- [ ] 01-02: Implement WebAuthn backend/frontend flows using SimpleWebAuthn library to register and log in users.
- [ ] 01-03: Setup client-side Web Crypto helper deriving E2E keys from biometric PRF credentials or a 12-word recovery phrase.

### Phase 2: Sync Protocol & Multi-Logbooks
**Goal**: Setup the offline-first IndexedDB database caching, multiple logbooks CRUD API, and background synchronization/conflict protocol.
**Depends on**: Phase 1
**Requirements**: AUTH-02, AUTH-03, SYS-02
**Success Criteria**:
  1. User can create, rename, delete, and switch between multiple logbooks in the UI.
  2. Database cache stores encrypted objects locally in Dexie.js tables.
  3. Data modifications (CRUD) sync automatically to backend DB payloads when online, handling conflicts gracefully.
**Plans**: 2 plans

Plans:
- [ ] 02-01: Build Dexie.js caching models, user logbook dashboard, and switching UI.
- [ ] 02-02: Implement sync manager that schedules push/pull of encrypted delta packets, conflict markers, and background retries.

### Phase 3: Master Data & Log entries
**Goal**: Implement the user interface forms for Yacht profiles, Crew management, Deviation grids, and Logbook entries, saving encrypted representations locally.
**Depends on**: Phase 2
**Requirements**: VESSEL-01, VESSEL-02, VESSEL-03, DEV-01, DEV-02, LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, INT-01, INT-02, INT-03
**Success Criteria**:
  1. User can edit Yacht, Crew profiles, and Deviation grids, saving them as E2E-encrypted records.
  2. User can write daily log entries, query Geolocation coordinates, and pull OpenWeatherMap data.
  3. Entry data is E2E-encrypted and written to local sync queue.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Build Yacht/Crew profiles forms and the deviation table UI, integrating client-side E2E encrypt/decrypt.
- [ ] 03-02: Implement Logbook entry list, daily header details, and consumption tracking forms.
- [ ] 03-03: Implement logbook event records, browser Geolocation tracker, and OpenWeatherMap integration.

### Phase 4: CSV Export & UI Polish
**Goal**: Build local CSV reporting builders, browser Web Share triggers, connection/sync indicators, and adaptive OS styling.
**Depends on**: Phase 3
**Requirements**: SYS-03, SYS-04, UI-01
**Success Criteria**:
  1. App exports standard unencrypted CSV files compiled on-the-fly client-side (after decrypting entries).
  2. Native email/message sharing dialogs trigger successfully.
  3. UI features sync status (e.g. "Synced / Offline / Unsynced changes") and adapts visual look to Material or Cupertino styles.
**Plans**: 2 plans

Plans:
- [ ] 04-01: Create client-side decryption CSV builder and hook it up to standard browser download and Web Share API.
- [ ] 04-02: Implement online/offline connection state detectors, sync progress bars, and OS-adaptive UI themes.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Auth & E2E Crypto | 1/3 | In progress | - |
| 2. Sync Protocol & Multi-Logbooks | 0/2 | Not started | - |
| 3. Master Data & Log entries | 0/3 | Not started | - |
| 4. CSV Export & UI Polish | 0/2 | Not started | - |
