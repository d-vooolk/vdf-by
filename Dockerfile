# Среда выполнения магазина: Node 22 и системные программы, которые нужны
# сайту и сборке.
#
# Кода в образе нет — каталог приложения монтируется томом
# (docker-compose.yml). У магазина своё состояние прямо в папке: база в var/,
# загруженные фотографии в public/img, слоты сборки .next-a/.next-b, и сборка
# читает базу. Поэтому образ отвечает только за версию Node и системные
# пакеты — то, что раньше давали nvm и pm2 на сервере.
#
# Debian, а не Alpine: готовые бинарники better-sqlite3, sharp и
# onnxruntime-node собраны под glibc.
FROM node:22.23.2-bookworm-slim

# ffmpeg — перекодирование видео товаров (src/lib, см. .env.example).
# curl, ca-certificates — скачивание моделей и проверки в deploy.sh.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
