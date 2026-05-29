# Kapteins Daagbok

Digitales Yacht-Logbuch als Progressive Web App (PWA) — offline-fähig, End-to-End-verschlüsselt und mit Passkey-Anmeldung.

**Live:** [kapteins-daagbok.eu](https://kapteins-daagbok.eu)

## Überblick

Kapteins Daagbok richtet sich an private Skipper und Yachtbesitzer, die ihr Bordlogbuch digital führen möchten. Die App speichert Schiffsdaten, Crew-Profile und Reisetage (Törns) in einem Format, das an übliche nautische Logbuch-Vorlagen angelehnt ist.

Alle sensiblen Inhalte werden **clientseitig verschlüsselt** (Web Crypto API). Der Server sieht nur ciphertext — eine Zero-Knowledge-Architektur. Daten liegen zusätzlich lokal in IndexedDB (Dexie.js) und synchronisieren im Hintergrund, sodass die App **auch offline** auf See nutzbar ist.

## Funktionen

- **Passkey-Authentifizierung** (WebAuthn) mit optionaler Recovery-Phrase und lokalem PIN-Fallback
- **Mehrere Logbücher** pro Benutzerkonto
- **Reisetage** mit Hafen, Wetter, Tankständen, Ereignissen und Tagesnummer
- **GPS-Tracks** (GPX/KML/GeoJSON-Upload, Karte, Statistiken)
- **Foto-Anhänge** pro Reisetag
- **Passkey-Signaturen** für Skipper und Crew (hybride elektronische Signatur)
- **Schiffsdaten** und **Crew-Profile** (Skipper + Mitglieder)
- **Kollaboration** — Crew per Einladungslink einladen
- **Read-only-Freigabe** — öffentlicher Lese-Link für Dritte
- **Export** — PDF pro Reisetag, CSV-Download/-Teilen
- **PWA** — installierbar auf iOS/Android, Offline-Modus, Update-Hinweise
- **Mehrsprachig** — Deutsch und Englisch
- **Demo-Logbuch & Onboarding-Tour** für neue Nutzer

## Architektur

```
┌─────────────────┐     HTTPS/API      ┌─────────────────┐
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
| Auth | WebAuthn (Passkeys) via `@simplewebauthn` |
| Krypto | Web Crypto API (AES-GCM), BIP39 Recovery |

## Projektstruktur

```
kapteins-daagbok/
├── client/              # React-PWA (Frontend)
│   ├── src/
│   │   ├── components/  # UI-Komponenten
│   │   ├── services/    # Auth, Sync, Krypto, Analytics, …
│   │   └── i18n/        # DE/EN-Übersetzungen
│   └── Dockerfile       # Nginx-Produktions-Image
├── server/              # Express-API + Prisma
│   ├── src/routes/      # auth, logbooks, sync, collaboration, sign
│   └── prisma/          # Datenbankschema
├── docs/                # Projektdokumentation (z. B. Plausible Events)
├── scripts/             # Dev- und Deploy-Skripte
├── docker-compose.yml   # Produktions-Stack (DB + Backend + Frontend)
└── VERSION              # App-Version (Build & Footer)
```

## Voraussetzungen

- **Node.js** 20+
- **npm**
- **Docker** (für PostgreSQL in der Entwicklung oder den vollständigen Stack)
- Optional: OpenWeatherMap-API-Key (Wetter-Abruf in den Einstellungen)

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

Für lokale Passkeys: `RP_ID=localhost`, `ORIGIN=http://localhost:5173` (bzw. die tatsächliche Frontend-URL).

Im `server/`-Verzeichnis eine `.env` mit `DATABASE_URL` anlegen, z. B.:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/daagbox?schema=public"
RP_ID=localhost
ORIGIN=http://localhost:5173
```

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

## Docker (produktionsnah)

Gesamten Stack lokal bauen und starten:

```bash
./scripts/start-dev-docker.sh
```

Frontend: http://localhost · API: http://localhost/api/health

Umgebungsvariablen für Passkeys in `.env` setzen (`RP_ID`, `ORIGIN`).

## Deployment

Produktions-Update auf den Server (konfigurierbar via Umgebungsvariablen):

```bash
./scripts/update-prod.sh
```

Standard-Ziel: `root@10.0.0.25:/opt/kapteins-daagbok` — per `REMOTE_HOST`, `REMOTE_USER`, `REMOTE_DIR` überschreibbar.

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [docs/plausible-events.md](docs/plausible-events.md) | Custom Events für Plausible Analytics |
| [.planning/PROJECT.md](.planning/PROJECT.md) | Produktvision und Anforderungen (GSD) |

## Analytics

Die App nutzt [Plausible Analytics](https://plausible.io/) (self-hosted) für anonyme Nutzungsmetriken — ohne Cookies und ohne personenbezogene Daten in Event-Properties. Details und Goal-Namen: [docs/plausible-events.md](docs/plausible-events.md).

## Version

Aktuelle Version: siehe [VERSION](VERSION) (wird im App-Footer und beim Docker-Build eingebunden).

---

© 2026 Markus F.J. Busche · [kapteins-daagbok.eu](https://kapteins-daagbok.eu)
