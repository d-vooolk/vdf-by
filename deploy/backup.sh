#!/usr/bin/env bash
set -euo pipefail

APP="${APP:-/var/www/vdf.by}"
REMOTE="${BACKUP_REMOTE:-gdrive:vdf-backups}"
REMOTE_KEEP="${BACKUP_REMOTE_KEEP:-60d}"
LOCAL_KEEP="${BACKUP_LOCAL_KEEP:-14}"
RCLONE_FLAGS=(--quiet --drive-use-trash=false)

if ! docker ps --format '{{.Names}}' | grep -qx vdf; then
  echo "$(date '+%F %T') контейнер vdf не запущен — копия не сделана"
  exit 1
fi

output="$(docker exec vdf node scripts/backup.mjs --keep "$LOCAL_KEEP" --gzip)"
echo "$(date '+%F %T')"
echo "$output"

file="$(printf '%s\n' "$output" | sed -n 's/^Файл: //p' | tail -1)"
remote_name="${REMOTE%%:*}"
if [ -n "$file" ] && command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -qx "${remote_name}:"; then
  rclone copy "$APP/$file" "$REMOTE" "${RCLONE_FLAGS[@]}"
  rclone delete "$REMOTE" --min-age "$REMOTE_KEEP" --include "shop-*.db.gz" --max-depth 1 "${RCLONE_FLAGS[@]}"
  if [ -d "$APP/var/frame-images" ] && [ -n "$(ls -A "$APP/var/frame-images")" ]; then
    rclone sync "$APP/var/frame-images" "$REMOTE/frame-images" --max-delete 50 "${RCLONE_FLAGS[@]}"
  fi
  rclone cleanup "$REMOTE" --quiet 2>/dev/null || true
  echo "Отправлено в $REMOTE, там удалены копии базы старше $REMOTE_KEEP, фото рамок догружены"
else
  echo "Внешнее хранилище не подключено (rclone remote ${remote_name}:) — копия только на сервере"
fi
