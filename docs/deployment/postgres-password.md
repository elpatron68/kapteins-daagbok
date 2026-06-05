# PostgreSQL absichern (Produktion)

## Ist-Zustand

- Die Datenbank läuft im Container `daagbox-prod-db` **ohne** Host-Port (nur Docker-Netz `db:5432`) — gut.
- Das Passwort wird beim **ersten** Start des Volumes gesetzt; ein späteres Ändern nur von `POSTGRES_PASSWORD` in `.env` **ändert nicht** das laufende Passwort.
- Nach Sprint 1 war auf dem Server noch das Legacy-Passwort `postgres` möglich → per Skript rotieren.

## Empfohlene Schritte

1. **Backup/Snapshot** — auf dem Server: `./scripts/backup.sh --reason manual` (Details: [backup.md](backup.md)).
2. Auf dem Server im Repo:
   ```bash
   cd /opt/kapteins-daagbok
   git pull
   chmod +x scripts/rotate-postgres-password.sh
   ./scripts/rotate-postgres-password.sh
   ```
3. Inhalt von `.postgres-credentials.<timestamp>` in den Passwort-Manager übernehmen, Datei auf dem Server löschen:
   ```bash
   shred -u .postgres-credentials.*   # oder rm nach manuellem Notieren
   ```

### Optional: eigener App-Benutzer (statt `postgres` für Prisma)

```bash
./scripts/rotate-postgres-password.sh --app-user daagbok
```

- **`daagbok`**: Login für Backend/Prisma (kein Superuser)
- **`postgres`**: nur noch Admin (Passwort in `POSTGRES_ADMIN_PASSWORD` in `.env`)

## Lokale Entwicklung

`scripts/start-dev.sh` nutzt weiterhin `postgres/postgres` auf localhost — nur für Dev. Produktion nie dieses Passwort wiederverwenden.

## Verifikation

```bash
docker exec daagbox-prod-backend wget -qO- http://127.0.0.1:5000/api/health
curl -sf https://kapteins-daagbok.eu/api/health
```
