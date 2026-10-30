#!/usr/bin/env bash
# ------------------------------------------------------------------
# Деплой на VPS. Запускать на сервере:
#
#   cd /var/www/vdf.by && ./deploy/deploy.sh
#
# Приложение живёт прямо в репозитории и перезапускается на месте. Схемы с
# папкой releases/ и переключением символической ссылки здесь нет: она
# работала, пока сайт был набором файлов, а теперь у него своё состояние —
# база в var/, загруженные фотографии в public/img, кеш пересобранных
# страниц в .next. Гонять их между релизами бессмысленно и опасно.
#
# Цена: перезапуск занимает пару секунд, и в это время сайт не отвечает.
# Если понадобится обновляться без потерянных запросов, поднимается второй
# процесс на соседнем порту и nginx переключается между ними.
# ------------------------------------------------------------------
set -euo pipefail

# Папка приложения — это папка над той, где лежит сам скрипт.
#
# Раньше здесь стоял путь строкой, и это подводило ровно один раз, но
# показательно: скрипт на сервере всегда на одну версию отстаёт от того,
# что он собирается выкатить. Когда папку приложения переименовали, старый
# скрипт упал на первом же cd — то есть до git pull, который принёс бы ему
# исправление. Выбраться можно было только руками.
#
# Определение по своему расположению такой тупик исключает: где скрипт
# лежит, оттуда и работает. После перезапуска из копии (см. ниже) путь
# приходит переменной — копия лежит в /tmp и о папке сайта знать не может.
APP="${DEPLOY_APP:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE="vdf"   # сервис и контейнер в docker-compose.yml
PORT=3011       # тот же, что в command сервиса vdf
PUBLIC_HOST="vdf.by"

# ------------------------------------------------------------------
# Деплой идёт в три шага, и каждый следующий выполняется из копии в /tmp.
#
# Bash читает скрипт не целиком, а порциями, по мере выполнения, и держит
# смещение в байтах. А `git pull` обновляет в том числе и сам deploy.sh.
# Если файл меняется, пока bash его выполняет, интерпретатор продолжает
# читать с прежнего смещения — но уже в новом тексте. В лучшем случае
# текущий запуск идёт по старой версии, в худшем управление попадает на
# середину строки и выполняется обрывок команды. Поэтому pull делается не
# из файла в репозитории, а из копии вне него.
#
# Но и выполнять весь деплой по копии, снятой до pull, нельзя: тогда шаг,
# добавленный в deploy.sh вместе с фичей, на её же выкатке не выполнится —
# так справочник автомобилей и остался на сервере незалитым. Поэтому
# сразу после pull управление передаётся копии уже нового скрипта, и
# дальше деплой идёт по той версии, которая только что приехала.
#
#   без DEPLOY_STAGE  копия себя      → pull
#   pull              git pull, копия нового скрипта → run
#   run               сборка, перезапуск, проверки
# ------------------------------------------------------------------
if [ -z "${DEPLOY_STAGE:-}" ]; then
  copy="$(mktemp /tmp/vdf-deploy.XXXXXX.sh)"
  cat "${BASH_SOURCE[0]}" > "$copy"
  DEPLOY_STAGE=pull DEPLOY_APP="$APP" exec bash "$copy" "$@"
fi

if [ "$DEPLOY_STAGE" = "pull" ]; then
  trap 'rm -f "$0"' EXIT
  cd "$APP"
  echo "==> Папка: $APP"

  echo "==> Забираю изменения"
  git pull --ff-only

  copy="$(mktemp /tmp/vdf-deploy.XXXXXX.sh)"
  cat "$APP/deploy/deploy.sh" > "$copy"
  # exec не даёт сработать trap, поэтому свой путь копия передаёт дальше —
  # убирать оба файла будет последний шаг.
  DEPLOY_STAGE=run DEPLOY_APP="$APP" DEPLOY_PREV="$0" exec bash "$copy" "$@"
fi

# Копии убирают себя за собой при любом выходе, включая аварийный.
trap 'rm -f "$0" ${DEPLOY_PREV:+"$DEPLOY_PREV"}' EXIT

cd "$APP"
echo "==> Папка: $APP"

# Node и системные программы (ffmpeg) — из образа vdf-runtime, а не с
# сервера: Dockerfile держит версию Node, которую требует better-sqlite3.
# Все команды ниже, которым нужен Node, идут через сервис tools той же
# среды. Образ пересобирается по-настоящему только при правке Dockerfile.
command -v docker >/dev/null || { echo "Нет docker"; exit 1; }
run() { docker compose run --rm --no-deps tools "$@"; }

echo "==> Образ среды"
docker compose build -q
echo "==> Node $(run node -v)"

echo "==> Ставлю зависимости"
# npm ci ставит строго то, что в package-lock.json — сборка воспроизводима.
#
# --ignore-scripts обязателен. npm не видит поле gypfile:false в сокращённом
# манифесте better-sqlite3 и лезет собирать его через node-gyp, хотя готовый
# бинарник лежит в самом пакете. Без флага установка падает на отсутствии
# компилятора. Install-скрипт во всём дереве зависимостей всего один, и он
# не нужен.
run npm ci --ignore-scripts --no-audit --no-fund

echo "==> Модели нейросетей для генератора картинок"
run node scripts/ml-worker.mjs --download

echo "==> Обновляю справочник автомобилей"
# Идемпотентно: строки обновляются по внешнему id, адреса уже заведённых
# записей не меняются, привязки товаров не рвутся. Пара секунд на пятнадцать
# тысяч строк — дешевле, чем помнить про отдельную команду после деплоя.
run npm run import-cars -- --logos

current_slot="$(cat var/dist-slot 2>/dev/null || echo .next)"
if [ "$current_slot" = ".next-a" ]; then build_slot=".next-b"; else build_slot=".next-a"; fi

echo "==> Собираю сайт в $build_slot (сейчас работает $current_slot)"
# prebuild сам прогонит импорт данных и препроцессор картинок; заново
# жмутся только новые фотографии.
#
# Сборка идёт до перезапуска намеренно: если она упадёт (опечатка в
# шаблоне, ошибка типов), скрипт прервётся здесь и старый процесс продолжит
# работать со старой сборкой. Сайт не заметит неудачного деплоя.
rm -rf "$build_slot" "$current_slot/types" "$current_slot/dev/types"
docker compose run --rm --no-deps -e NODE_ENV=production -e NEXT_DIST_DIR="$build_slot" tools npm run build
rm -rf "$build_slot/cache/turbopack"
printf '%s\n' "$build_slot" > var/dist-slot

echo "==> Ежедневный пересчёт цен по курсу НБРБ"
if [ ! -s var/cron-key ]; then
  (umask 077 && openssl rand -hex 32 > var/cron-key)
fi
rm -f /etc/cron.d/vdf-prices
cat > /etc/cron.d/vdf-rates <<CRON
SHELL=/bin/bash
30 1 * * * root curl -s -X POST --max-time 300 -H "x-cron-key: \$(cat $APP/var/cron-key)" localhost:$PORT/api/cron/rates/ -o $APP/var/rates.log
CRON
chmod 644 /etc/cron.d/vdf-rates

echo "==> Ежедневная копия базы"
cat > /etc/cron.d/vdf-backup <<CRON
SHELL=/bin/bash
40 3 * * * root bash $APP/deploy/backup.sh >> $APP/var/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/vdf-backup

echo "==> Удаление фото, не используемых 7 дней"
cat > /etc/cron.d/vdf-images <<CRON
SHELL=/bin/bash
20 4 * * * root curl -s -X POST --max-time 600 -H "x-cron-key: \$(cat $APP/var/cron-key)" localhost:$PORT/api/cron/images/ -o $APP/var/images-cleanup.log
CRON
chmod 644 /etc/cron.d/vdf-images

echo "==> Удаление облачных копий при протоколе AID"
cat > /etc/cron.d/vdf-panic <<CRON
SHELL=/bin/bash
* * * * * root bash $APP/deploy/panic-remote-wipe.sh >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/vdf-panic

echo "==> Досылка заказов сотрудников в CRM"
cat > /etc/cron.d/vdf-crm <<CRON
SHELL=/bin/bash
*/5 * * * * root curl -s -X POST --max-time 120 -H "x-cron-key: \$(cat $APP/var/cron-key)" localhost:$PORT/api/cron/crm/ -o $APP/var/crm-sync.log
CRON
chmod 644 /etc/cron.d/vdf-crm

rm -f /etc/cron.d/vdf-frame-split

echo "==> SEO-сводка: поиск каждое утро, конкуренты по понедельникам"
cat > /etc/cron.d/vdf-seo <<CRON
SHELL=/bin/bash
20 6 * * * root curl -s -X POST --max-time 600 -H "x-cron-key: \$(cat $APP/var/cron-key)" "localhost:$PORT/api/cron/seo/?kind=search" -o $APP/var/seo-search.log
0 5 * * 1 root curl -s -X POST --max-time 1800 -H "x-cron-key: \$(cat $APP/var/cron-key)" "localhost:$PORT/api/cron/seo/?kind=competitors" -o $APP/var/seo-competitors.log
CRON
chmod 644 /etc/cron.d/vdf-seo

echo "==> AI-SEO: заходы ИИ-ботов по логам nginx каждое утро"
cat > /etc/cron.d/vdf-ai-seo <<CRON
SHELL=/bin/bash
10 7 * * * root cd $APP && docker compose run --rm --no-deps tools node scripts/ai-seo-collect.mjs >> $APP/var/ai-seo.log 2>&1
CRON
chmod 644 /etc/cron.d/vdf-ai-seo

echo "==> Прокси нейросети"
# Служба хоста (deploy/vdf-ai-proxy.service). Ставится, только если на
# сервере есть сам wireproxy и его конфиг с ключом WireGuard: без них
# кнопки нейросети в админке просто неактивны, остальное работает.
if [ -x /usr/local/bin/wireproxy ] && [ -f /etc/wireproxy/vdf-ai.conf ]; then
  if ! cmp -s deploy/vdf-ai-proxy.service /etc/systemd/system/vdf-ai-proxy.service; then
    # До Docker прокси жил в pm2 под тем же именем — гасим его, иначе
    # служба не сможет занять порт.
    if command -v pm2 >/dev/null 2>&1 && pm2 describe vdf-ai-proxy >/dev/null 2>&1; then
      pm2 delete vdf-ai-proxy >/dev/null && pm2 save --force >/dev/null
    fi
    cp deploy/vdf-ai-proxy.service /etc/systemd/system/vdf-ai-proxy.service
    systemctl daemon-reload
    systemctl enable vdf-ai-proxy >/dev/null 2>&1
    systemctl restart vdf-ai-proxy
  fi
  systemctl is-active --quiet vdf-ai-proxy || echo "    ВНИМАНИЕ: vdf-ai-proxy не запущен (journalctl -u vdf-ai-proxy)"
else
  echo "    нет /usr/local/bin/wireproxy или /etc/wireproxy/vdf-ai.conf — пропускаю"
fi

echo "==> Перезапускаю $SERVICE"
# До Docker магазин жил в pm2 под тем же именем и держал порт — гасим его
# перед стартом контейнера. Когда pm2 на сервере не останется, шаг пустой.
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$SERVICE" >/dev/null 2>&1; then
  pm2 delete "$SERVICE" >/dev/null
  pm2 save --force >/dev/null
fi
# Пересоздание контейнера — пара секунд без ответа, как раньше у pm2 reload.
# После перезагрузки сервера контейнер поднимается сам (restart в compose).
docker compose up -d --no-deps --force-recreate "$SERVICE"

echo "==> Жду, пока поднимется"
for attempt in $(seq 1 30); do
  # Без -S и со скрытым stderr: пока процесс поднимается, отказ соединения
  # это ожидаемое состояние, а не ошибка. С -S curl печатал «Failed to
  # connect» на первой же попытке, и успешный деплой выглядел тревожно.
  if curl -fs --max-time 2 -o /dev/null "localhost:$PORT/" 2>/dev/null; then
    echo "    сайт отвечает (попытка $attempt)"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "    ВНИМАНИЕ: сайт не поднялся за 30 секунд!"
    if [ -d "$current_slot" ]; then
      echo "    Возвращаю прежнюю сборку $current_slot"
      printf '%s\n' "$current_slot" > var/dist-slot
      docker compose restart "$SERVICE"
    fi
    echo "    Смотрите: docker compose logs --tail 50 $SERVICE"
    exit 1
  fi
  sleep 1
done

echo "==> Проверяю ключевые адреса"
for url in / /catalog/ /sitemap.xml; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "localhost:$PORT$url")
  echo "    $code  $url"
  [ "$code" = "200" ] || { echo "    ВНИМАНИЕ: $url отвечает $code"; exit 1; }
done

# Админка обязана отвечать редиректом на форму входа. Если она вдруг
# отдаст 200 без куки — значит проверка доступа отвалилась, и это гораздо
# хуже упавшей сборки.
admin=$(curl -s -o /dev/null -w '%{http_code}' "localhost:$PORT/admin/")
if [ "$admin" = "307" ] || [ "$admin" = "302" ]; then
  echo "    $admin  /admin/ (уводит на вход — верно)"
else
  echo "    ВНИМАНИЕ: /admin/ отвечает $admin вместо редиректа на вход!"
  exit 1
fi

# Проверка снаружи, через публичный адрес и с проверкой сертификата.
#
# Всё выше стучится на localhost:3011 и поэтому не заметит ровно той
# поломки, которая однажды и случилась: приложение работает, nginx отвечает,
# а публичный HTTPS отдаёт чужой сертификат — и сайт пропадает из поиска,
# потому что canonical и sitemap ведут на https.
echo "==> Проверяю публичный адрес"
public=$(curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}' \
  --max-time 15 "https://$PUBLIC_HOST/" 2>/dev/null || echo "нет")
if [ "$public" = "200 0" ]; then
    echo "    https://$PUBLIC_HOST/ отвечает 200, сертификат валиден"
else
    echo "    ВНИМАНИЕ: https://$PUBLIC_HOST/ — «$public» вместо «200 0»!"
    echo "    Сайт работает, но для поисковиков он недоступен: canonical,"
    echo "    robots.txt и sitemap.xml ведут на https."
    echo "    Починка: certbot --nginx -d $PUBLIC_HOST -d www.$PUBLIC_HOST"
    echo "             nginx -t && systemctl reload nginx"
fi

if [ "$current_slot" = ".next" ] && [ -d .next ]; then
  rm -rf .next
fi

echo "==> Готово. Сайт обновлён."
