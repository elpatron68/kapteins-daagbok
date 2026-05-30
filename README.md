# Kapteins Daagbok

Digitales Yacht-Logbuch als Progressive Web App (PWA) — **kostenlos**, **werbefrei**, offline-fähig, End-to-End-verschlüsselt und mit Passkey-Anmeldung.

**Live:** [kapteins-daagbok.eu](https://kapteins-daagbok.eu)

## Überblick

Kapteins Daagbok richtet sich an private Skipper und Yachtbesitzer, die ihr Bordlogbuch digital führen möchten. Die App speichert Schiffsdaten, Crew-Profile und Reisetage (Törns) in einem Format, das an übliche nautische Logbuch-Vorlagen angelehnt ist.

Alle sensiblen Inhalte werden **clientseitig verschlüsselt** (Web Crypto API). Der Server sieht nur ciphertext — eine Zero-Knowledge-Architektur. Daten liegen zusätzlich lokal in IndexedDB (Dexie.js) und synchronisieren im Hintergrund, sodass die App **auch offline** auf See nutzbar ist.

## Funktionen

- **Passkey-Authentifizierung** (WebAuthn) mit optionaler Recovery-Phrase und lokalem PIN-Fallback
- **Mehrere Logbücher** pro Benutzerkonto — eigene Logbücher und per Einladung geteilte Logbücher (Crew-Zugang) klar getrennt
- **Reisetage** mit Hafen, Wetter, Tankständen, Ereignissen und Tagesnummer
- **GPS-Tracks** (GPX/KML/GeoJSON-Upload, Karte, Statistiken)
- **Foto-Anhänge** pro Reisetag
- **Passkey-Signaturen** für Skipper und Crew (hybride elektronische Signatur)
- **Schiffsdaten** und **Crew-Profile** (Skipper + Mitglieder)
- **Statistik-Dashboard** — Strecken, Verbrauch, Segel/Motor, Hafenkette (pro Logbuch oder accountweit)
- **Kollaboration** — Crew per Einladungslink einladen (Schreib- oder Lesezugriff)
- **Push-Benachrichtigungen** (optional) — Logbuch-Eigner per Web Push informieren, wenn Crew Änderungen synchronisiert (ohne Klartext-Inhalte; Opt-in in den Einstellungen)
- **Read-only-Freigabe** — öffentlicher Lese-Link für Dritte
- **Export** — PDF pro Reisetag, CSV-Download/-Teilen
- **Backup & Wiederherstellung** — vollständiges verschlüsseltes Logbuch-Backup (Einträge, Fotos, GPS, Crew, Schiff) als `.daagbok.json`; Restore auf gleichem oder neuem Account
- **PWA** — installierbar auf iOS/Android, Offline-Modus, Update-Hinweise
- **Mehrsprachig** — Deutsch und Englisch
- **Demo-Logbuch & Onboarding-Tour** für neue Nutzer

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
| Auth | WebAuthn (Passkeys) via `@simplewebauthn` |
| Krypto | Web Crypto API (AES-GCM), BIP39 Recovery |
| Push (optional) | Web Push (VAPID), Custom Service Worker (`injectManifest`) |

### Rollen & Zugriff

| Rolle | Bedeutung |
|-------|-----------|
| **Owner** | Logbuch angelegt; voller Zugriff, Einladungen, Backup, Löschen; optional Push bei Crew-Änderungen |
| **Collaborator (WRITE)** | Per Einladung; Einträge bearbeiten und als Crew signieren |
| **Collaborator (READ)** | Nur Lesen (z. B. öffentlicher Share-Link) |

Skipper- und Crew-Profile im Logbuch sind **Inhaltsdaten** (verschlüsselt), nicht an den Account gebunden. Ein Account kann gleichzeitig Owner eines eigenen und Collaborator in fremden Logbüchern sein.

## Backup & Wiederherstellung

Nur der **Logbuch-Eigner** kann unter **Einstellungen → Backup & Wiederherstellung** ein vollständiges Backup erstellen:

1. Backup-Passphrase wählen (min. 8 Zeichen, getrennt von der Datei aufbewahren)
2. Download als `.daagbok.json` — enthält alle verschlüsselten Payloads inkl. **Fotos** und GPS-Tracks
3. **Wiederherstellen** in einem beliebigen Account (nach Registrierung/Login): Datei + Passphrase

Vor dem Löschen eines Logbuchs weist die App auf diese Funktion hin. Crew-Einladungen und Passkey-Signaturen werden nicht mitübertragen — Inhalte bleiben lesbar, Signaturen auf neuem Account ggf. nicht mehr verifizierbar.

## Push-Benachrichtigungen (optional)

Logbuch-**Eigner** können unter **Einstellungen** Web Push aktivieren. Sobald ein eingeladenes Crewmitglied mit Schreibrechten (`WRITE`) Änderungen synchronisiert, erhält der Owner eine **generische** Benachrichtigung — der Server kennt keine Logbuch-Inhalte (Zero-Knowledge).

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

## Projektstruktur

```
kapteins-daagbok/
├── client/              # React-PWA (Frontend)
│   ├── src/
│   │   ├── components/  # UI-Komponenten
│   │   ├── services/    # Auth, Sync, Krypto, Backup, Push, Analytics, …
│   │   ├── sw.ts        # Service Worker (Precache + Web Push)
│   │   └── i18n/        # DE/EN-Übersetzungen
│   └── Dockerfile       # Nginx-Produktions-Image
├── server/              # Express-API + Prisma
│   ├── src/routes/      # auth, logbooks, sync, collaboration, sign, push
│   ├── src/services/    # z. B. pushNotify (Web Push)
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
- Optional: eigener OpenWeatherMap-API-Key in den Einstellungen (sonst serverseitiger Key aus `.env`)
- Optional: VAPID-Schlüssel für Web Push (siehe Abschnitt Push-Benachrichtigungen)

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

Im `server/`-Verzeichnis eine `.env` mit `DATABASE_URL` anlegen — oder den Key in der **Projekt-`.env`** (`OpenWeatherMapAPIKey=...`); das Backend lädt beide Dateien.

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/daagbox?schema=public"
OpenWeatherMapAPIKey=          # Fallback für Wetter-Abruf, wenn Nutzer keinen eigenen Key hat
RP_ID=localhost
ORIGIN=http://localhost:5173
# Optional — Web Push (npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@kapteins-daagbok.eu
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

Umgebungsvariablen in `.env` setzen — mindestens `RP_ID` und `ORIGIN` für Passkeys. Für Push die VAPID-Variablen an den **Backend**-Container durchreichen (z. B. in `docker-compose.yml` unter `backend.environment` ergänzen).

## Deployment

Produktions-Update auf den Server (konfigurierbar via Umgebungsvariablen):

```bash
./scripts/update-prod.sh
```

Standard-Ziel: `root@10.0.0.25:/opt/kapteins-daagbok` — per `REMOTE_HOST`, `REMOTE_USER`, `REMOTE_DIR` überschreibbar.

Auf dem Server müssen `server/.env` (oder gleichwertige Umgebung) u. a. `DATABASE_URL`, `RP_ID`, `ORIGIN` und bei Push `VAPID_*` enthalten. Nach Schema-Änderungen: `npx prisma db push` im Backend-Container.

## Dokumentation

| Dokument | Inhalt |
|----------|--------|
| [docs/plausible-events.md](docs/plausible-events.md) | Custom Events für Plausible Analytics |
| [docs/push-notifications-plan.md](docs/push-notifications-plan.md) | Web Push: Architektur, API, Testplan |
| [.planning/PROJECT.md](.planning/PROJECT.md) | Produktvision und Anforderungen (GSD) |

## Analytics

Die App nutzt [Plausible Analytics](https://plausible.io/) (self-hosted) für anonyme Nutzungsmetriken — ohne Cookies und ohne personenbezogene Daten in Event-Properties. Details und Goal-Namen: [docs/plausible-events.md](docs/plausible-events.md).

## Version

Aktuelle Version: siehe [VERSION](VERSION) (wird im App-Footer und beim Docker-Build eingebunden).

---

© 2026 KnorrLabs/Markus F.J. Busche · [kapteins-daagbok.eu](https://kapteins-daagbok.eu)
