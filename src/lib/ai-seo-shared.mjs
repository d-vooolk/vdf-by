export const AI_BOTS = [
  { id: "ChatGPT-User", owner: "ChatGPT", kind: "answer", ips: ["https://openai.com/chatgpt-user.json"] },
  { id: "OAI-SearchBot", owner: "ChatGPT", kind: "search", ips: ["https://openai.com/searchbot.json"] },
  { id: "GPTBot", owner: "ChatGPT", kind: "train", ips: ["https://openai.com/gptbot.json"] },
  { id: "Perplexity-User", owner: "Perplexity", kind: "answer", ips: ["https://www.perplexity.com/perplexity-user.json"] },
  { id: "PerplexityBot", owner: "Perplexity", kind: "search", ips: ["https://www.perplexity.com/perplexitybot.json"] },
  { id: "Claude-User", owner: "Claude", kind: "answer" },
  { id: "Claude-SearchBot", owner: "Claude", kind: "search" },
  { id: "ClaudeBot", owner: "Claude", kind: "train" },
  { id: "DuckAssistBot", owner: "DuckDuckGo", kind: "answer" },
  { id: "MistralAI-User", owner: "Mistral", kind: "answer" },
  { id: "YandexAdditional", owner: "Яндекс (Нейро)", kind: "search" },
  {
    id: "GoogleOther",
    owner: "Google",
    kind: "other",
    ips: [
      "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
      "https://developers.google.com/static/search/apis/ipranges/special-crawlers.json",
    ],
  },
  { id: "bingbot", owner: "Bing (Copilot, ChatGPT)", kind: "search", ips: ["https://www.bing.com/toolbox/bingbot.json"] },
  { id: "Applebot", owner: "Apple", kind: "search" },
  { id: "meta-externalagent", owner: "Meta AI", kind: "train" },
  { id: "Amazonbot", owner: "Amazon", kind: "train" },
  { id: "Bytespider", owner: "ByteDance", kind: "train" },
  { id: "CCBot", owner: "Common Crawl", kind: "train" },
  { id: "DeepSeekBot", owner: "DeepSeek", kind: "train" },
];

export const SCANNER_PATH =
  /\.env|\.git|\/@fs|\.\.[/;%]|wp-|\.php|\.aws|credentials|\.ya?ml$|\.toml$|\.key$|\/proc\/|phpmyadmin|\.boto|\.profile|\.bash|\.idea|__vite|\/userfiles|\/api\/system|\/actuator|\/cgi-bin|\/vendor\/|\.json$/i;

export const STATIC_PATH = /^\/_next\/|^\/(images|uploads|media|frame-images)\/|\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|map|woff2?|mp4|webm)$/i;

export const SKIP_PATH = /^\/(admin|api)(\/|$)/;

export const AI_REFERRER =
  /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|claude\.ai|chat\.deepseek\.com|deepseek\.com|grok\.com|x\.ai|you\.com|phind\.com|chat\.mistral\.ai|alice\.yandex\.ru|com\.yandex\.aliceapp|giga\.chat|gigachat\.ru|meta\.ai)$/i;

export const AI_SOURCE_NAME = /chatgpt|openai|perplexity|gemini|copilot|claude|deepseek|grok|mistral|gigachat|алиса|alice/i;

export const QUESTION_QUERY =
  /^(как|почему|что|чем|зачем|можно|нужно|надо|сколько|какие|какой|какая|какую|когда|где|стоит ли|отчего|нормально ли|законно|разрешено|пройд|прохо|если)(\s|$)|\?/i;

export const COMMERCIAL_QUERY = /купить|цена|цены|стоимост|заказать|в наличии|недорого|магазин|доставк/i;

export const BRAND_QUERY = /vdf|вдф/i;

export function isQuestion(query) {
  if (QUESTION_QUERY.test(query)) return true;
  return query.trim().split(/\s+/).length >= 5 && !COMMERCIAL_QUERY.test(query);
}

const LOG_LINE = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):[^\]]+\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/;
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

export function parseLogLine(line) {
  const match = LOG_LINE.exec(line);
  if (!match) return null;
  const [, ip, dd, mon, yyyy, , rawPath, status, ua] = match;
  return { ip, day: `${yyyy}-${MONTHS[mon] ?? "01"}-${dd}`, path: rawPath.split("?")[0], status: Number(status), ua };
}

export function botOf(ua) {
  const lower = ua.toLowerCase();
  return AI_BOTS.find((bot) => lower.includes(bot.id.toLowerCase())) ?? null;
}
