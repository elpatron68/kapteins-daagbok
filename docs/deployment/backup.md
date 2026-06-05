# Server-Backup (Produktion)

Automatische und manuelle Sicherung von PostgreSQL, `.env`, `docker-compose.yml` und App-Code (Git-Archiv) auf der Prod-VM.

**Staging:** Kein automatisches Backup — Daten sind bewusst wegwerfbar. Deploy via `update-remotes.sh -dest stage` legt kein Backup an.

## Was wird gesichert?

| Inhalt | Beschreibung |
|--------|--------------|
| `database.sql.gz` | `pg_dump` aus dem laufenden DB-Container |
| `.env` | Server-Secrets (Sessions, DB-Passwort, VAPID, …) |
| `docker-compose.yml` | Aktive Compose-Datei |
| `app.tar.gz` | `git archive HEAD` — Code-Snapshot |
| `manifest.json` | Timestamp, Git-Tag, SHA, Grund (`cron` / `pre-deploy` / `manual`) |

Backups liegen in `/var/backups/kapteins-daagbok/` (mode 700, root-only). Es werden **maximal 5** Archive aufbewahrt.

## Einmalige Einrichtung (Prod-Server)

```bash
ssh root@10.0.0.25
mkdir -p /var/backups/kapteins-daagbok
chmod 700 /var/backups/kapteins-daagbok
cd /opt/kapteins-daagbok
git pull
chmod +x scripts/backup.sh scripts/restore-backup.sh
./scripts/backup.sh --reason manual
```

## Manuell sichern

```bash
cd /opt/kapteins-daagbok
./scripts/backup.sh
./scripts/backup.sh --reason manual --dry-run   # Vorschau ohne Schreiben
```

## Crontab (unbeaufsichtigt)

Beispiel: [`scripts/crontab.prod.example`](../../scripts/crontab.prod.example)

```bash
crontab -e
# Zeile einfügen:
0 3 * * * cd /opt/kapteins-daagbok && ./scripts/backup.sh --reason cron >> /var/log/kapteins-backup.log 2>&1
```

## Pre-Deploy-Backup

Bei `./scripts/update-remotes.sh -dest prod` wird **vor** dem Git-Sync auf dem Server automatisch ein Backup mit Tag `v{VERSION}-predeploy` erstellt. Schlägt das Backup fehl, wird das Deploy abgebrochen.

Staging-Deploys (`-dest stage`) erstellen **kein** Backup.

## Wiederherstellen

Verfügbare Backups anzeigen:

```bash
./scripts/restore-backup.sh --list
```

Vollständige Wiederherstellung (DB + `.env`, optional Git-Tag checkout):

```bash
./scripts/restore-backup.sh --restore /var/backups/kapteins-daagbok/kapteins-daagbok_YYYYMMDD-HHMMSS_vX.Y.Z.tar.gz
```

Nur Datenbank:

```bash
./scripts/restore-backup.sh --restore PATH --db-only
```

Nur `.env`:

```bash
./scripts/restore-backup.sh --restore PATH --env-only
```

Ohne Rückfragen (Notfall):

```bash
./scripts/restore-backup.sh --restore PATH --full --yes
```

## Vor Passwort-Rotation

Vor [`rotate-postgres-password.sh`](../../scripts/rotate-postgres-password.sh) ein Backup anlegen — siehe auch [postgres-password.md](postgres-password.md):

```bash
./scripts/backup.sh --reason manual
```

## Umgebungsvariablen

| Variable | Default (Prod) |
|----------|----------------|
| `BACKUP_DIR` | `/var/backups/kapteins-daagbok` |
| `COMPOSE_FILE` | `docker-compose.yml` |
| `DB_CONTAINER` | `daagbox-prod-db` |
| `RETENTION` | `5` |
