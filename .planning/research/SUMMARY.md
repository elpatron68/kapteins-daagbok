# Project Research Summary

**Project:** Kapteins Daagbox (Kapteins Daagbog)
**Domain:** Offline-first PWA, Maritime Logbook
**Researched:** 2026-05-26
**Confidence:** HIGH

## Executive Summary

Kapteins Daagbox is an offline-first PWA that serves as a digital ship's logbook for private yachts. It places a primary emphasis on complete data privacy by storing all yacht, crew, and journal entries entirely local to the user's browser database (IndexedDB). 

The recommended approach uses **Vite + React + TypeScript + Dexie.js + TailwindCSS**, which guarantees a lightweight bundle that loads quickly on low-bandwidth mobile connections at sea. The app incorporates browser Geolocation APIs for automatic GPS coordinate capture and integrates with OpenWeatherMap for sea/weather pre-filling.

Key risks include data loss due to OS storage reclamation policies (particularly on iOS Safari) and API timeouts when connections fail. These are mitigated by instructing the user to install the app as a PWA on their Home Screen, enabling persistent storage APIs, and using local draft autosaving along with regular CSV backups.

## Key Findings

### Recommended Stack

We recommend React with Vite and TypeScript for fast rendering and development. [STACK.md](STACK.md) details the tools and configurations.

**Core technologies:**
- **React + TS + Vite**: Builds a fast, responsive mobile app compiled to lightweight static assets.
- **Dexie.js (IndexedDB)**: An asynchronous, robust client-side database with reactive binding for UI state management.
- **vite-plugin-pwa (Workbox)**: Configures offline asset caching, service worker hooks, and updates.
- **react-i18next**: Handles German/English localizations and browser language auto-detection.

### Expected Features

Detailed scoping is tracked in [FEATURES.md](FEATURES.md).

**Must have (table stakes):**
- **Vessel Profile & Crew Registry**: Stammdaten forms capturing yacht specifications and up to 6 crew records.
- **Steuertafel (Deviation table)**: Grid aligning compass headings with magnetic deviation.
- **Logbook Forms**: Rich fields capturing journey details, course, wind, sails, sea state, and daily fuel/water checks.
- **Local Database & Offline Capability**: Persistent client-side storage and offline asset availability.
- **CSV Data Export**: Generating and downloading logs in standard CSV format.

**Should have (differentiators):**
- **GPS Pre-filling**: Instant fetch of coordinates via browser Geolocation.
- **Weather API Integration**: Prefill coordinates' weather and wind parameters via OpenWeatherMap.
- **Adaptive OS UI**: CSS themes styled to blend with Android Material or iOS Cupertino designs.

### Architecture Approach

Detailed in [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. **IndexedDB (Dexie)**: Structured database tables for yacht metadata, crew, compass deviations, and logbook entries.
2. **App Shell UI**: A single-page layout with responsive page navigation, form views, and a storage status check.
3. **Application Services**: Isolated logic handlers for GPS acquisition, OpenWeather API requests, translation bundles, and CSV builders.
4. **Service Worker Cache**: Local static asset container ensuring immediate PWA load times.

### Critical Pitfalls

Mitigation steps are outlined in [PITFALLS.md](PITFALLS.md).

1. **iOS Safari Storage Purge**: Safely bypassed by adding instructions for PWA installation (preventing Safari's 7-day inactivity purge) and requesting persistent storage.
2. **Offline Weather API Timeouts**: Resolved by checking connection status and setting a strict 5-second timeout on requests.
3. **GPS Fetch Delays**: Mitigated by setting high-accuracy timeouts, validating precision, and offering full manual entry.
4. **SW Caching Stale Updates**: Handled by adding update prompts instead of automatic service worker overrides.

## Implications for Roadmap

Based on research and dependencies, we suggest a 4-phase rollout:

### Phase 1: Foundation & Data Infrastructure
- **Rationale**: Setting up the development bundle, service worker, and local database first ensures all subsequent screens can read/write data in real-time.
- **Delivers**: PWA shell, Dexie DB database models, and English/German language configuration.
- **Addresses**: DATA-01 (Local storage), DATA-02 (Offline), GEN-02 (Multilingual).
- **Avoids**: Service worker stale caching updates (set up correctly at the beginning).

### Phase 2: Vessel & Crew Management (Stammdaten)
- **Rationale**: Master data must be created before a skipper can log a journey.
- **Delivers**: Vessel specifications form, Crew lists management, and the Compass Deviation Grid.
- **Addresses**: MASTER-01 (Vessel/Crew data), Steuertafel.
- **Uses**: Dexie tables for yacht, crew, and deviation.

### Phase 3: Logbook Entries & Integration
- **Rationale**: Core logbook entries require the vessel profile and deviation calculations defined in Phase 2.
- **Delivers**: Log list, log entry form with weather/sea/sail selectors, GPS position pre-fill, and OpenWeather API hook.
- **Addresses**: LOG-01 (Forms), LOG-02 (Weather), LOG-03 (GPS).
- **Avoids**: GPS fetch delays and offline API hangs (using timeouts and fallbacks).

### Phase 4: Data Export & UI Polish
- **Rationale**: Finalizing data portability and polishing visual alignment.
- **Delivers**: CSV export, local mail/share handlers, storage persistence checks, and iOS/Android adaptive themes.
- **Addresses**: DATA-03 (CSV Export), GEN-01 (Mobile-first adaptive UI).
- **Avoids**: iOS storage purges (by implementing persistent storage requests and PWA install warnings).

### Phase Ordering Rationale

The suggested order establishes database schemas first, followed by static profiles, dynamic transaction forms, and finally export utilities. This minimizes developer friction by ensuring database queries can be fully tested in mock views before building the complex logbook interface.

### Research Flags

- **Phase 3 (Logbook & API integration)**: Needs careful handling of API key configuration (stored client-side in LocalStorage, not bundled in public repo for security) and geolocation permissions.
- **Phase 4 (PWA Storage & UI adaptation)**: Requires verification of persistent storage requests across iOS/Android browsers.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Vite React TS is standard for offline PWAs. Dexie is well-maintained and reliable. |
| Features | HIGH | Extracted directly from official PDF example logbook layout. |
| Architecture | HIGH | Standard client-side-only architecture without server dependencies. |
| Pitfalls | HIGH | Service worker caching and iOS storage limits are thoroughly documented in developer circles. |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenWeatherMap API Key**: The app requires an API key. We will implement a setting allowing users to provide their own OpenWeatherMap API key (saved in LocalStorage) so that the app remains open-source, client-side, and avoids developer key exposure.

## Sources

- [Vite PWA Docs](https://vite-pwa-org.netlify.app/)
- [Dexie.js Documentation](https://dexie.org/)
- [Apple WebKit Storage Guidelines](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)

---
*Research completed: 2026-05-26*
*Ready for roadmap: yes*
