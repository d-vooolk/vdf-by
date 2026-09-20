#!/usr/bin/env node
/**
 * Выкатка одной командой:
 *
 *   npm run deploy
 *
 * Запускается с рабочей машины. Сам ничего не заливает: заходит по SSH на
 * сервер и просит его забрать изменения из git и пересобраться. Поэтому
 * выкатывается ровно то, что лежит в репозитории, — и то же самое увидит
 * следующий человек, открывший историю.
 *
 * Эта же команда работает и на сервере: если её запустить из папки
 * приложения, скрипт замечает, что уже на месте, и выполняет деплой
 * напрямую, без SSH к самому себе.
 *
 * Настройки — через окружение, значения по умолчанию соответствуют боевому
 * серверу:
 *
 *   DEPLOY_HOST    217.12.37.199
 *   DEPLOY_USER    root
 *   DEPLOY_PATH    /var/www/vdf.by
 *   DEPLOY_KEY     ~/.ssh/vdf_deploy
 *   DEPLOY_BRANCH  main
 *   DEPLOY_SSH     ssh            (если нужен конкретный клиент)
 *
 * Флаги:
 *   --force   выкатить, несмотря на незакоммиченные правки
 *   --local   выполнить деплой здесь же, без SSH
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { env } from "../src/lib/env.mjs";

const HOST = env("DEPLOY_HOST", "217.12.37.199");
const USER = env("DEPLOY_USER", "root");
const APP_PATH = env("DEPLOY_PATH", "/var/www/vdf.by");
const BRANCH = env("DEPLOY_BRANCH", "main");
const SSH = env("DEPLOY_SSH", "ssh");
const KEY = env("DEPLOY_KEY", path.join(os.homedir(), ".ssh", "vdf_deploy"));

const force = process.argv.includes("--force");
const localFlag = process.argv.includes("--local");

function say(text) {
  console.log(text);
}

function fail(text) {
  console.error(`\n${text}\n`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/* ------------------------------------------------------------------ */
/* Уже на сервере?                                                     */
/* ------------------------------------------------------------------ */

/**
 * Признак «мы на сервере» — совпадение текущей папки с папкой приложения.
 * Проверять по имени хоста было бы хрупко: его меняют, и у провайдеров оно
 * бывает случайным набором букв.
 */
function onServer() {
  try {
    return fs.realpathSync(process.cwd()) === fs.realpathSync(APP_PATH);
  } catch {
    return false;
  }
}

if (localFlag || onServer()) {
  say("Деплой на месте, без SSH.\n");
  const result = spawnSync("bash", ["deploy/deploy.sh"], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

/* ------------------------------------------------------------------ */
/* Проверки перед выкаткой                                             */
/* ------------------------------------------------------------------ */

/*
 * Сервер забирает код из git, а не с этой машины. Значит незакоммиченная
 * правка на выкатку не попадёт — а выглядеть это будет так, будто деплой
 * прошёл и ничего не изменилось. Полчаса на поиск причины стоят дороже
 * двух проверок ниже.
 */

say("==> Проверяю состояние репозитория");

const dirty = git("status", "--porcelain");
if (dirty && !force) {
  // trim, а не отступ к сырой строке: в --porcelain статус занимает две
  // позиции, и у неотслеживаемых файлов («??») он на одну шире, чем у
  // изменённых (« M») — список получался с рваным левым краем.
  const files = dirty
    .split("\n")
    .map((line) => `      ${line.trim()}`)
    .join("\n");
  fail(
    `Есть незакоммиченные изменения — на сервер они не поедут:\n\n${files}\n\n` +
      "  Закоммитьте и запушьте их, либо выкатывайте как есть: npm run deploy -- --force",
  );
}
if (dirty && force) {
  say("    незакоммиченные правки есть, но указан --force — они останутся здесь");
}

const head = git("rev-parse", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");

say(`    ветка ${branch}, коммит ${head.slice(0, 7)}`);

if (branch !== BRANCH) {
  say(`    ВНИМАНИЕ: сервер забирает ${BRANCH}, а вы на ${branch}`);
}

say(`==> Сверяюсь с origin/${BRANCH}`);
try {
  execFileSync("git", ["fetch", "origin", BRANCH, "--quiet"], { stdio: "pipe" });
} catch {
  say("    не удалось связаться с origin — сверяю по последним известным данным");
}

const remote = git("rev-parse", `origin/${BRANCH}`);

if (head !== remote) {
  const ahead = git("rev-list", "--count", `origin/${BRANCH}..HEAD`);
  const behind = git("rev-list", "--count", `HEAD..origin/${BRANCH}`);
  if (Number(ahead) > 0) {
    fail(
      `Не запушено коммитов: ${ahead}. Сервер их не увидит.\n\n` +
        `  git push origin ${BRANCH}`,
    );
  }
  if (Number(behind) > 0) {
    fail(
      `origin/${BRANCH} впереди на ${behind} коммит(ов) — на сервер уедет не то, что у вас.\n\n` +
        `  git pull --ff-only`,
    );
  }
}

say("    всё запушено\n");

/* ------------------------------------------------------------------ */
/* Выкатка                                                            */
/* ------------------------------------------------------------------ */

if (!fs.existsSync(KEY)) {
  fail(
    `Не найден ключ ${KEY}\n\n` +
      "  Другой путь задаётся так: DEPLOY_KEY=/путь/к/ключу npm run deploy",
  );
}

say(`==> ${USER}@${HOST}:${APP_PATH}\n`);

// Ключ явно и BatchMode: без него ssh при неподошедшем ключе уйдёт в запрос
// пароля и подвесит скрипт, а из npm-скрипта отвечать на него неудобно.
const result = spawnSync(
  SSH,
  [
    "-i", KEY,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    `${USER}@${HOST}`,
    // bash -lc, чтобы подхватился nvm: deploy.sh переключается на Node 22.
    `bash -lc 'cd ${APP_PATH} && ./deploy/deploy.sh'`,
  ],
  { stdio: "inherit" },
);

if (result.error) {
  fail(`Не удалось запустить ${SSH}: ${result.error.message}`);
}

if (result.status !== 0) {
  fail(
    `Деплой прерван, код ${result.status}. Сайт при этом работает на прежней сборке:\n` +
      "  сборка идёт до перезапуска, и при её падении процесс не трогается.\n\n" +
      `  Логи: ${SSH} -i ${KEY} ${USER}@${HOST} 'pm2 logs vdf --lines 50 --nostream'`,
  );
}

say("\n==> Выкачено.");
