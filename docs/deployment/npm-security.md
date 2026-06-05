# Deployment: Nginx Proxy Manager & Security (Sprint 1)

Kapteins Daagbok läuft öffentlich unter **https://kapteins-daagbok.eu/** (Produktion) und **https://staging.kapteins-daagbok.eu/** (Staging) hinter **Nginx Proxy Manager** (NPM, z. B. `172.16.10.10`) mit Upstream auf die App-VMs (`10.0.0.25` Prod, `10.0.0.27` Staging).

## NPM Proxy Host

| Einstellung | Wert |
|-------------|------|
| Domain | `kapteins-daagbok.eu` / `staging.kapteins-daagbok.eu` |
| Scheme | `https` |
| Forward Hostname / IP | `10.0.0.25` (Prod) / `10.0.0.27` (Staging) |
| Forward Port | `80` (Frontend-Nginx) |
| Websockets | an, falls genutzt |
| Block Common Exploits | an |
| SSL | Let's Encrypt o. ä. |

### Custom Nginx (Advanced) — empfohlen

NPM setzt `X-Forwarded-*` in der Regel automatisch. Falls nicht, im Proxy-Host unter **Advanced**:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
```

## Backend-Umgebung (`.env` auf dem Server)

```env
ORIGIN=https://kapteins-daagbok.eu
RP_ID=kapteins-daagbok.eu
SESSION_SECRET=<min. 32 Zeichen, openssl rand -base64 48>
# Docker Compose: Frontend-Nginx ist der direkte Proxy zum Backend → 1 Hop
TRUST_PROXY=1
# Nur bei direktem Backend-Zugriff ohne Frontend-Nginx: NPM-IP, z. B. TRUST_PROXY=172.16.10.10
```

`ORIGIN` muss **exakt** der Browser-URL entsprechen (ohne trailing slash).

## Security-Header

- **HSTS, CSP (optional restriktiver):** können in NPM unter „Custom Headers“ oder im Advanced-Block gesetzt werden.
- **Basis-Header** für statische Dateien setzt [`client/nginx.conf`](../../client/nginx.conf) (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP inkl. Plausible).

### Plausible Analytics

Script-Host: `https://plausible.elpatron.me` — in CSP als `script-src` und `connect-src` erlaubt. Gemessene Site: `data-domain="kapteins-daagbok.eu"`.

Optional später: `analytics.kapteins-daagbok.eu` als Alias auf dieselbe Plausible-Instanz.

## Nach Deploy prüfen

1. https://kapteins-daagbok.eu/api/health — `status: ok`
2. Passkey Login / Registrierung
3. DevTools → Application → Cookie `daagbok_session`: `Secure`, `HttpOnly`, `SameSite=Lax`
4. Response-Header auf `index.html`: CSP, `X-Frame-Options`
5. Zwei Geräte hinter NAT: unabhängige Rate-Limits (nicht alle als eine IP)

## Docker Compose

Keine Default-Passwörter in Produktion: starkes `POSTGRES_PASSWORD` (siehe [postgres-password.md](postgres-password.md)) und `SESSION_SECRET` in `.env` setzen (siehe [`.env.example`](../../.env.example)).
