# Stack Research

**Domain:** Mobile-first, Offline-first PWA
**Researched:** 2026-05-26
**Confidence:** HIGH

## Recommended Stack

We recommend a **React + TypeScript + Vite** stack wrapped with **vite-plugin-pwa** (Workbox) and **Dexie.js** (IndexedDB) for local data storage. This web stack compiles to extremely lightweight assets that load fast on poor connections, works 100% offline, and can easily be packaged using Capacitor if native iOS/Android store apps are required later.

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **React** | 18.x / 19.x | UI Library | Component-driven architecture allows building a modular, reactive UI that easily handles state transitions for logbook forms. |
| **TypeScript** | 5.x | Language | Enforces strict type safety across client and server. |
| **Vite** | 5.x | Build Tool | Fast client packager and Service Worker compiler. |
| **Node.js (Express)** | 20.x | Backend Server | Lightweight API backend to handle WebAuthn challenges and database storage. |
| **PostgreSQL** | 16.x | Relational DB | Robust storage of credentials and E2E-encrypted JSON payloads. |
| **Prisma** | 5.x | ORM | Type-safe SQL database client interface. |
| **TailwindCSS** / **Vanilla CSS** | 3.x / 4.x | Styling | Responsive styling matching iOS/Android. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Dexie.js** | 4.x | IndexedDB Wrapper | Required for robust, structured offline-first storage of ship data and log entries. |
| **vite-plugin-pwa** | 0.20.x | PWA / Service Worker | Handles automatic service worker registration, offline caching of assets, and install prompts. |
| **react-i18next** | 14.x | Multilingual (l18n) | Seamless translation management for German and English. |
| **@simplewebauthn/server** | 9.x / 10.x | Passkey Verification | Validates WebAuthn registration/login assertions on the server. |
| **@simplewebauthn/browser** | 9.x / 10.x | Passkey Client helper | Connects WebAuthn client requests to browser credentials API. |
| **bip39** | 3.x | Recovery phrases | Generates 12-word mnemonic phrases for E2E encryption fallbacks. |
| **lucide-react** | 0.300.x | SVG Icons | Light, modern icon library for weather states, navigation, and logbook actions. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **ESLint / Prettier** | Code linting and formatting | Standardizes code style and catches early bugs. |
| **Lighthouse / DevTools** | PWA and Performance auditing | Essential for testing offline loading and installability criteria. |

## Installation

```bash
# Client Core & UI
npm install react react-dom lucide-react

# Client Storage, PWA, Localization & Cryptography
npm install dexie dexie-react-hooks react-i18next i18next i18next-browser-languagedetector @simplewebauthn/browser bip39

# Client Dev Dependencies
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react vite-plugin-pwa

# Backend Core, ORM & Auth
npm install express dotenv cors @simplewebauthn/server @prisma/client
npm install -D tsx @types/express @types/node @types/cors prisma
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Vite React PWA** | **Flutter Web PWA** | Flutter is strong for native compilation, but Flutter Web suffers from large canvas-kit bundles (2.5MB+ JS load size), which makes it poor for remote maritime connections. Use Flutter if native store presence is the absolute priority from Day 1 and web-performance is secondary. |
| **Dexie.js (IndexedDB)** | **LocalStorage** | LocalStorage is simpler but limited to ~5MB and is synchronous. IndexedDB handles large datasets (e.g. photos in logbooks, years of log entries) asynchronously and is recommended for production. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Plain Firebase / Supabase DB Sync** | Default syncing exposes raw unencrypted database schemas to the cloud provider, violating zero-knowledge privacy. | Custom Node/Express server + E2E encrypted payloads database |
| **Bootstrap** | Heavy, outdated styling that doesn't adapt well to modern native mobile looks. | TailwindCSS / CSS variables |

## Stack Patterns by Variant

**If strict user privacy with multi-device access is required:**
- Use Client-Side E2E Encryption (AES-GCM-256) combined with Local-first IndexedDB (via Dexie.js) synced to a zero-knowledge PostgreSQL server.
- Because client-side encryption ensures the server operator only holds encrypted payloads, retaining absolute user data privacy.

**If poor connectivity is expected:**
- Configure Workbox Service Worker in "CacheFirst" or "StaleWhileRevalidate" mode.
- Because it ensures the application shell loads immediately even with 0% network connection, queueing synchronization packets until the device is online.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vite-plugin-pwa@0.20.x` | `vite@5.x` | Standard integration for Vite-based PWAs. |
| `dexie-react-hooks@4.x` | `react@18.x` | Allows React components to reactively observe IndexedDB query changes. |

## Sources

- [Vite PWA Docs](https://vite-pwa-org.netlify.app/) — PWA caching and service worker strategies.
- [Dexie.js Documentation](https://dexie.org/) — Schema migrations and IndexedDB reactive binding.
- [Web Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) — Browser geolocation capabilities.

---
*Stack research for: Kapteins Daagbox PWA*
*Researched: 2026-05-26*
