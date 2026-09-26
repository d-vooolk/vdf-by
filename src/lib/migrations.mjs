/**
 * Схема базы, шаг за шагом.
 *
 * Добавлять только в конец массива: номер применённой миграции хранится в
 * самой базе (pragma user_version), пройденные шаги повторно не выполняются.
 * Править уже вышедший шаг нельзя — у вас на сервере он давно применён, и
 * правка просто не выполнится.
 *
 * Файл на чистом JavaScript, потому что его читают двое: приложение
 * (src/lib/db.ts) и консольные скрипты, которым TypeScript недоступен.
 */

export const MIGRATIONS = [
  /* 1 — исходная схема */ `
    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE categories (
      id         TEXT PRIMARY KEY,
      slug       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 999,
      data       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE products (
      id          TEXT PRIMARY KEY,
      slug        TEXT NOT NULL UNIQUE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      title       TEXT NOT NULL,
      brand       TEXT NOT NULL DEFAULT '',
      price       REAL NOT NULL,
      in_stock    INTEGER NOT NULL DEFAULT 1,
      featured    INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      data        TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX products_by_category ON products(category_id, sort_order, id);

    -- Манифест обработанных фотографий: то, что раньше лежало в
    -- src/generated/images.json. Ключ — путь, который админка пишет в товар.
    CREATE TABLE images (
      path       TEXT PRIMARY KEY,
      w          INTEGER NOT NULL,
      h          INTEGER NOT NULL,
      blur       TEXT NOT NULL,
      sources    TEXT NOT NULL,
      fallback   TEXT NOT NULL,
      bytes      INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'new',
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      phone_digits  TEXT NOT NULL,
      comment       TEXT NOT NULL DEFAULT '',
      delivery_id   TEXT NOT NULL DEFAULT '',
      delivery_name TEXT NOT NULL DEFAULT '',
      address       TEXT NOT NULL DEFAULT '',
      delivery_cost REAL NOT NULL DEFAULT 0,
      subtotal      REAL NOT NULL,
      total         REAL NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'BYN',
      items         TEXT NOT NULL,
      notes         TEXT NOT NULL DEFAULT '[]',
      ip            TEXT NOT NULL DEFAULT '',
      referer       TEXT NOT NULL DEFAULT '',
      telegram_sent INTEGER NOT NULL DEFAULT 0,
      admin_note    TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX orders_by_date ON orders(created_at DESC);
    CREATE INDEX orders_by_phone ON orders(phone_digits);

    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      login         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      last_login_at INTEGER
    );

    -- В базе лежит хеш токена, а не сам токен. Утечка дампа базы не даёт
    -- возможности зайти в админку под чужой сессией.
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      user_agent TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX sessions_by_expiry ON sessions(expires_at);
  `,

  /* 2 — подразделы */ `
    -- Родитель раздела. NULL — раздел верхнего уровня.
    -- ON DELETE RESTRICT: раздел с подразделами так просто не удалить,
    -- сначала надо решить судьбу детей. Этим занимается store.ts.
    ALTER TABLE categories
      ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT;

    CREATE INDEX categories_by_parent ON categories(parent_id, sort_order, name);
  `,

  /* 3 — переадресация со старых адресов */ `
    -- Адрес страницы можно поменять: название товара или раздела иногда
    -- меняется так, что прежний slug начинает врать. Проблема в том, что
    -- старый адрес уже в поиске, в закладках и в чужих ссылках — просто
    -- отдать по нему 404 значит потерять и позиции, и живых людей.
    --
    -- Поэтому при смене адреса сюда ложится строчка «откуда → куда», и
    -- страница по старому адресу отвечает постоянной переадресацией.
    -- Записей тут по одной на переименование, то есть единицы.
    CREATE TABLE redirects (
      from_path  TEXT PRIMARY KEY,
      to_path    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `,

  /* 4 — подбор по автомобилю */ `
    -- Справочник марок, моделей и поколений. Заливается один раз из
    -- data/cars-catalog.json (npm run import-cars) и дальше только читается:
    -- владелец магазина его не правит, он правит привязки товаров.
    --
    -- id везде внешний, из донора справочника. Так повторный импорт
    -- обновляет строки на месте и не рвёт привязки товаров.
    CREATE TABLE car_marks (
      id         TEXT PRIMARY KEY,
      slug       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      year_from  INTEGER,
      year_to    INTEGER,
      -- Путь картинки в таблице images. Пусто — иконку ещё не забирали:
      -- логотипы и фото тянутся по требованию, когда марку впервые
      -- привязали к товару, а не все девять тысяч разом.
      logo       TEXT NOT NULL DEFAULT '',
      logo_src   TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE car_models (
      id        TEXT PRIMARY KEY,
      mark_id   TEXT NOT NULL REFERENCES car_marks(id) ON DELETE CASCADE,
      slug      TEXT NOT NULL,
      name      TEXT NOT NULL,
      year_from INTEGER,
      year_to   INTEGER
    );

    CREATE UNIQUE INDEX car_models_slug ON car_models(mark_id, slug);
    CREATE INDEX car_models_by_mark ON car_models(mark_id, name);

    CREATE TABLE car_generations (
      id        TEXT PRIMARY KEY,
      model_id  TEXT NOT NULL REFERENCES car_models(id) ON DELETE CASCADE,
      slug      TEXT NOT NULL,
      name      TEXT NOT NULL,
      year_from INTEGER,
      year_to   INTEGER,
      photo     TEXT NOT NULL DEFAULT '',
      photo_src TEXT NOT NULL DEFAULT ''
    );

    CREATE UNIQUE INDEX car_generations_slug ON car_generations(model_id, slug);
    CREATE INDEX car_generations_by_model ON car_generations(model_id, year_from DESC);

    -- Товар подходит к поколению автомобиля. Связь многие-ко-многим: одна
    -- лампа встаёт в десяток машин, в одну машину идёт десяток товаров.
    --
    -- ON DELETE CASCADE с обеих сторон: удалили товар — привязки не нужны,
    -- пропало поколение из справочника — привязка вела бы в никуда, а по
    -- ней строятся страницы подбора.
    CREATE TABLE product_cars (
      product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      generation_id TEXT NOT NULL REFERENCES car_generations(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, generation_id)
    );

    CREATE INDEX product_cars_by_generation ON product_cars(generation_id);
  `,

  /* 5 — одно описание товара вместо короткого и полного */ `
    UPDATE products
       SET data = json_set(data, '$.description',
             CASE
               WHEN COALESCE(json_extract(data, '$.description'), '') = ''
                 THEN json_extract(data, '$.excerpt')
               WHEN instr(json_extract(data, '$.description'),
                          json_extract(data, '$.excerpt')) = 1
                 THEN json_extract(data, '$.description')
               ELSE json_extract(data, '$.excerpt') || char(10) || char(10) ||
                    json_extract(data, '$.description')
             END)
     WHERE COALESCE(json_extract(data, '$.excerpt'), '') <> '';

    UPDATE products
       SET data = json_remove(data, '$.excerpt', '$.tags')
     WHERE json_extract(data, '$.excerpt') IS NOT NULL
        OR json_extract(data, '$.tags') IS NOT NULL;
  `,

  /* 6 — свои марки, модели и поколения в справочнике */ `
    ALTER TABLE car_marks       ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE car_models      ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE car_generations ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
  `,

  /* 7 — почта покупателя и согласие на обработку персональных данных */ `
    ALTER TABLE orders ADD COLUMN email      TEXT NOT NULL DEFAULT '';
    ALTER TABLE orders ADD COLUMN consent_at INTEGER;
  `,

  /* 8 — журнал запросов к нейросети */ `
    CREATE TABLE ai_requests (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at     INTEGER NOT NULL,
      task           TEXT NOT NULL,
      model          TEXT NOT NULL DEFAULT '',
      provider       TEXT NOT NULL DEFAULT '',
      duration_ms    INTEGER NOT NULL,
      first_token_ms INTEGER,
      tokens_in      INTEGER,
      tokens_out     INTEGER,
      cost           REAL,
      ok             INTEGER NOT NULL,
      error          TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX ai_requests_by_time ON ai_requests(created_at);
  `,

  /* 9 — временный импорт переходных рамок с vdf-light.ru */ `
    CREATE TABLE vdf_categories (
      slug      TEXT PRIMARY KEY,
      done      INTEGER NOT NULL DEFAULT 0,
      truncated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE vdf_frames (
      url            TEXT PRIMARY KEY,
      article        TEXT NOT NULL DEFAULT '',
      model_frame    TEXT NOT NULL DEFAULT '',
      frame_type     TEXT NOT NULL DEFAULT '',
      name           TEXT NOT NULL DEFAULT '',
      cars           TEXT NOT NULL DEFAULT '[]',
      generation_ids TEXT NOT NULL DEFAULT '[]',
      unmatched      TEXT NOT NULL DEFAULT '[]',
      review         TEXT NOT NULL DEFAULT '[]',
      details        TEXT NOT NULL DEFAULT '{}',
      status         TEXT NOT NULL DEFAULT 'new',
      product_id     TEXT,
      error          TEXT NOT NULL DEFAULT '',
      updated_at     INTEGER NOT NULL
    );

    CREATE INDEX vdf_frames_by_status ON vdf_frames(status);
  `,

  /* 10 — общие цены и остатки по типу переходной рамки */ `
    CREATE TABLE frame_types (
      category_id     TEXT NOT NULL,
      type            TEXT NOT NULL,
      cost_price      REAL,
      price           REAL,
      wholesale_price REAL,
      stock_qty       INTEGER,
      in_stock        INTEGER NOT NULL DEFAULT 0,
      updated_at      INTEGER NOT NULL,
      PRIMARY KEY (category_id, type)
    );
  `,

  /* 11 — покупатели: вход по SMS, оптовики */ `
    CREATE TABLE customers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      phone            TEXT NOT NULL UNIQUE,
      name             TEXT NOT NULL,
      kind             TEXT NOT NULL DEFAULT 'retail',
      address          TEXT NOT NULL DEFAULT '',
      wholesale_status TEXT NOT NULL DEFAULT 'none',
      consent_at       INTEGER NOT NULL,
      created_at       INTEGER NOT NULL,
      last_login_at    INTEGER,
      reviewed_at      INTEGER,
      admin_note       TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX customers_by_wholesale ON customers(wholesale_status, created_at DESC);

    CREATE TABLE customer_sessions (
      token_hash  TEXT PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );

    CREATE INDEX customer_sessions_by_expiry ON customer_sessions(expires_at);

    CREATE TABLE sms_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      phone      TEXT NOT NULL,
      purpose    TEXT NOT NULL,
      code_hash  TEXT NOT NULL,
      payload    TEXT NOT NULL DEFAULT '{}',
      ip         TEXT NOT NULL DEFAULT '',
      attempts   INTEGER NOT NULL DEFAULT 0,
      used       INTEGER NOT NULL DEFAULT 0,
      sent       INTEGER NOT NULL DEFAULT 0,
      error      TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX sms_codes_by_phone ON sms_codes(phone, created_at DESC);
    CREATE INDEX sms_codes_by_ip ON sms_codes(ip, created_at DESC);

    ALTER TABLE orders ADD COLUMN customer_id INTEGER;
    ALTER TABLE orders ADD COLUMN wholesale INTEGER NOT NULL DEFAULT 0;
  `,

  `
    ALTER TABLE orders ADD COLUMN stock_moves TEXT;

    UPDATE products
       SET in_stock = CASE WHEN COALESCE(json_extract(data, '$.stockQty'), 0) > 0 THEN 1 ELSE 0 END,
           data = json_set(data, '$.inStock', json(
             CASE WHEN COALESCE(json_extract(data, '$.stockQty'), 0) > 0 THEN 'true' ELSE 'false' END
           ));

    UPDATE frame_types
       SET in_stock = CASE WHEN COALESCE(stock_qty, 0) > 0 THEN 1 ELSE 0 END;
  `,

  `
    UPDATE products
       SET data = json_remove(
             json_set(data, '$.costSource', json_object(
               'amount', json_extract(data, '$.costUsd'),
               'currency', 'USD'
             )),
             '$.costUsd'
           )
     WHERE COALESCE(json_extract(data, '$.costUsd'), 0) > 0;

    UPDATE products
       SET data = json_remove(data, '$.costUsd')
     WHERE json_extract(data, '$.costUsd') IS NOT NULL;

    ALTER TABLE frame_types ADD COLUMN price_source TEXT;
    ALTER TABLE frame_types ADD COLUMN cost_source TEXT;
    ALTER TABLE frame_types ADD COLUMN wholesale_source TEXT;
  `,

  `
    CREATE TABLE vdf_exports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      total      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE vdf_export_sources (
      export_id INTEGER NOT NULL REFERENCES vdf_exports(id) ON DELETE CASCADE,
      slug      TEXT NOT NULL,
      name      TEXT NOT NULL,
      next_url  TEXT,
      done      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (export_id, slug)
    );

    CREATE TABLE vdf_export_items (
      export_id INTEGER NOT NULL REFERENCES vdf_exports(id) ON DELETE CASCADE,
      url       TEXT NOT NULL,
      position  INTEGER NOT NULL,
      listed    TEXT NOT NULL,
      card      TEXT,
      status    TEXT NOT NULL DEFAULT 'new',
      error     TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (export_id, url)
    );

    CREATE INDEX vdf_export_items_by_status ON vdf_export_items(export_id, status, position);

    CREATE TABLE vdf_imports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name   TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      unit        TEXT NOT NULL,
      photos      INTEGER NOT NULL DEFAULT 1,
      faq         INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE vdf_import_items (
      import_id  INTEGER NOT NULL REFERENCES vdf_imports(id) ON DELETE CASCADE,
      position   INTEGER NOT NULL,
      title      TEXT NOT NULL,
      rows       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'queued',
      product_id TEXT,
      message    TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (import_id, position)
    );

    CREATE INDEX vdf_import_items_by_status ON vdf_import_items(import_id, status, position);
  `,
];

/**
 * Догоняет базу до последней версии. Каждый шаг в своей транзакции: если
 * миграция упадёт на середине, база останется на предыдущей версии целиком,
 * а не в полусобранном состоянии.
 */
export function migrate(db) {
  const current = db.pragma("user_version", { simple: true });

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Миграция базы №${version + 1} не применилась: ${error.message}`,
      );
    }
  }

  return current;
}

/**
 * Открывает базу с теми же настройками, что и приложение.
 * Используется консольными скриптами; в приложении это делает src/lib/db.ts.
 */
export function openDatabase(Database, file) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}
