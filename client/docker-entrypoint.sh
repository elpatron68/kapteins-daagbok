#!/bin/sh
set -eu

PLAUSIBLE_ENABLED="${PLAUSIBLE_ENABLED:-true}"
PLAUSIBLE_HOST="${PLAUSIBLE_HOST:-https://plausible.elpatron.me}"
PLAUSIBLE_HOST="${PLAUSIBLE_HOST%/}"

case "$(printf '%s' "$PLAUSIBLE_ENABLED" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    PLAUSIBLE_ENABLED_JSON=true
    PLAUSIBLE_CSP=" ${PLAUSIBLE_HOST}"
    ;;
  *)
    PLAUSIBLE_ENABLED_JSON=false
    PLAUSIBLE_CSP=""
    ;;
esac

ROBOTS_NOINDEX="${ROBOTS_NOINDEX:-false}"
case "$(printf '%s' "$ROBOTS_NOINDEX" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    export ROBOTS_NOINDEX_HEADER='    add_header X-Robots-Tag "noindex, nofollow" always;'
    cat > /usr/share/nginx/html/robots.txt <<'EOF'
User-agent: *
Disallow: /
EOF
    ;;
  *)
    export ROBOTS_NOINDEX_HEADER=''
    ;;
esac

export PLAUSIBLE_CSP
envsubst '${PLAUSIBLE_CSP} ${ROBOTS_NOINDEX_HEADER}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

cat > /usr/share/nginx/html/runtime-config.json <<EOF
{"plausibleEnabled":${PLAUSIBLE_ENABLED_JSON},"plausibleHost":"${PLAUSIBLE_HOST}"}
EOF

exec nginx -g 'daemon off;'
