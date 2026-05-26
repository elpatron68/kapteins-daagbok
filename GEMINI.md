<!-- GSD:project-start source:PROJECT.md -->
## Project

**Kapteins Daagbox (Kapteins Daagbog)**

Kapteins Daagbox is a modern, mobile-first Progressive Web Application (PWA) designed for private yacht owners and captains to manage their ship's logbook digitally. The application enables users to log vessel master data, owner details, crew information, and daily logbook entries conforming to official maritime standards.

**Core Value:** Providing a private-by-design, fully offline-capable mobile maritime logbook that respects absolute user privacy by storing data 100% locally on the device while assisting the skipper with GPS position capture and automated weather integration.

### Constraints

- **Storage**: Must be stored exclusively client-side (IndexedDB / LocalStorage / Origin Private File System).
- **Privacy**: No external telemetry or cloud database connections.
- **Offline**: The app must load and operate fully without internet access (using Service Workers).
- **Languages**: German and English.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
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
# Core & UI
# Storage, PWA & Localization
# Dev Dependencies
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
- Use IndexedDB (via Dexie.js) for storage.
- Because IndexedDB runs entirely in the user's browser sandbox and has no cloud sync, guaranteeing absolute data ownership.
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
