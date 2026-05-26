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
| **TypeScript** | 5.x | Language | Enforces strict type safety across logbook entries and crew models, preventing runtime errors. |
| **Vite** | 5.x | Build Tool | Extremely fast bundler and dev server; offers direct support for PWAs via plugins. |
| **TailwindCSS** / **Vanilla CSS** | 3.x / 4.x | Styling | Allows responsive, adaptive styling to match Android/iOS aesthetics and handles mobile viewport constraints. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Dexie.js** | 4.x | IndexedDB Wrapper | Required for robust, structured offline-first storage of ship data and log entries. |
| **vite-plugin-pwa** | 0.20.x | PWA / Service Worker | Handles automatic service worker registration, offline caching of assets, and install prompts. |
| **react-i18next** | 14.x | Multilingual (l18n) | Seamless translation management for German and English with automatic language detection. |
| **lucide-react** | 0.300.x | SVG Icons | Light, modern icon library for weather states, navigation, and logbook actions. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **ESLint / Prettier** | Code linting and formatting | Standardizes code style and catches early bugs. |
| **Lighthouse / DevTools** | PWA and Performance auditing | Essential for testing offline loading and installability criteria. |

## Installation

```bash
# Core & UI
npm install react react-dom lucide-react

# Storage, PWA & Localization
npm install dexie dexie-react-hooks react-i18next i18next i18next-browser-languagedetector

# Dev Dependencies
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react vite-plugin-pwa
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Vite React PWA** | **Flutter Web PWA** | Flutter is strong for native compilation, but Flutter Web suffers from large canvas-kit bundles (2.5MB+ JS load size), which makes it poor for remote maritime connections. Use Flutter if native store presence is the absolute priority from Day 1 and web-performance is secondary. |
| **Dexie.js (IndexedDB)** | **LocalStorage** | LocalStorage is simpler but limited to ~5MB and is synchronous. IndexedDB handles large datasets (e.g. photos in logbooks, years of log entries) asynchronously and is recommended for production. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Firebase / Supabase** | Requires online connection for core operations; violates "local-only" strict privacy constraint. | Dexie.js + Local IndexedDB |
| **Bootstrap** | Heavy, outdated styling that doesn't adapt well to modern native mobile looks. | TailwindCSS / CSS variables |

## Stack Patterns by Variant

**If strict local privacy is required:**
- Use IndexedDB (via Dexie.js) for storage.
- Because IndexedDB runs entirely in the user's browser sandbox and has no cloud sync, guaranteeing absolute data ownership.

**If poor connectivity is expected:**
- Configure Workbox Service Worker in "CacheFirst" or "StaleWhileRevalidate" mode.
- Because it ensures the application shell loads immediately even with 0% network connection.

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
