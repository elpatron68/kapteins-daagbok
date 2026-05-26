# Architecture Research

**Domain:** Offline-first PWA Architecture
**Researched:** 2026-05-26
**Confidence:** HIGH

## Component Architecture

Since this is a client-side only PWA, the entire architecture runs in the user's browser sandbox. The structure is separated into UI Components, Services (business logic), and Storage.

```
┌────────────────────────────────────────────────────────┐
│                     User Interface                     │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────┐  │
│  │ Stammdaten   │ │ Logbook Entry  │ │ Settings/    │  │
│  │ (Forms, Crew)│ │ (Forms, List)  │ │ Language     │  │
│  └──────┬───────┘ └───────┬────────┘ └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼──────────┘
          │                 │                 │           
┌─────────▼─────────────────▼─────────────────▼──────────┐
│                   Application Services                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────┐  │
│  │ Geolocation    │ │ Weather Service│ │ Export     │  │
│  │ Service (GPS)  │ │ (OpenWeather)  │ │ Service    │  │
│  └──────┬─────────┘ └───────┬────────┘ └────┬───────┘  │
└─────────┼───────────────────┼───────────────┼──────────┘
          │                   │               │           
┌─────────▼───────────────────▼───────────────▼──────────┐
│                   Data Infrastructure                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │    IndexedDB / Dexie.js (Data Persistence)       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Service Worker (Asset Cache & Offline)        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 1. UI Layer
- **Responsive Layout Shell**: Single page app with a bottom navigation bar for mobile feel and sidebar for tablet/desktop. Responsive and adaptive depending on device size.
- **Form Views**:
  - **Stammdaten Form**: Single tabbed view separating Boat Profile, Crew profiles, and the Deviation Table.
  - **Logbook List**: Chronological display of journal entries with details and summaries.
  - **Logbook Entry Form**: Interactive form with sub-sections for Nautical logs, Weather inputs, Sails, Course, and Consumption controls.
- **Adaptive UI Handler**: Standard CSS variables and OS-detection class selectors (`.platform-ios`, `.platform-android`) to render inputs and dialogs matching Cupertino or Material styles.

### 2. Services Layer
- **GPS Service**: Interface to browser Geolocation API (`navigator.geolocation`). Provides DMS (Degrees, Minutes, Seconds) coordinate formatting.
- **Weather Service**: Performs asynchronous REST requests to OpenWeatherMap API using coordinates. Handles offline fallback gracefully.
- **Export Service**: Generates a CSV file using standard RFC 4180 parameters, creates a dynamic Blob URL, and triggers browser download or invokes `navigator.share` (Web Share API) for native email/message share.
- **Translation Service**: standard `i18next` engine. Automatically detects system locale on first start (`navigator.language`), falls back to English, and persists user selection in LocalStorage.

### 3. Data Infrastructure
- **IndexedDB Storage Scheme (Dexie.js)**:
  - Table `yacht`: Single record containing vessel specs.
  - Table `crew`: Skipper + Crew members.
  - Table `deviation`: 37 records mapping `heading` (MgK 0-360) to `deviation` (Abl).
  - Table `entries`: Logbook records containing dates, coordinates, courses, weather, sails, and daily consumption.
- **Offline Shell**: Service Worker configured using Workbox via `vite-plugin-pwa`. Caches CSS, JS, HTML, fonts, and icons for immediate load.

## Data Flow

### 1. Fetching GPS & Weather
1. User clicks "Auto-Fill GPS/Weather" on a new log entry.
2. Geolocation Service queries `navigator.geolocation.getCurrentPosition()`.
3. Coordinates are returned and set in form state.
4. If internet is available, Weather Service requests OpenWeatherMap using the coordinates.
5. API response (pressure, wind strength, direction, weather icons) is parsed and merged into the form state.
6. User reviews the pre-filled fields and saves the entry.

### 2. Saving to Database & Local Cache
1. Form state triggers `dexie` write operation: `db.entries.add(formData)`.
2. IndexedDB saves the record locally.
3. The UI queries IndexedDB reactively using `useLiveQuery` from `dexie-react-hooks`, updating lists instantly.
4. No network requests are made, ensuring zero lag.

## Suggested Build Order

1. **Setup & PWA Shell**: Initialize Vite React TS, configure `vite-plugin-pwa` with service worker, and setup simple landing shell.
2. **Database Layer**: Implement Dexie.js database schemas, collections, and mock data.
3. **Master Data View (Stammdaten)**: Implement boat profile form, crew cards, and the Deviation grid.
4. **Logbook Entry Forms**: Build the main log entry form, course inputs, and consumption controller.
5. **GPS & Weather Integrations**: Implement device Geolocation fetching and OpenWeatherMap query helpers.
6. **Data Export & Language Switcher**: Add CSV generation/sharing and `react-i18next` localization.
7. **Adaptive UI Polish**: Apply iOS/Android CSS themes and polish responsiveness.

---
*Architecture research for: Kapteins Daagbox PWA*
*Researched: 2026-05-26*
