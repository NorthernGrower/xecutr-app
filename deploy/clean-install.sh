#!/usr/bin/env bash
#
# Clean reinstall of the front-end app on the VPS, without the gateway repo.
#
# Use this when deploy/frontend.sh is not what you want (its gateway step needs
# the private NorthernGrower/xecutr repo) and you just want the app running:
#
#   ssh root@<server-ip>
#   curl -fsSL https://raw.githubusercontent.com/NorthernGrower/xecutr-app/main/deploy/clean-install.sh | bash
#
# What it does:
#   1. Stops and deletes everything a previous deploy put on the server.
#      Ollama and its models are NOT touched.
#   2. Clones this repo fresh from GitHub and builds it.
#   3. Serves it on port 8080 (public) via deploy/serve.js, under systemd so it
#      survives reboots.
#
# The app talks to Base44's backend. To put the local Ollama model behind
# /api/chat again, that is what the gateway step of deploy/frontend.sh does —
# it needs read access to the private repo (make it public, or clone it with a
# token into /root/xecutr first).

set -euo pipefail

APP_DIR="/root/xecutr-app"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n!! %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run this as root (or with sudo)."

log "1/4 Stopping and removing any old deploy (Ollama and its models stay)"
systemctl disable --now xecutr-frontend 2>/dev/null || true
rm -f /etc/systemd/system/xecutr-frontend.service /root/xecutr-frontend.sh
docker rm -f xecutr 2>/dev/null || true
pkill -f 'vite preview' 2>/dev/null || true
pkill -f 'wrangler dev' 2>/dev/null || true
pkill -f 'vite dev' 2>/dev/null || true
rm -rf /xecutr-app /root/xecutr /root/xecutr-app /root/front.log /root/xecutr-install.log
systemctl daemon-reload

log "2/4 Cloning the repo fresh and building it"
rm -rf "${APP_DIR:?}"
git clone https://github.com/NorthernGrower/xecutr-app.git "${APP_DIR}" \
  || fail "Cloning failed. Check: https://github.com/NorthernGrower/xecutr-app"
cd "${APP_DIR}"
npm ci --no-audit --no-fund || { log "npm ci failed — trying npm install"; npm install --no-audit --no-fund; }
npm run build || fail "The build failed. Paste the lines above this message and I'll fix the cause."

log "3/4 Installing the two services (app + public proxy, kept alive across reboots)"
cat >/etc/systemd/system/xecutr-frontend.service <<UNIT
[Unit]
Description=Xecutr app
After=network.target
[Service]
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/npm run preview -- --port 8082 --host 127.0.0.1
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
cat >/etc/systemd/system/xecutr-proxy.service <<UNIT
[Unit]
Description=Xecutr public proxy
After=network.target
[Service]
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node deploy/serve.js
Environment=PORT=8080
Environment=FRONT_ORIGIN=http://127.0.0.1:8082
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now xecutr-frontend xecutr-proxy >/dev/null 2>&1 || true

log "4/4 Checking"
sleep 8
curl -fsS -o /dev/null -w '    app on port 8082:  HTTP %{http_code}\n' http://127.0.0.1:8082/ \
  || fail "The app is not answering on 8082. Paste: journalctl -u xecutr-frontend -n 30 --no-pager"
curl -fsS -o /dev/null -w '    public port 8080:  HTTP %{http_code}\n' http://127.0.0.1:8080/ \
  || fail "The proxy is not answering on 8080. Paste: journalctl -u xecutr-proxy -n 30 --no-pager"

printf '\n==> Done. Open http://<your-server-ip>:8080 in your browser.\n'
