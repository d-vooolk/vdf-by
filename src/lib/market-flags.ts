export const MARKETS = [
  { value: "us", label: "США" },
  { value: "eu", label: "Европа" },
  { value: "ru", label: "Россия" },
  { value: "cn", label: "Китай" },
  { value: "kr", label: "Корея" },
] as const;

export type Market = (typeof MARKETS)[number]["value"];

export function isMarket(value: unknown): value is Market {
  return MARKETS.some((market) => market.value === value);
}

const TITLE_MARKERS: Array<[RegExp, Market]> = [
  [/(^|[^a-zа-я])(usa|us)([^a-zа-я]|$)|сша|америк/i, "us"],
  [/(^|[^a-zа-я])eu([^a-zа-я]|$)|европ/i, "eu"],
  [/(^|[^a-zа-я])(cn|china)([^a-zа-я]|$)|китай/i, "cn"],
  [/(^|[^a-zа-я])(kr|korea)([^a-zа-я]|$)|коре/i, "kr"],
  [/(^|[^a-zа-я])рф([^a-zа-я]|$)|росси/i, "ru"],
];

export function marketFromTitle(title: string): Market | "" {
  return TITLE_MARKERS.find(([pattern]) => pattern.test(title))?.[1] ?? "";
}

function star(cx: number, cy: number, outer: number, rotation = -90): string {
  const inner = outer * 0.382;
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 ? inner : outer;
    const angle = ((rotation + index * 36) * Math.PI) / 180;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(3)},${(cy + radius * Math.sin(angle)).toFixed(3)}`);
  }
  return points.join(" ");
}

function usa(): string {
  const stripe = 20 / 13;
  const stripes = Array.from({ length: 7 }, (_, index) =>
    `<rect y="${(index * 2 * stripe).toFixed(3)}" width="30" height="${stripe.toFixed(3)}" fill="#B22234"/>`,
  ).join("");
  const cantonWidth = 12;
  const cantonHeight = stripe * 7;
  const stars: string[] = [];
  for (let row = 0; row < 9; row += 1) {
    const count = row % 2 ? 5 : 6;
    for (let column = 0; column < count; column += 1) {
      const x = (cantonWidth / 12) * (row % 2 ? 2 + column * 2 : 1 + column * 2);
      const y = (cantonHeight / 10) * (row + 1);
      stars.push(`<polygon points="${star(x, y, 0.42)}" fill="#fff"/>`);
    }
  }
  return `<rect width="30" height="20" fill="#fff"/>${stripes}<rect width="${cantonWidth}" height="${cantonHeight.toFixed(3)}" fill="#3C3B6E"/>${stars.join("")}`;
}

function europe(): string {
  const stars = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * 30 * Math.PI) / 180;
    return `<polygon points="${star(15 + 6 * Math.sin(angle), 10 - 6 * Math.cos(angle), 1)}" fill="#FFCC00"/>`;
  }).join("");
  return `<rect width="30" height="20" fill="#003399"/>${stars}`;
}

function russia(): string {
  return `<rect width="30" height="20" fill="#fff"/><rect y="6.667" width="30" height="6.667" fill="#0039A6"/><rect y="13.333" width="30" height="6.667" fill="#D52B1E"/>`;
}

function china(): string {
  const small: Array<[number, number]> = [[10, 2], [12, 4], [12, 7], [10, 9]];
  return (
    `<rect width="30" height="20" fill="#EE1C25"/><polygon points="${star(5, 5, 3)}" fill="#FFFF00"/>` +
    small
      .map(([x, y]) => {
        const rotation = (Math.atan2(5 - y, 5 - x) * 180) / Math.PI;
        return `<polygon points="${star(x, y, 1, rotation)}" fill="#FFFF00"/>`;
      })
      .join("")
  );
}

function korea(): string {
  const bars = (pattern: Array<boolean>, cx: number, cy: number, angle: number) => {
    const width = 4;
    const height = 0.6;
    const gap = 0.35;
    const shapes = pattern
      .map((solid, index) => {
        const y = cy - (height * 3 + gap * 2) / 2 + index * (height + gap);
        return solid
          ? `<rect x="${cx - width / 2}" y="${y.toFixed(3)}" width="${width}" height="${height}"/>`
          : `<rect x="${cx - width / 2}" y="${y.toFixed(3)}" width="${(width - 0.5) / 2}" height="${height}"/>` +
              `<rect x="${(cx + 0.25).toFixed(3)}" y="${y.toFixed(3)}" width="${(width - 0.5) / 2}" height="${height}"/>`;
      })
      .join("");
    return `<g transform="rotate(${angle} ${cx} ${cy})" fill="#000">${shapes}</g>`;
  };
  return (
    `<rect width="30" height="20" fill="#fff"/>` +
    `<g transform="rotate(33.69 15 10)">` +
    `<circle cx="15" cy="10" r="5" fill="#0047A0"/>` +
    `<path d="M10 10 A5 5 0 0 1 20 10 A2.5 2.5 0 0 0 15 10 A2.5 2.5 0 0 1 10 10 Z" fill="#CD2E3A"/>` +
    `</g>` +
    bars([true, true, true], 6.2, 4.1, -56.31) +
    bars([false, true, false], 23.8, 4.1, 56.31) +
    bars([true, false, true], 6.2, 15.9, 56.31) +
    bars([false, false, false], 23.8, 15.9, -56.31)
  );
}

const FLAGS: Record<Market, () => string> = { us: usa, eu: europe, ru: russia, cn: china, kr: korea };

export function flagMarkup(market: Market): string {
  return FLAGS[market]();
}

export function flagSvg(market: Market, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 30 20" preserveAspectRatio="none">${flagMarkup(market)}</svg>`;
}
