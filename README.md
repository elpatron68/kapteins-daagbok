# Kapteins Daagbok

Digitales Yacht-Logbuch als Progressive Web App (PWA) — **kostenlos**, **werbefrei**, offline-fähig, End-to-End-verschlüsselt und mit Passkey-Anmeldung.

**Live:** [kapteins-daagbok.eu](https://kapteins-daagbok.eu) · **Demo:** [kapteins-daagbok.eu/demo](https://kapteins-daagbok.eu/demo)

## Überblick

Kapteins Daagbok richtet sich an private Skipper und Yachtbesitzer, die ihr Bordlogbuch digital führen möchten. Die App speichert Schiffsdaten, Crew-Profile und Reisetage (Törns) in einem Format, das an übliche nautische Logbuch-Vorlagen angelehnt ist.

Alle sensiblen Inhalte werden **clientseitig verschlüsselt** (Web Crypto API). Der Server sieht nur ciphertext — eine Zero-Knowledge-Architektur. Daten liegen zusätzlich lokal in IndexedDB (Dexie.js) und synchronisieren im Hintergrund, sodass die App **auch offline** auf See nutzbar ist.

## Funktionen

- **Passkey-Authentifizierung** (WebAuthn) mit optionaler Recovery-Phrase und lokalem PIN-Fallback
- **Mehrere Logbücher** pro Benutzerkonto — eigene Logbücher und per Einladung geteilte Logbücher (Crew-Zugang) klar getrennt
- **Reisetage** mit Hafen, Wetter, Tankständen, Ereignissen und Tagesnummer
- **Kompass-Dial** für MgK- und RwK-Kurse — Ring-Eingabe, Gradfeld, Schrittweite 1°/5°/10° (maritime Orientierung: 0° = Nord)
- **GPS-Tracks** (GPX/KML/GeoJSON-Upload, Karte, Statistiken)
- **Foto-Anhänge** pro Reisetag
- **Passkey-Signaturen** für Skipper und Crew (hybride elektronische Signatur)
- **Schiffsdaten** und **Crew-Profile** (Skipper + Mitglieder)
- **Statistik-Dashboard** — Strecken, Verbrauch, Segel/Motor, Hafenkette (pro Logbuch oder accountweit)
- **Benutzerprofil** — kontoweite Einstellungen: Darstellung (Theme, Hell/Dunkel), OpenWeatherMap-API-Key, Web Push, PWA-Installation, Onboarding-Tour, Passkey-Verwaltung, Account-Statistik
- **Kollaboration** — Crew per Einladungslink einladen (Schreib- oder Lesezugriff)
- **Push-Benachrichtigungen** (optional) — Logbuch-Eigner per Web Push informieren, wenn Crew Änderungen synchronisiert (ohne Klartext-Inhalte; Opt-in im Benutzerprofil)
- **Read-only-Freigabe** — öffentlicher Lese-Link für Dritte
- **Export** — PDF pro Reisetag, CSV-Download/-Teilen
- **Backup & Wiederherstellung** — vollständiges verschlüsseltes Logbuch-Backup (Einträge, Fotos, GPS, Crew, Schiff) als `.daagbok.json`; Restore auf gleichem oder neuem Account
- **Feedback** — Bug-, Feature- und allgemeine Rückmeldungen aus der App (serverseitig via [Ntfy](https://ntfy.sh) oder self-hosted)
- **PWA** — installierbar auf iOS/Android, Offline-Modus, Update-Hinweise
- **Mehrsprachig** — Deutsch und Englisch
- **Demo-Logbuch & Onboarding-Tour** für neue Nutzer (auch unter `/demo` ohne Anmeldung)

### Benutzerprofil vs. Logbuch-Einstellungen

| Bereich | Inhalt |
|---------|--------|
| **Benutzerprofil** | Theme, Farbschema, Wetter-API-Key, Push, PWA, Tour, Passkeys, Account löschen |
| **Logbuch-Einstellungen** | Crew-Einladungen, öffentliche Freigabe, Backup & Wiederherstellung (nur Eigner) |

## Architektur

```
┌─────────────────┐     HTTPS/API        ┌─────────────────┐
│  React PWA      │ ◄──────────────────► │  Express API    │
│  Vite + Dexie   │   (nur ciphertext)   │  Prisma + PG    │
│  IndexedDB      │                      │  PostgreSQL     │
└─────────────────┘                      └─────────────────┘
```

| Schicht | Technologie |
|---------|-------------|
| Frontend | React 19, TypeScript, Vite, vite-plugin-pwa |
| Lokaler Speicher | Dexie.js (IndexedDB), Hintergrund-Sync |
| Backend | Node.js, Express, Prisma |
| Datenbank | PostgreSQL 16 |
| Auth | WebAuthn (Passkeys) + signiertes HttpOnly-Session-Cookie (`daagbok_session`) |
| Krypto | Web Crypto API (AES-GCM), BIP39 Recovery |
| Push (optional) | Web Push (VAPID), Custom Service Worker (`injectManifest`) |
| Feedback (optional) | Ntfy (HTTP Publish) |

### Rollen & Zugriff

| Rolle | Bedeutung |
|-------|-----------|
| **Owner** | Logbuch angelegt; voller Zugriff, Einladungen, Backup, Löschen; optional Push bei Crew-Änderungen |
| **Collaborator (WRITE)** | Per Einladung; Einträge bearbeiten und als Crew signieren |
| **Collaborator (READ)** | Nur Lesen (z. B. öffentlicher Share-Link) |

Skipper- und Crew-Profile im Logbuch sind **Inhaltsdaten** (verschlüsselt), nicht an den Account gebunden. Ein Account kann gleichzeitig Owner eines eigenen und Collaborator in fremden Logbüchern sein.

### Authentifizierung & Session

| Schicht | Verhalten |
|---------|-----------|
| **Login** | WebAuthn (`/api/auth/login-verify`) — danach HttpOnly-Cookie, 7 Tage gültig |
| **API-Aufrufe** | Cookie `credentials: 'include'` (Client: `apiFetch`) — kein `X-User-Id` |
| **Master-Key** | Nur im RAM; nach Reload Entsperren per Passkey oder lokalem PIN |
| **Step-up** | Konto löschen, PRF-Enrollment: frische Passkey-Bestätigung (`/api/auth/reauth-*`) |
| **Sync WRITE** | Server lehnt Schreib-Sync für Collaborator mit `READ` ab |

Öffentliche Routen (ohne Session): Registrierung/Login-Optionen, Einladungsdetails, Read-only-Share (`share-pull`), Health-Check, VAPID-Public-Key.

## Backup & Wiederherstellung

Nur der **Logbuch-Eigner** kann unter **Logbuch-Einstellungen → Backup & Wiederherstellung** ein vollständiges Backup erstellen:

1. Backup-Passphrase wählen (min. 8 Zeichen, getrennt von der Datei aufbewahren)
2. Download als `.daagbok.json` — enthält alle verschlüsselten Payloads inkl. **Fotos** und GPS-Tracks
3. **Wiederherstellen** in einem beliebigen Account (nach Registrierung/Login): Datei + Passphrase

Vor dem Löschen eines Logbuchs weist die App auf diese Funktion hin. Crew-Einladungen und Passkey-Signaturen werden nicht mitübertragen — Inhalte bleiben lesbar, Signaturen auf neuem Account ggf. nicht mehr verifizierbar.

## Push-Benachrichtigungen (optional)

Logbuch-**Eigner** können im **Benutzerprofil** Web Push aktivieren. Sobald ein eingeladenes Crewmitglied mit Schreibrechten (`WRITE`) Änderungen synchronisiert, erhält der Owner eine **generische** Benachrichtigung — der Server kennt keine Logbuch-Inhalte (Zero-Knowledge).

| Aspekt | Verhalten |
|--------|-----------|
| Auslöser | Erfolgreicher Sync-Push durch Collaborator (`create`/`update`) |
| Aggregation | Mehrere Änderungen in einem Sync → eine Benachrichtigung pro Logbuch |
| Drosselung | Max. eine Push-Nachricht pro Logbuch alle 3 Minuten |
| Klick | Öffnet die App auf dem betroffenen Logbuch |

**Voraussetzungen:**

- HTTPS (Produktion)
- VAPID-Schlüssel auf dem Server (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- Browser-Berechtigung „Benachrichtigungen“; auf **iOS** installierte PWA ab iOS 16.4+

Schlüssel erzeugen: `npx web-push generate-vapid-keys` (im `server/`-Verzeichnis oder global).

Ausführlicher Implementierungs- und Testplan: [docs/push-notifications-plan.md](docs/push-notifications-plan.md).

## Feedback (optional)

Eingeloggte Nutzer können über das Feedback-Formular in der App Rückmeldungen senden. Der Server leitet sie an einen **Ntfy**-Topic weiter (kein Klartext-Logbuch auf dem Server).

| Variable | Bedeutung |
|----------|-----------|
| `NTFY_SERVER` | Basis-URL (Standard: `https://ntfy.sh`) |
| `NTFY_TOPIC` | Topic-Name (ohne URL) |
| `NTFY_TOKEN` | Optional: Access-Token für geschützte Topics |

Ohne `NTFY_TOPIC` antwortet die API mit „nicht konfiguriert“. Rate-Limiting und einfacher Spam-Schutz sind serverseitig aktiv.

## Projektstruktur

```
kapteins-daagbok/
├── client/              # React-PWA (Frontend)
│   ├── src/
│   │   ├── components/  # UI (u. a. CourseDialInput, UserProfilePage, FeedbackModal)
│   │   ├── services/    # Auth, Sync, Krypto, Backup, Push, Analytics, …
│   │   ├── sw.ts        # Service Worker (Precache + Web Push)
│   │   └── i18n/        # DE/EN-Übersetzungen
│   └── Dockerfile       # Nginx-Produktions-Image
├── server/              # Express-API + Prisma
│   ├── src/routes/      # auth, logbooks, sync, collaboration, sign, push, feedback, weather
│   ├── src/services/    # z. B. pushNotify, ntfyNotify
│   └── prisma/          # Datenbankschema
├── docs/                # Projektdokumentation
├── scripts/             # Dev- und Deploy-Skripte
├── docker-compose.yml   # Produktions-Stack (DB + Backend + Frontend)
└── VERSION              # App-Version (Build & Footer)
```

## Voraussetzungen

- **Node.js** 20+
- **npm**
- **Docker** (für PostgreSQL in der Entwicklung oder den vollständigen Stack)
- Optional: eigener OpenWeatherMap-API-Key im **Benutzerprofil** (sonst serverseitiger Key aus `.env`)
- Optional: VAPID-Schlüssel für Web Push (siehe Abschnitt Push-Benachrichtigungen)
- Optional: Ntfy-Topic für Feedback (siehe Abschnitt Feedback)

## Lokale Entwicklung

### 1. Abhängigkeiten installieren

```bash
cd server && npm ci && cd ..
cd client && npm ci && cd ..
```

### 2. Umgebungsvariablen

```bash
cp .env.example .env
```

Kopiere `.env.example` nach `.env` und passe mindestens an:

| Variable | Dev (Vite) | Produktion |
|----------|------------|------------|
| `RP_ID` | `localhost` | `kapteins-daagbok.eu` |
| `ORIGIN` | `http://localhost:5173` | `https://kapteins-daagbok.eu` |
| `SESSION_SECRET` | empfohlen (≥ 32 Zeichen) | **Pflicht** |

`ORIGIN` muss **exakt** der Frontend-URL entsprechen (CORS + Session-Cookie). Das Backend lädt `.env` aus dem Projektroot und optional `server/.env`.

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/daagbox?schema=public"
OpenWeatherMapAPIKey=          # Fallback für Wetter-Abruf, wenn Nutzer keinen eigenen Key hat
RP_ID=localhost
ORIGIN=http://localhost:5173
SESSION_SECRET=                 # openssl rand -base64 48 (in Prod Pflicht)
# Optional — Web Push (npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@kapteins-daagbok.eu
# Optional — Feedback via Ntfy
NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=
NTFY_TOKEN=
```

`./scripts/start-dev.sh` prüft `ORIGIN` und `SESSION_SECRET` beim Start und gibt Hinweise aus.

### 3. Datenbank & Schema

Das Dev-Skript startet PostgreSQL in Docker (`postgres-daagbox`). Schema anwenden:

```bash
cd server && npx prisma db push && cd ..
```

### 4. Dev-Server starten

```bash
./scripts/start-dev.sh
```

| Dienst | URL |
|--------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| Health Check | http://localhost:5000/api/health |
| Public Demo | http://localhost:5173/demo |

### 5. Qualität & Tests

Vor jedem Deploy auf [kapteins-daagbok.eu](https://kapteins-daagbok.eu/) (kein externes CI):

```bash
npm run check
# oder: ./scripts/predeploy-check.sh
```

Einzeln: `npm test` (Client + Server) · `npm run build` · optional `npm run lint` (Client, noch nicht in `check`)

- **Client:** Vitest für Utils, i18n, Services
- **Server:** Smoke-Tests (`/api/health`, Auth-Guards) mit Supertest — siehe `server/src/api.smoke.test.ts`

## Docker (produktionsnah)

Gesamten Stack lokal bauen und starten:

```bash
./scripts/start-dev-docker.sh
```

Frontend: http://localhost · API: http://localhost/api/health · Demo: http://localhost/demo

Umgebungsvariablen in `.env` setzen — mindestens `RP_ID`, `ORIGIN` (z. B. `http://localhost`), `SESSION_SECRET` und für Docker Compose `POSTGRES_PASSWORD`. Für Push die VAPID-Variablen an den Backend-Container durchreichen (`docker-compose.yml` → `backend.environment`). Für Feedback `NTFY_*` setzen.

## Deployment

**Vor dem Deploy:** `npm run check` lokal ausführen.

Produktions-Update auf den Server (konfigurierbar via Umgebungsvariablen):

```bash
./scripts/update-prod.sh
```

Standard-Ziel: `root@10.0.0.25:/opt/kapteins-daagbok` — per `REMOTE_HOST`, `REMOTE_USER`, `REMOTE_DIR` überschreibbar.

Auf dem Server müssen `.env` u. a. `POSTGRES_PASSWORD`, `RP_ID`, `ORIGIN` (`https://kapteins-daagbok.eu`), `SESSION_SECRET` (≥ 32 Zeichen), `TRUST_PROXY` (NPM, z. B. `172.16.10.10` oder `1`) und bei Push `VAPID_*` enthalten. Optional `NTFY_*` für Feedback. Nach Schema-Änderungen: `npx prisma db push` im Backend-Container.

Hinter **Nginx Proxy Manager**: [docs/deployment/npm-security.md](docs/deployment/npm-security.md).

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [docs/deployment/npm-security.md](docs/deployment/npm-security.md) | NPM, TLS, `trust proxy`, Security-Header |
| [docs/deployment/predeploy.md](docs/deployment/predeploy.md) | Pre-Deploy-Checks ohne CI |
| [docs/deployment/postgres-password.md](docs/deployment/postgres-password.md) | PostgreSQL-Passwort rotieren / App-Rolle |
| [docs/plausible-events.md](docs/plausible-events.md) | Custom Events für Plausible Analytics |
| [docs/push-notifications-plan.md](docs/push-notifications-plan.md) | Web Push: Architektur, API, Testplan |
| [docs/plan-compass-course-dial.md](docs/plan-compass-course-dial.md) | Kompass-Dial: UX- und Implementierungsplan |
| [docs/marketing/kapteins-daagbok-beta-flyer.pdf](docs/marketing/kapteins-daagbok-beta-flyer.pdf) | Beta-Flyer (DIN A4) zum Ausdrucken — Quelle: `docs/marketing/beta-flyer.html`, neu erzeugen: `cd client && npm run generate:flyer` |
| [.planning/PROJECT.md](.planning/PROJECT.md) | Produktvision und Anforderungen (GSD) |

## Analytics

Die App nutzt [Plausible Analytics](https://plausible.io/) (self-hosted) für anonyme Nutzungsmetriken — ohne Cookies und ohne personenbezogene Daten in Event-Properties. Details und Goal-Namen: [docs/plausible-events.md](docs/plausible-events.md).

## Version

Aktuelle Version: siehe [VERSION](VERSION) (wird im App-Footer und beim Docker-Build eingebunden).

---

© 2026 KnorrLabs/Markus F.J. Busche · [kapteins-daagbok.eu](https://kapteins-daagbok.eu)
