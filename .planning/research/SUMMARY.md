# Project Research Summary

**Project:** Kapteins Daagbox (Kapteins Daagbog)
**Domain:** Offline-first PWA, Maritime Logbook
**Researched:** 2026-05-26
**Confidence:** HIGH

## Executive Summary

Kapteins Daagbox is an offline-first PWA synced with a zero-knowledge backend server, serving as a secure digital ship's logbook for private yachts. It guarantees data privacy via client-side End-to-End Encryption (E2E), ensuring the server only stores encrypted payloads.

The recommended stack features a **React + TS + Vite** frontend, a **Node.js Express + Prisma + PostgreSQL** backend, **Dexie.js** for local caching, and **WebAuthn** for passwordless Passkey login. E2E key derivation uses biometric/hardware PRF input or a 12-word recovery phrase.

Key risks include loss of client-side encryption keys (causing unrecoverable server data), browser compatibility with WebAuthn, and concurrent offline synchronization conflicts. These are mitigated by a mandatory recovery phrase verification on registration, using standard security key fallbacks, and applying Last-Write-Wins timestamps to sync packets.

## Key Findings

### Recommended Stack

We recommend a React with Vite client paired with a Node.js + Express backend using Prisma and PostgreSQL. [STACK.md](STACK.md) details the configurations.

**Core technologies:**
- **React + TS + Vite / Node.js Express**: Full-stack TypeScript environment.
- **PostgreSQL & Prisma**: Backend storage for user credentials and encrypted payloads.
- **Dexie.js (IndexedDB)**: Client-side local transaction cache.
- **WebAuthn (@simplewebauthn)**: Passkey integration for passwordless logins.
- **Web Crypto API**: High-performance, browser-native client encryption.

### Expected Features

Detailed scoping is tracked in [FEATURES.md](FEATURES.md).

**Must have (table stakes):**
- **Passkey Auth & E2E Encryption**: Biometric user onboarding and client-side AES-GCM data encryption.
- **Multi-Logbook Manager**: Dashboard UI to manage and switch between multiple ship logbooks.
- **Stammdaten Forms**: Yacht profile, skipper/crew profiles, and Deviation grids.
- **Sync Protocol**: Local-first caching synced securely to PostgreSQL payloads.
- **CSV Data Export**: Decrypted on-the-fly client-side CSV downloads.

**Should have (differentiators):**
- **GPS & Weather Integration**: Browser Geolocation API and OpenWeatherMap lookup with offline fallbacks.
- **Adaptive OS UI**: Platforms adaptive Cupertino (iOS) and Material (Android) themes.

### Architecture Approach

Detailed in [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
- **Zero-Knowledge Backend**: Handles Passkey verification and stores E2E encrypted string blocks without access to user keys.
- **IndexedDB Caching Layer**: Local cache database holding encrypted versions of active logbooks and syncQueue.
- **E2E Cryptographic Service**: Web Crypto utilities implementing PRF-derived keys and BIP39 fallback phrases.
- **Offline PWA Shell**: Service worker caching front-end assets for offline launch.

### Critical Pitfalls

Mitigation steps are outlined in [PITFALLS.md](PITFALLS.md).

1. **E2E Key Recovery Loss**: Force recovery phrase validation during sign-up to prevent permanent data loss.
2. **WebAuthn Compatibility**: Check authenticator status and fallback to hardware security keys.
3. **Offline Sync Conflicts**: Utilize transaction logs, last-write-wins rules, and append-only entries with merge warnings.
4. **Offline Weather/GPS Timeouts**: Set 5-second weather fetch timeouts and 10-second GPS lock limits.

## Implications for Roadmap

Based on research and dependencies, we suggest a revised 4-phase rollout:

### Phase 1: Foundation, Auth & E2E Crypto
- **Rationale**: Creating the client PWA and Express backend repositories first allows building the core security boundary (Passkeys and Web Crypto key derivation) before handling user data.
- **Delivers**: Node backend, Prisma schema, WebAuthn options endpoints, and Web Crypto PRF/recovery helpers.
- **Addresses**: AUTH-01 (Passkeys), CRYPTO-01/02/03 (E2E encryption), UI-02/03 (Languages).

### Phase 2: Sync Protocol & Multi-Logbooks
- **Rationale**: Developing the caching database, sync protocol, and multi-logbook views next ensures all subsequent UI features sync automatically in the background.
- **Delivers**: Multi-logbook dashboards, Local IndexedDB cache tables, and synchronization transaction queue API.
- **Addresses**: AUTH-02/03 (Multi-logbooks), SYS-02 (Local-first sync).

### Phase 3: Master Data & Log entries
- **Rationale**: The UI forms can now read/write securely from the E2E-encrypted sync layer built in Phase 2.
- **Delivers**: Yacht forms, Crew lists, deviation grids, and journal entry records synced to the database.
- **Addresses**: VESSEL-01/02/03 (Boat/crew profiles), DEV-01/02 (Deviation grid), LOG-01/02/03/04/05 (Journal logs), INT-01/02/03 (GPS & Weather).

### Phase 4: CSV Export & UI Polish
- **Rationale**: Compiling exports and polishing OS-native layouts completes the user cycle.
- **Delivers**: Client-side decryption CSV builder, sync progress indicators, and Material/Cupertino styles.
- **Addresses**: SYS-03/04 (CSV Share/Export), UI-01 (Adaptive UI layout).

### Phase Ordering Rationale

The suggested order establishes the backend server and cryptographic vault first. Next, it handles multi-logbook syncing so that when the master forms and log entries are coded in Phase 3, they plug immediately into a working, encrypted offline sync pipeline.

### Research Flags

- **Phase 3 (Logbook & API integration)**: Needs careful handling of API key configuration (stored client-side in LocalStorage, not bundled in public repo for security) and geolocation permissions.
- **Phase 4 (PWA Storage & UI adaptation)**: Requires verification of persistent storage requests across iOS/Android browsers.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Express, Prisma, Postgres, and Dexie are highly reliable. SimpleWebAuthn makes Passkey integration straightforward. |
| Features | HIGH | Expanded requirements map directly to nautical guidelines while preserving user ownership. |
| Architecture | HIGH | Hybrid client-side E2E zero-knowledge design has been proven by services like Proton. |
| Pitfalls | HIGH | Identified key recovery and offline sync conflict risks early with mitigation strategies. |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenWeatherMap API Key**: Stored client-side in LocalStorage to avoid server exposure or leakage of developer keys.
- **Database Hosting**: Will require configuring a PostgreSQL instance (e.g. Docker container locally or cloud host for production).

## Sources

- [Vite PWA Docs](https://vite-pwa-org.netlify.app/)
- [Dexie.js Documentation](https://dexie.org/)
- [WebAuthn Specification & SimpleWebAuthn Docs](https://webauthn.guide/)
- [Web Crypto API Reference (W3C)](https://www.w3.org/TR/WebCryptoAPI/)

---
*Research completed: 2026-05-26*
*Ready for roadmap: yes*
