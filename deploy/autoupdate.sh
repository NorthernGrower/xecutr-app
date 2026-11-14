#!/usr/bin/env bash
#
# Auto-update: pull origin/main, rebuild and restart only when something changed.
#
#   bash deploy/autoupdate.sh           # one check — safe to run from cron/timer
#   bash deploy/autoupdate.sh install   # one-time: installs the systemd timer (every 5 min)
#
# Depends on the services clean-install.sh set up (xecutr-frontend, xecutr-proxy).

set -euo pipefail

APP_DIR="${APP_DIR:-/root/xecutr-app}"

log() { printf '[autoupdate] %s\n' "$*"; }

# ---- install: one-time setup of the every-5-minutes timer --------------------
if [ "${1:-}" = "install" ]; then
    [ "$(id -u)" -eq 0 ] || { echo "Run as root (or with sudo)." >&2; exit 1; }
    if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
        cat >/etc/systemd/system/xecutr-autoupdate.service <<UNIT
[Unit]
Description=Xecutr auto-update (pull, rebuild, restart)
[Service]
Type=oneshot
ExecStart=$(command -v bash) ${APP_DIR}/deploy/autoupdate.sh
UNIT
        cat >/etc/systemd/system/xecutr-autoupdate.timer <<UNIT
[Unit]
Description=Check GitHub for new xecutr-app commits every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
        systemctl daemon-reload
        systemctl enable --now xecutr-autoupdate.timer
        log "Timer installed: the server now pulls from GitHub every 5 minutes."
    else
        echo '* * * * * root bash ${APP_DIR}/deploy/autoupdate.sh >> /var/log/xecutr-autoupdate.log 2>&1' \
            >/etc/cron.d/xecutr-autoupdate
        log "No systemd — installed /etc/cron.d/xecutr-autoupdate instead (check every minute)."
    fi
    exit 0
fi

cd "${APP_DIR}"

before="$(git rev-parse HEAD)"
git fetch origin main --depth 50 >/dev/null 2>&1 || git fetch origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
    exit 0  # nothing new
fi

# Hard-sync to origin: a server checkout should never argue with the repo.
git reset --hard origin/main
changed="$(git diff --name-only "${before}" HEAD)"
log "Updated ${before:0:7} -> $(git rev-parse --short HEAD)"

# Reinstall dependencies only when the lockfile moved.
if printf '%s\n' "${changed}" | grep -q '^package-lock.json$'; then
    log "Lockfile changed — running npm ci"
    npm ci --no-audit --no-fund
fi

# Rebuild whenever source changed at all (dist/ is not tracked).
if printf '%s\n' "${changed}" | grep -Eq '^(src|public|package\.json|vite\.config\.js|tailwind\.config\.js|index\.css)'; then
    log "Rebuilding"
    # The app's Base44 identity is baked in at build time (public client-side values).
    VITE_BASE44_APP_ID="${VITE_BASE44_APP_ID:-6af5fbfbeb8a5b4111b2a97d}" \
    VITE_BASE44_FUNCTIONS_VERSION="${VITE_BASE44_FUNCTIONS_VERSION:-prod}" \
    npm run build
fi

# Restart a service only when its inputs changed.
if printf '%s\n' "${changed}" | grep -Eq '^(src|public|package\.json|vite\.config\.js)'; then
    log "Restarting xecutr-frontend"
    systemctl restart xecutr-frontend
fi
if printf '%s\n' "${changed}" | grep -q '^deploy/serve'; then
    log "Restarting xecutr-proxy"
    systemctl restart xecutr-proxy
fi

# The media service (torch + diffusers) is its own image, so a change to it is a
# rebuild of that one container; its model cache lives in a volume, not the image.
if printf '%s\n' "${changed}" | grep -q '^deploy/media/'; then
    log "Rebuilding the media image"
    docker build -f deploy/media/Dockerfile -t xecutr-media . \
        && docker rm -f xecutr-media >/dev/null 2>&1 || true
    [ -n "$(docker images -q xecutr-media)" ] && docker run -d --name xecutr-media \
        --restart unless-stopped --network host \
        -v xecutr-media-data:/data \
        -e PORT=8090 \
        -e MEDIA_IMAGE_MODEL="${MEDIA_IMAGE_MODEL:-stabilityai/sd-turbo}" \
        -e MEDIA_VIDEO_MODEL="${MEDIA_VIDEO_MODEL:-animatediff}" \
        xecutr-media >/dev/null
    log "Media container rebuilt and restarted."
fi

# The gateway container is built from this repo; rebuild and restart it when
# its files change. The container fronts Ollama and owns public port 8080.
if printf '%s\n' "${changed}" | grep -q '^deploy/gateway/'; then
    log "Rebuilding the gateway image"
    docker build -f deploy/gateway/Dockerfile -t xecutr . \
        && docker rm -f xecutr >/dev/null 2>&1 || true
    [ -n "$(docker images -q xecutr)" ] && docker run -d --name xecutr \
        --restart unless-stopped --network host \
        -e PORT=8080 \
        -e FRONTEND_URL="${FRONTEND_URL:-https://xecutr.cloud}" \
        -e FRONTEND_ORIGIN="http://127.0.0.1:8082" \
        -e OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434/v1}" \
        -e OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}" \
        -e MEDIA_URL="${MEDIA_URL:-http://127.0.0.1:8090}" \
        xecutr >/dev/null
    log "Gateway container rebuilt and restarted."
fi

log "Up to date."
