#!/usr/bin/env bash
set -euo pipefail

APP="${APP:-/var/www/vdf.by}"
REMOTE="${BACKUP_REMOTE:-gdrive:vdf-backups}"
SENTINEL="$APP/var/panic-remote-wipe"
LOG="$APP/var/panic-remote-wipe.log"

[ -f "$SENTINEL" ] || exit 0
command -v rclone >/dev/null 2>&1 || exit 0
rclone listremotes 2>/dev/null | grep -q "^${REMOTE%%:*}:$" || { rm -f "$SENTINEL"; exit 0; }

echo "$(date '+%F %T') протокол AID: удаление копий базы в $REMOTE" >> "$LOG"
rclone delete "$REMOTE" --include "shop-*.db.gz" --max-depth 1 --drive-use-trash=false --quiet >> "$LOG" 2>&1 || true
rclone delete "$REMOTE" --include "shop-*.db" --max-depth 1 --drive-use-trash=false --quiet >> "$LOG" 2>&1 || true
rclone cleanup "$REMOTE" --quiet >> "$LOG" 2>&1 || true
rm -f "$SENTINEL"
echo "$(date '+%F %T') протокол AID: готово" >> "$LOG"
