# Pre-Deploy-Checks (ohne CI)

Vor jedem Update auf **https://kapteins-daagbok.eu/** lokal ausführen:

```bash
npm run check
```

Das Skript [`scripts/predeploy-check.sh`](../../scripts/predeploy-check.sh) führt aus:

1. i18n-Key-Validierung (`validate:i18n`)
2. Client: `test` → `build` (TypeScript via `tsc -b`)
3. Server: `test` → `build`

## Einzelbefehle (Repo-Root)

| Befehl | Inhalt |
|--------|--------|
| `npm run lint` | ESLint (Client) — optional, noch nicht Teil von `check` |
| `npm run test` | Vitest Client + Server |
| `npm run build` | Production-Build beider Pakete |
| `npm run predeploy` | Alias für `npm run check` |

## Server-Tests

Smoke-Tests in `server/src/api.smoke.test.ts` — keine echte Datenbank (Prisma gemockt). Prüfen u. a. Health, 401 ohne Session, öffentliche Collaboration-Validierung.

```bash
cd server && npm test
```

## Nach erfolgreichem Check

[`scripts/update-prod.sh`](../../scripts/update-prod.sh) führt `predeploy-check.sh` **automatisch** aus (nach Release-Vorbereitung, vor dem SSH-Deploy).

```bash
./scripts/update-prod.sh -dest prod
```

Notfall ohne Checks (nur wenn nötig): `SKIP_PREDEPLOY_CHECK=1 ./scripts/update-prod.sh -dest prod`

Manuell auf dem Server: `git pull`, `docker compose build`, `docker compose up -d` (siehe [npm-security.md](npm-security.md)).
