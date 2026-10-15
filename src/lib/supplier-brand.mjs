const BRAND = String.raw`(?<![\w.\/-])(?:VDF|Vdf|vdf|ВДФ)(?:[\s-]?(?:light|Light|LIGHT|лайт|Лайт))?(?![\w-]|\.(?:by|BY|ru|RU)\b)`;
const LENS_BRANDS = String.raw`(?:Cerida|Aozoom|iphcar|MTF|Optima|Dixel|Sunrise|Sanvi)\b`;
const COUNTRY = String.raw`(Россия|Китай|КНР|РФ)`;
const LABEL = String.raw`(?:[Пп]роизводитель|[Ии]зготовитель|[Бб]ренд)(?:\s+(?:стекла|рамок|рамки|изделия))?`;
const DASH = String.raw`\s*[—–:-]?\s*`;
const AFTER = String.raw`(?=[\s,.;:!?)\]»"]|$)`;
const SENTENCE_START = String.raw`(^|[.!?]\s+|\n)`;

const SUPPLIER_BRAND = new RegExp(String.raw`^\s*${BRAND}\s*$`, "i");
const ANY_MENTION = new RegExp(BRAND);
const MANUFACTURER_SPECS = new Set(["производитель", "изготовитель", "бренд", "марка производителя", "торговая марка"]);

const isUpper = (text) => /^[А-ЯЁA-Z]/.test(text);
const sameCase = (sample, word) => (isUpper(sample) ? word.charAt(0).toUpperCase() : word.charAt(0).toLowerCase()) + word.slice(1);

const RULES = [
  [new RegExp(String.raw`${BRAND},\s*(?=${LENS_BRANDS})`, "g"), ""],
  [new RegExp(String.raw`,\s*${BRAND}(?=\s*(?:,|и\s|или\s|\.|$))`, "gm"), ""],
  [new RegExp(String.raw`\(\s*${BRAND},\s*`, "g"), "("],
  [
    new RegExp(
      String.raw`${LABEL}${DASH}${BRAND}\s+(?:\(${COUNTRY}\)\s+)?да[её]т\s+(на\s+(?:рамки|изделие|изделия|них|эти рамки|стекло|товар)\s+)?гарантию`,
      "g",
    ),
    (match, _country, scope) => `${sameCase(match, "Гарантия")}${scope ? ` ${scope.trim()}` : ""} —`,
  ],
  [
    new RegExp(String.raw`${LABEL}${DASH}${BRAND}\s*\(${COUNTRY}\)`, "g"),
    (match, country) => `${sameCase(match, "Производство")} — ${country}`,
  ],
  [
    new RegExp(String.raw`${LABEL}${DASH}${BRAND},\s*${COUNTRY}(?=[\s,.;]|$)`, "g"),
    (match, country) => `${sameCase(match, "Производство")} — ${country}`,
  ],
  [new RegExp(String.raw`([Гг])арантия производителя\s+${BRAND}`, "g"), (_, letter) => `${letter}арантия`],
  [new RegExp(String.raw`${SENTENCE_START}${LABEL}${DASH}${BRAND}\s*(?:[.;]\s*|$)`, "g"), "$1"],
  [
    new RegExp(String.raw`${LABEL}${DASH}${BRAND},\s*([а-яёА-ЯЁ])`, "g"),
    (match, letter) => (isUpper(match) ? letter.toUpperCase() : letter),
  ],
  [new RegExp(String.raw`,\s*${LABEL}${DASH}${BRAND}(?=\s*[,.;]|\s*$)`, "g"), ""],
  [new RegExp(String.raw`${LABEL}${DASH}${BRAND}\s*[—–-]\s*`, "g"), ""],
  [new RegExp(String.raw`,?\s*(?:бренд|марка)${DASH}${BRAND}`, "g"), ""],
  [new RegExp(String.raw`${SENTENCE_START}${BRAND}\s+[—–-]\s+это\s+`, "g"), "$1Это "],
  [new RegExp(String.raw`${SENTENCE_START}${BRAND}(?=\s+[а-яё])`, "g"), "$1Производитель"],
  [new RegExp(String.raw`\s+[—–-]\s+${BRAND}(?=,)`, "g"), ""],
  [new RegExp(String.raw`(линейк[аеиуой]+)\s+бренда\s+${BRAND}`, "g"), "$1 производителя"],
  [
    new RegExp(
      String.raw`\s+(?:от\s+)?(?:производства|компании|фирмы|бренда|марки|производителя)\s+${BRAND}`,
      "g",
    ),
    "",
  ],
  [new RegExp(String.raw`\s+от\s+${BRAND}${AFTER}`, "g"), ""],
  [new RegExp(String.raw`(?<=[\wа-яёА-ЯЁ»")])\s+${BRAND}${AFTER}`, "g"), ""],
];

function tidy(text) {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?)\]])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/^\s+|\s+$/g, "");
}

export function isSupplierBrand(value) {
  return typeof value === "string" && SUPPLIER_BRAND.test(value);
}

export function mentionsSupplierBrand(value) {
  return typeof value === "string" && ANY_MENTION.test(value);
}

export function stripSupplierBrand(text) {
  if (!mentionsSupplierBrand(text)) return text;
  let result = text;
  for (const [pattern, replacement] of RULES) result = result.replace(pattern, replacement);
  return tidy(result);
}

export function stripSupplierSpecs(specs) {
  return (specs ?? [])
    .filter((spec) => !(MANUFACTURER_SPECS.has(spec.name.trim().toLowerCase()) && isSupplierBrand(spec.value)))
    .map((spec) => ({ ...spec, value: stripSupplierBrand(spec.value) }));
}
