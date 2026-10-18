# Бэкапы базы

Копию делает `deploy/backup.sh` (на сервере, вне контейнера):

- каждый день в 03:40 — `/etc/cron.d/vdf-backup`, лог в `var/backup.log`;
- перед каждой выкаткой — `deploy/deploy.sh`, шаг «Копия базы перед сборкой».

Сама копия — `scripts/backup.mjs` внутри контейнера: снимок через SQLite
backup API, проверка `integrity_check`, сжатие gzip.

## Где лежат и сколько хранятся

| Что | Где | Сколько |
|---|---|---|
| Ежедневные копии `shop-ГГГГ-ММ-ДД-ЧЧ-ММ.db.gz` | `var/backups/` | 14 последних (`BACKUP_LOCAL_KEEP`) |
| Разовые копии перед ручными правками `shop.before-*.db` | `var/backups/` и `var/` | удаляются старше 7 дней |
| Копии базы в Google Drive | `gdrive:vdf-backups` | удаляются старше 60 дней (`BACKUP_REMOTE_KEEP`) |
| Фото рамок | `var/frame-images/` → `gdrive:vdf-backups/frame-images` | синхронизация, не больше 50 удалений за раз |

Удаление в Google Drive — насовсем, мимо корзины (`--drive-use-trash=false`):
корзина занимает место в тех же 15 ГБ.

Фото рамок хранятся файлами (имя — sha256 содержимого), в базе только имя
файла (`frame_types.frame_image_file`). Поэтому для полного восстановления
нужны и копия базы, и папка `frame-images`.

## Google Drive

rclone на сервере, remote `gdrive`, доступ `drive.file` — rclone видит
только созданные им самим файлы. Если доступ отзовут, переподключить:
`rclone authorize "drive" --drive-scope drive.file` на машине с браузером,
полученный токен — в `rclone config` на сервере.

## Восстановление

```
gunzip -k var/backups/shop-2026-10-19-03-40.db.gz
docker stop vdf
cp var/backups/shop-2026-10-19-03-40.db var/shop.db && rm -f var/shop.db-wal var/shop.db-shm
docker start vdf
```

Из Google Drive: `rclone copy gdrive:vdf-backups/<файл> var/backups/` и
`rclone copy gdrive:vdf-backups/frame-images var/frame-images`.
