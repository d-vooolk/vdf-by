# Ограничение частоты запросов в nginx

Защита каталога от выкачивания программами-сборщиками. Настроено в
`deploy/nginx.conf`: зоны `limit_req_zone` и карты в начале файла, лимиты —
в `location /` и `location /img/`.

## Что ограничено

Всё считается по IP-адресу.

| Что | Без паузы подряд | Дальше |
|---|---|---|
| Страницы (обычная загрузка) | 120 | 1 в секунду |
| Страницы, длинное окно | 600 | 20 в минуту |
| Переходы внутри сайта и предзагрузка ссылок (заголовок `RSC`) | 300 | 5 в секунду |
| Фото `/img/` | 400 | 10 в секунду |

Превышение — ответ `429`. Покупатель до лимитов не доходит: даже за
сотню страниц подряд ему ничего не будет. Сборщик, который идёт по
каталогу без остановки, упирается через несколько минут и дальше получает
не больше 20 страниц в минуту.

Запас большой из-за мобильных операторов: за одним адресом (CGNAT) сидит
много людей одновременно.

## Кого лимиты не касаются

- **Поисковые роботы** и сервисы превью ссылок — по User-Agent: Яндекс,
  Google, Bing, Mail.ru, Apple, DuckDuckGo, Telegram, WhatsApp, Viber, VK,
  Facebook, Twitter. Индексация не страдает.
- **Админка** `/admin/` — у неё свой `location`.
- **Файлы сборки** `/_next/static/` — отдаются без лимитов.

## Кого блокируем сразу

Запросы с User-Agent известных библиотек и сервисов для сбора получают
`403`: python-requests, aiohttp, Scrapy, HTTrack, Go-http-client, wget,
headless-браузеры (Puppeteer, Playwright, HeadlessChrome), SEO-пауки
Ahrefs, Semrush, MJ12 и подобные.

`curl` не заблокирован намеренно: им пользуется проверка публичного адреса
в `deploy/deploy.sh`.

## Ограничения подхода

User-Agent можно подделать. Сборщик, который представится Googlebot,
лимиты обойдёт. Отсечь его можно только проверкой обратного DNS, которой
в nginx нет, — если такое случится, адрес блокируется вручную
(`deny` в `server`).

## Как применить на сервере

Деплой этот файл не копирует — только вручную. Сначала найдите, где лежит
живой конфиг сайта:

```
nginx -T 2>/dev/null | grep -n "configuration file.*vdf"
```

Обычно это `/etc/nginx/sites-available/vdf.by`. Затем:

```
cp /etc/nginx/sites-available/vdf.by /root/vdf.by.nginx.bak
cp /var/www/vdf.by/deploy/nginx.conf /etc/nginx/sites-available/vdf.by
nginx -t && systemctl reload nginx
```

Если `nginx -t` ругается — верните копию из `/root/vdf.by.nginx.bak`.

Имена зон (`vdf_pages`, `vdf_pages_long`, `vdf_rsc`, `vdf_img`) должны быть
уникальны на всём сервере: рядом работают другие сайты.

## Как проверить

```
grep "limiting requests" /var/log/nginx/vdf.by.error.log | tail
grep '" 429 ' /var/log/nginx/vdf.by.access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head
```

Если в логе оказываются живые покупатели, увеличьте `burst` у
`vdf_pages_long` или `rate` у зоны.
