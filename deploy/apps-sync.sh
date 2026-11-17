#!/usr/bin/env bash
# Keeps the checkouts under /srv/xecutr/apps up to date with their GitHub
# repositories. Each folder is its own git clone, away from anything the app
# serves or mirrors, so the local model can edit code, push, and the server can
# pull the result on a timer.
#
#   /root/xecutr-app/deploy/apps-sync.sh          # pull everything
#   APPS_DIR=/srv/xecutr/apps deploy/apps-sync.sh # somewhere else
set -u

APPS_DIR="${APPS_DIR:-/srv/xecutr/apps}"
[ -d "$APPS_DIR" ] || exit 0

for dir in "$APPS_DIR"/*/; do
    [ -d "${dir}.git" ] || continue
    name="$(basename "$dir")"
    before="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo "-")"

    out="$(git -C "$dir" pull --ff-only --quiet 2>&1)"
    [ -n "$out" ] && printf '[%s] %s\n' "$name" "$out"

    after="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo "-")"
    if [ "$before" != "$after" ]; then
        printf '[%s] updated %s -> %s\n' "$name" "$before" "$after"
        git -C "$dir" log --oneline "$before..$after" 2>/dev/null | sed "s/^/[$name]   /"
    fi
done
