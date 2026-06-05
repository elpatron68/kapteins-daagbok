# Staging-Umgebung

Staging läuft auf **VM3** (`10.0.0.27`) unter **https://staging.kapteins-daagbok.eu/** — hinter Nginx Proxy Manager wie Produktion.

## Unterschiede zu Produktion

| | Staging | Produktion |
|---|---------|------------|
| Host | `10.0.0.27` | `10.0.0.25` |
| Verzeichnis | `/opt/kapteins-daagbok-staging` | `/opt/kapteins-daagbok` |
| Compose | `docker-compose.staging.yml` | `docker-compose.yml` |
| Deploy-Skript | `./scripts/update-prod.sh -dest stage` | `./scripts/update-prod.sh -dest prod` |
| Release-Tag | nein | ja (`v*`) |
| Datenbank-Volume | `daagbox-staging-pgdata` | `daagbox-prod-pgdata` |

Staging ist **vollständig isoliert**: eigene DB, Session-Secrets, Passkeys (`RP_ID=staging.kapteins-daagbok.eu`) und optional eigene VAPID-/Ntfy-Konfiguration.

## Erstinstallation (VM3)

```bash
ssh root@10.0.0.27

git clone https://gitea.elpatron.me/elpatron/kapteins-daagbok.git /opt/kapteins-daagbok-staging
cd /opt/kapteins-daagbok-staging
git checkout master

# .env anlegen — Secrets neu generieren, nicht von Prod kopieren
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -base64 48   # SESSION_SECRET

nano .env
docker compose -f docker-compose.staging.yml up -d --build
```

### `.env` (Staging)

```env
ORIGIN=https://staging.kapteins-daagbok.eu
RP_ID=staging.kapteins-daagbok.eu
TRUST_PROXY=1

POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generiert>
POSTGRES_DB=daagbox_staging

SESSION_SECRET=<generiert>

NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=kapteins-daagbok-staging-feedback
```

Optional: `VAPID_*`, `OpenWeatherMapAPIKey`, `OpenRouterAPIKey`, `ADMIN_USER_IDS`, `NTFY_TOKEN`.

## Deploy vom Entwicklungsrechner

Führt `npm run check` aus, dann SSH-Deploy ohne Release-Tag:

```bash
./scripts/update-prod.sh -dest stage
```

Konfiguration via Umgebungsvariablen:

```bash
REMOTE_HOST=10.0.0.27 \
REMOTE_DIR=/opt/kapteins-daagbok-staging \
DEPLOY_BRANCH=master \
./scripts/update-prod.sh -dest stage
```

Notfall ohne Checks: `SKIP_PREDEPLOY_CHECK=1 ./scripts/update-prod.sh -dest stage`

## NPM (VM1)

| Einstellung | Wert |
|-------------|------|
| Domain | `staging.kapteins-daagbok.eu` |
| Forward Hostname / IP | `10.0.0.27` |
| Forward Port | `80` |
| SSL | Let's Encrypt |

Empfohlen: Custom Header `X-Robots-Tag: noindex, nofollow` (Staging nicht indexieren).

Details zu Proxy-Headern und Security: [npm-security.md](npm-security.md).

## Nach Deploy prüfen

1. https://staging.kapteins-daagbok.eu/api/health — `status: ok`
2. Neuen Test-Account registrieren (Prod-Passkeys funktionieren nicht auf Staging)
3. Passkey Login
4. Cookie `daagbok_session`: `Secure`, `HttpOnly`, `SameSite=Lax`

## Daten zurücksetzen

Staging-Daten sind wegwerfbar:

```bash
cd /opt/kapteins-daagbok-staging
docker compose -f docker-compose.staging.yml down
docker volume rm daagbox-staging-pgdata
docker compose -f docker-compose.staging.yml up -d
```
