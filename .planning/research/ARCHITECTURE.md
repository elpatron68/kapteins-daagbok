# Architecture Research

**Domain:** Offline-first PWA Architecture
**Researched:** 2026-05-26
**Confidence:** HIGH

## Component Architecture

The application uses an offline-first PWA architecture synced with a remote database. End-to-end (E2E) encryption is managed entirely on the client, ensuring the server only receives encrypted payloads.

```
┌────────────────────────────────────────────────────────┐
│                     User Interface                     │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────┐  │
│  │ Stammdaten   │ │ Logbook Entry  │ │ Auth & Logs  │  │
│  │ (Forms, Crew)│ │ (Forms, List)  │ │ (Passkey)    │  │
│  └──────┬───────┘ └───────┬────────┘ └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼──────────┘
          │                 │                 │           
┌─────────▼─────────────────▼─────────────────▼──────────┐
│                   Application Services                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────┐  │
│  │ Geolocation    │ │ Weather Service│ │ Export     │  │
│  │ Service (GPS)  │ │ (OpenWeather)  │ │ Service    │  │
│  └────────────────┘ └────────────────┘ └────────────┘  │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────┐  │
│  │ WebAuthn Client│ │ E2E Cryptography│ │ Sync       │  │
│  │ (Passkey Auth) │ │ (Web Crypto)   │ │ Service    │  │
│  └────────┬───────┘ └───────┬────────┘ └────┬───────┘  │
└───────────┼─────────────────┼───────────────┼──────────┘
            │                 │               │
┌───────────▼─────────────────▼───────────────▼──────────┐
│                 Local Data Infrastructure              │
│  ┌──────────────────────────────────────────────────┐  │
│  │    IndexedDB / Dexie.js (Data Persistence Cache) │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Service Worker (Asset Cache & Offline)        │  │
│  └──────────────────────────┬───────────────────────┘  │
└─────────────────────────────┼──────────────────────────┘
                              │ HTTPS (Encrypted Payloads & WebAuthn JSON)
                              ▼
┌────────────────────────────────────────────────────────┐
│                     Backend Infrastructure             │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Node.js Express API (WebAuthn Validation)     │  │
│  └──────────────────────────┬───────────────────────┘  │
│  ┌──────────────────────────▼───────────────────────┐  │
│  │    PostgreSQL Database (Encrypted Payloads)      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 1. UI Layer
- **Responsive Layout Shell**: Single page app with bottom navigation bar for mobile feel and sidebar for tablet/desktop. Responsive and adaptive depending on device size.
- **Form & Management Views**:
  - **Auth Onboarding Panel**: Handles Passkey registration/login and generates or inputs the 12-word recovery key.
  - **Logbook Dashboard**: Overview panel listing available user logbooks, option to create a new logbook, and active logbook selection.
  - **Stammdaten Form**: Single tabbed view separating Boat Profile, Crew profiles, and the Deviation Table.
  - **Logbook List**: Chronological display of journal entries with details and summaries.
  - **Logbook Entry Form**: Interactive form with sub-sections for Nautical logs, Weather inputs, Sails, Course, and Consumption controls.
- **Adaptive UI Handler**: Standard CSS variables and OS-detection class selectors (`.platform-ios`, `.platform-android`) to render inputs and dialogs matching Cupertino or Material styles.

### 2. Services Layer
- **E2E Cryptography Service**: Uses standard Web Crypto API. Handles AES-GCM encryption/decryption of logbook payloads. Manages key derivation via PBKDF2/HKDF using WebAuthn PRF inputs or a 12-word recovery phrase.
- **WebAuthn Authentication Service**: Connects to the browser's credentials API (`navigator.credentials`) and `@simplewebauthn/browser`. Communicates registration and authentication challenges to the server.
- **Synchronization Service**: Tracks offline data mutations in a local transaction log. Resolves push/pull updates with the server API when online using conflict resolution algorithms (client-wins/last-write-wins).
- **GPS Service**: Interface to browser Geolocation API (`navigator.geolocation`). Provides DMS (Degrees, Minutes, Seconds) coordinate formatting.
- **Weather Service**: Performs asynchronous REST requests to OpenWeatherMap API using coordinates. Handles offline fallback gracefully.
- **Export Service**: Client-side decrypts entries, generates a CSV file using standard RFC 4180 parameters, creates a dynamic Blob URL, and triggers browser download or invokes `navigator.share` (Web Share API) for native email/message share.
- **Translation Service**: standard `i18next` engine. Automatically detects system locale on first start (`navigator.language`), falls back to English, and persists user selection in LocalStorage.

### 3. Local Data Infrastructure
- **IndexedDB Caching (Dexie.js)**:
  - Table `yacht`: Yacht records, schema: `id, logbookId, encryptedData, updatedAt`.
  - Table `crew`: Crew profiles, schema: `id, logbookId, encryptedData, updatedAt`.
  - Table `deviation`: Compass deviations, schema: `id, logbookId, encryptedData, updatedAt`.
  - Table `entries`: Logbook records, schema: `id, logbookId, encryptedData, updatedAt`.
  - Table `logbooks`: Logbook metadata, schema: `id, encryptedTitle, updatedAt, isSynced`.
  - Table `syncQueue`: Sync status tracking local pending mutations.
- **Offline Shell**: Service Worker configured using Workbox via `vite-plugin-pwa`. Caches CSS, JS, HTML, fonts, and icons for immediate load.

### 4. Backend Infrastructure
- **Node.js Server (TypeScript & Express)**:
  - API Routes: `/api/auth/register-options`, `/api/auth/register-verify`, `/api/auth/login-options`, `/api/auth/login-verify`, `/api/logbooks`, `/api/sync`.
  - Uses `@simplewebauthn/server` for validating Passkey cryptography.
- **PostgreSQL Database**:
  - `User`: id, username, createdAt.
  - `Credential`: id, userId, credentialId, publicKey, counter, transports.
  - `Logbook`: id, userId, encryptedTitle, createdAt, updatedAt.
  - `Payloads` (Yacht, Crew, Deviation, Entries): E2E encrypted string blobs stored by logbookId.

## Data Flow

### 1. WebAuthn Registration and Key Derivation
1. User registers passwordlessly using their device biometric authenticator (Passkey).
2. During registration, the WebAuthn PRF extension is invoked to derive a unique symmetric key input from the hardware credential.
3. If PRF is unsupported, or as a recovery fallback, the client generates a 12-word BIP39 recovery phrase and derives a master key via PBKDF2.
4. The client generates a random 256-bit User Master Key.
5. The User Master Key is E2E-encrypted with the PRF-derived key and (separately) with the recovery-derived key.
6. The encrypted User Master Key payloads are sent to the server and stored.
7. During subsequent logins, the authenticator is used to verify identity and regenerate the PRF key. The client requests the encrypted User Master Key from the server, decrypts it locally, and stores it in memory.

### 2. Encryption and Synchronization
1. User makes edits to a logbook entry locally.
2. The client fetches the User Master Key from memory, encrypts the data payload using AES-GCM (generating a IV and authentication tag), and writes it to the local IndexedDB.
3. A local mutation event is created in the `syncQueue` table.
4. The Sync Service attempts to POST the encrypted payload (`{ logbookId, payloadId, encryptedData, iv, tag, updatedAt }`) to the backend `/api/sync` endpoint.
5. The backend validates the user's session and commits the encrypted payload directly to PostgreSQL.
6. If the user is offline, the syncQueue retains the event and retries once network connectivity is restored (`navigator.onLine`).

## Suggested Build Order

1. **Setup & Foundations**: Initialize client Vite PWA, Express TS backend server, Prisma schema and PostgreSQL database docker/connection.
2. **Auth & Crypto Layer**: Implement Passkey registration and assertion using WebAuthn. Build Web Crypto API utilities for PRF/recovery key E2E master key decryption.
3. **Multi-Logbook & Sync**: Implement multi-logbook dashboards, switching logic, IndexedDB local cache tables, and sync queue protocols.
4. **Forms UI & Client Encryption**: Implement Yacht, Crew profiles, and Deviation grid editors that write and read encrypted data.
5. **Logbook Entries & Integrations**: Build entry forms, Geolocation GPS fetcher, and OpenWeatherMap lookup service.
6. **Decryption Export & Styling**: Implement client-side decryption CSV builder, sync indicator bars, and platform CSS adaptations.

---
*Architecture research for: Kapteins Daagbox PWA*
*Researched: 2026-05-26*
