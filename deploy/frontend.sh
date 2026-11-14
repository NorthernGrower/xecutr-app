#!/usr/bin/env bash
#
# Put the Base44 front-end (NorthernGrower/xecutr-app) in front of the Xecutr
# API, so the server's address shows the app instead of the built-in UI.
#
# One command, on a fresh or repeat run:
#
#   curl -fsSL https://raw.githubusercontent.com/NorthernGrower/xecutr-app/main/deploy/frontend.sh | bash
#
# Idempotent: re-run it after the front-end changes and it pulls, rebuilds,
# restarts, and re-wires everything.
#
# Optional environment:
#   APP_DIR=/root/xecutr-app     where the front-end repo lives
#   FRONT_PORT=8082              the port the front-end runs on (loopback only)
#   FORGE_OS_CORS_ORIGIN=...     passed through to the API container
#   FORGE_OS_API_TOKEN=...       passed through to the API container
#
# If something went wrong on the server, run the same command with `diag`
# appended and paste the output — nothing is changed, it only reports.

set -euo pipefail

# Self-logging: everything this script prints also lands in one file, so a
# failure is always one paste away from a diagnosis.
exec > >(tee /root/xecutr-install.log) 2>&1

APP_DIR="${APP_DIR:-/root/xecutr-app}"
FRONT_PORT="${FRONT_PORT:-8082}"
# The live Base44 deployment the server's address mirrors. Override it (e.g.
# FRONTEND_URL= bash deploy/frontend.sh) to fall back to the local build.
FRONTEND_URL="${FRONTEND_URL:-https://xecutr.cloud}"
APP_REPO="https://github.com/NorthernGrower/xecutr-app.git"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n!! %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run this as root (or with sudo)."

# --------------------------------------------------------------------- diagnose
# Run with `diag` as the first argument to only print the state of things —
# nothing is built, restarted or changed:
#
#   curl -fsSL https://raw.githubusercontent.com/NorthernGrower/xecutr-app/main/deploy/frontend.sh | bash -s -- diag
#
if [ "${1:-}" = "diag" ]; then
  echo "== diag =="
  echo "node: $(node -v 2>&1)  npm: $(npm -v 2>&1)  docker: $(docker -v 2>&1)"
  echo
  echo "-- front-end app dir ($APP_DIR) --"
  git -C "$APP_DIR" log --oneline -3 2>&1 || echo "  (missing)"
  echo
  echo "-- front-end log (/root/front.log, last 20 lines) --"
  tail -n 20 /root/front.log 2>/dev/null || echo "  (no log yet)"
  echo
  echo "-- install log (/root/xecutr-install.log, last 20 lines) --"
  tail -n 20 /root/xecutr-install.log 2>/dev/null || echo "  (no log yet)"
  echo
  echo "-- containers --"
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>&1 || true
  echo
  echo "-- ports --"
  for url in http://127.0.0.1:8080/ http://127.0.0.1:8080/api/health "http://127.0.0.1:$FRONT_PORT/"; do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 'no answer')"
    echo "  $url -> $code"
  done
  echo
  echo "== end diag =="
  exit 0
fi

# ---------------------------------------------------------------- Node.js 22
need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
else
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 20 ] || need_node=1
fi

if [ "$need_node" -eq 1 ]; then
  log "Installing Node.js 22 (the front-end needs 20+)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
log "Node $(node -v), npm $(npm -v)"

# ------------------------------------------------------------- source of truth
if [ -d "$APP_DIR/.git" ]; then
  log "Updating $APP_DIR"
  git -C "$APP_DIR" pull --ff-only || log "Could not fast-forward; building what is there."
else
  log "Cloning $APP_REPO"
  rm -rf "$APP_DIR"
  git clone --depth 1 "$APP_REPO" "$APP_DIR" \
    || fail "Cloning failed. Is the repo public? Check: https://github.com/NorthernGrower/xecutr-app"
fi

# ------------------------------------------------------------------ the gateway
# The model gateway is built from THIS repo (deploy/gateway/) — no second repo
# is involved any more. It fronts Ollama and forwards app traffic to the build.
GATEWAY_DIR="${APP_DIR}/deploy/gateway"
log "Building the gateway image from ${GATEWAY_DIR}"
docker build -f "${GATEWAY_DIR}/Dockerfile" -t xecutr "${APP_DIR}" \
  || fail "Gateway image build failed."
if ! docker images xecutr --format '{{.Repository}}' | grep -q '^xecutr$'; then
  fail "The gateway image was not built. Is Docker installed and running?"
fi

# --------------------------------------------------------------------- build
cd "$APP_DIR"
log "Installing dependencies (first run takes a few minutes)"
npm ci --no-audit --no-fund || { log "npm ci failed — trying npm install"; npm install --no-audit --no-fund; }
log "Building the front-end"
# The app's Base44 identity is baked in at build time (public client-side values —
# they ship in every visitor's bundle, see src/lib/app-params.js).
VITE_BASE44_APP_ID="${VITE_BASE44_APP_ID:-6af5fbfbeb8a5b4111b2a97d}" \
VITE_BASE44_FUNCTIONS_VERSION="${VITE_BASE44_FUNCTIONS_VERSION:-prod}" \
npm run build || fail "The build failed. Paste the lines above this message and I'll fix the cause."

# -------------------------------------------------------------------- start
# The app is a TanStack Start SSR build. Depending on how it was exported it may
# serve from `vite preview`, from the dev server, or only inside the Cloudflare
# runtime via wrangler — so try each in turn and keep the first that answers.
pkill -f "vite preview" >/dev/null 2>&1 || true
pkill -f "wrangler dev" >/dev/null 2>&1 || true
pkill -f "vite dev" >/dev/null 2>&1 || true
sleep 1

RUNNER=/root/xecutr-frontend.sh
: > "$RUNNER"
chmod +x "$RUNNER"

try_start() {
  local label="$1" wait="$2" command="$3"
  log "Trying $label"
  cd "$APP_DIR"
  pkill -f "vite preview" >/dev/null 2>&1 || true
  pkill -f "wrangler dev" >/dev/null 2>&1 || true
  pkill -f "vite dev" >/dev/null 2>&1 || true
  sleep 1

  nohup bash -lc "$command" > /root/front.log 2>&1 &
  for _ in $(seq 1 "$wait"); do
    sleep 1
    if curl -fsS -o /dev/null "http://127.0.0.1:$FRONT_PORT/" 2>/dev/null; then
      printf '#!/usr/bin/env bash\ncd %q\nexec %s\n' "$APP_DIR" "$command" > "$RUNNER"
      chmod +x "$RUNNER"
      log "$label is answering"
      return 0
    fi
  done
  return 1
}

if ! try_start "vite preview" 25 "npm run preview -- --port $FRONT_PORT --host 127.0.0.1"; then
  if ! try_start "vite dev" 30 "npm run dev -- --port $FRONT_PORT --host 127.0.0.1"; then
    try_start "wrangler dev" 40 "npx wrangler dev --port $FRONT_PORT --ip 127.0.0.1" \
      || fail "The front-end would not start. Paste the last 30 lines of /root/front.log."
  fi
fi

log "Front-end is answering on http://127.0.0.1:$FRONT_PORT"

# Keep it alive across reboots.
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  log "Installing a systemd unit so the front-end survives reboots"
  cat > /etc/systemd/system/xecutr-frontend.service <<UNIT
[Unit]
Description=Xecutr front-end (Base44 app)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$RUNNER
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable xecutr-frontend >/dev/null 2>&1 || true
  pkill -f "vite preview" >/dev/null 2>&1 || true
  pkill -f "wrangler dev" >/dev/null 2>&1 || true
  pkill -f "vite dev" >/dev/null 2>&1 || true
  sleep 1
  systemctl restart xecutr-frontend
  sleep 8
  if curl -fsS -o /dev/null "http://127.0.0.1:$FRONT_PORT/" 2>/dev/null; then
    log "Front-end is running under systemd"
  else
    fail "The front-end did not come back up under systemd. Paste the last 30 lines of /root/front.log, or run the script with 'diag'."
  fi
fi

# ---------------------------------------------------------- start the media box
# Image and clip generation runs in its own container so torch and diffusers
# never touch the host, and its model cache survives a rebuild.
log "Building the media service (image + clip generation, CPU)"
docker build -f deploy/media/Dockerfile -t xecutr-media . > /root/xecutr-media-build.log 2>&1 \
  || fail "The media image would not build. Paste the last 30 lines of /root/xecutr-media-build.log."
docker stop xecutr-media >/dev/null 2>&1 || true
docker rm xecutr-media >/dev/null 2>&1 || true
docker run -d --name xecutr-media --restart unless-stopped --network host \
  -v xecutr-media-data:/data \
  -e PORT=8090 \
  -e MEDIA_IMAGE_MODEL="${MEDIA_IMAGE_MODEL:-stabilityai/sd-turbo}" \
  -e MEDIA_VIDEO_MODEL="${MEDIA_VIDEO_MODEL:-animatediff}" \
  xecutr-media >/dev/null

# ------------------------------------------------------------ start the gateway
# The gateway image was built from this repo above — nothing to clone or
# rebuild from a second repo. Run it on public port 8080 with Ollama behind it.
log "Restarting the gateway with the front-end behind it"
docker stop xecutr >/dev/null 2>&1 || true
docker rm xecutr >/dev/null 2>&1 || true
docker run -d --name xecutr --restart unless-stopped --network host \
  -e PORT=8080 \
  -e FRONTEND_URL="$FRONTEND_URL" \
  -e FRONTEND_ORIGIN="http://127.0.0.1:$FRONT_PORT" \
  -e OLLAMA_BASE_URL=http://127.0.0.1:11434/v1 \
  -e OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5-coder:7b}" \
  -e MEDIA_URL="http://127.0.0.1:8090" \
  ${FORGE_OS_CORS_ORIGIN:+-e FORGE_OS_CORS_ORIGIN="$FORGE_OS_CORS_ORIGIN"} \
  ${FORGE_OS_API_TOKEN:+-e FORGE_OS_API_TOKEN="$FORGE_OS_API_TOKEN"} \
  xecutr >/dev/null

sleep 3

# ------------------------------------------------------------------- verify
log "Checking"
curl -fsS http://127.0.0.1:8080/api/health || echo "  (health check failed)"
echo
curl -fsS -o /dev/null -w "  http://127.0.0.1:8080/  -> HTTP %{http_code}\n" http://127.0.0.1:8080/ || true
curl -fsS -o /dev/null -w "  http://127.0.0.1:8080/api/providers -> HTTP %{http_code}\n" http://127.0.0.1:8080/api/providers || true

cat <<DONE

==> Done.
    Open http://<your-server-ip>:8080 — it shows the live app
    ($FRONTEND_URL), with /api/chat and the other gateway endpoints still
    answered here, backed by your Ollama model.

    Re-run this same command any time the front-end or the API changes.
    Logs: /root/front.log (front-end), docker logs xecutr (API).
DONE
