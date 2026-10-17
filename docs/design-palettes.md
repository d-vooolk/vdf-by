# Отложенные палитры оформления

Варианты, которые рассматривали для редизайна витрины и отложили на будущее.
Токены ниже — переменные движка «Концепций» (`--k-*`), который собирал
вариант оформления поверх текущей вёрстки: шкала оттенков текста считалась
через `color-mix` из пары «фон зоны / цвет текста зоны».

## Вино и персик (октябрь 2026)

Градиент `#59171b → #fed7b8`. Тёплый «закатный» люкс на светлом фоне.

| Роль | Цвет |
|---|---|
| Фон страницы | `#fff4ec` → `#fffaf6` (вертикальный градиент) |
| Текст | `#3d0f12` |
| Основной (вино) | `#59171b` |
| Средний тон | `#8e3a36`, `#a8473f` |
| Светлый (персик) | `#fed7b8` |
| Полосы разделов | `#fff0e5` |

Характер: заголовки Playfair Display 600, подписи над заголовками курсивом,
скругления 24 px, кнопки-«таблетки» с градиентом вино → терракота, карточки
без рамок на мягкой тёплой тени, первый экран — карточка в рамке со
скруглением 32 px и градиентом вино → персик, подвал — винный градиент с
персиковым текстом.

### Раскладки

- **Закат** — основная: первый экран в рамке, градиент из вина в персик.
- **Закатная шапка** — градиент уходит в шапку, первый экран на всю ширину без рамки.
- **Сумерки** — тёмно-винный первый экран с персиковым свечением, персиковые кнопки.
- **Сияние** — светлый первый экран, градиент от сливочного к персиковому, винный текст.
- **Бархат** — глубокий винный «бархат» с радиальной подсветкой и мелкой точечной фактурой.
- **Диагональ** — первый экран разрезан диагональю: слева светлый персик с текстом, справа вино с линзой.
- **Нежный** — без рамки и тяжёлых теней, тонкие персиковые обводки у карточек, меньше скругления.

### Токены основной раскладки

```json
{
  "scheme": "light",
  "page": "linear-gradient(180deg, #fff4ec 0%, #fffaf6 60%)",
  "surface": "#ffffff",
  "display": "var(--font-playfair), Georgia, serif",
  "display_weight": "600",
  "display_style": "normal",
  "display_track": "-0.01em",
  "display_case": "none",
  "subdisplay": "var(--font-sans)",
  "subdisplay_weight": "600",
  "hero_title_size": "clamp(2.2rem, 4.6vw, 3.4rem)",
  "eyebrow_track": "0.02em",
  "eyebrow_style": "italic",
  "eyebrow_case": "none",
  "radius": "24px",
  "control_radius": "16px",
  "btn_radius": "9999px",
  "field_radius": "9999px",
  "btn_case": "none",
  "btn_track": "0",
  "cta_border": "0 solid transparent",
  "cta_hover_ink": "var(--k-cta-ink)",
  "cta_shadow": "0 14px 28px -14px rgb(89 23 27 / 0.6)",
  "cta_shadow_hover": "0 16px 32px -12px rgb(89 23 27 / 0.65)",
  "ghost_border": "1px solid rgb(89 23 27 / 0.25)",
  "ghost_bg": "transparent",
  "ghost_shadow": "none",
  "ghost_hover_line": "#59171b",
  "ghost_hover_bg": "rgb(254 215 184 / 0.25)",
  "badge_radius": "9999px",
  "card_border": "0 solid transparent",
  "card_bg": "var(--k-surface)",
  "card_blur": "none",
  "card_shadow": "0 2px 6px rgb(89 23 27 / 0.05), 0 20px 40px -24px rgb(89 23 27 / 0.3)",
  "card_shadow_hover": "0 2px 6px rgb(89 23 27 / 0.06), 0 28px 50px -22px rgb(89 23 27 / 0.42)",
  "card_border_hover": "0 solid transparent",
  "pop_shadow": "0 18px 40px -18px rgb(0 0 0 / 0.35)",
  "photo_inset": "10px 10px 0",
  "photo_radius": "18px",
  "photo_bg": "linear-gradient(180deg, #ffffff, #fff1e7)",
  "photo_blend": "multiply",
  "photo_shadow": "none",
  "section_line": "transparent",
  "band": "#fff0e5",
  "header_line": "rgb(89 23 27 / 0.1)",
  "header_shadow": "none",
  "header_scheme": "light",
  "hero_width": "min(1216px, calc(100% - 2rem))",
  "hero_margin": "1.25rem auto 0",
  "hero_border": "0 solid transparent",
  "hero_radius": "32px",
  "hero_shadow": "0 40px 70px -40px rgb(89 23 27 / 0.7)",
  "hero_scheme": "dark",
  "hero_pattern": "none",
  "hero_pattern_size": "auto",
  "hero_pattern_mask": "none",
  "hero_pad": "3rem",
  "hero_glow": "radial-gradient(30rem 20rem at 80% 50%, rgb(255 244 236 / 0.35), transparent 70%)",
  "footer_line": "transparent",
  "footer_scheme": "dark",
  "lens_bezel": "conic-gradient(from 210deg, #fed7b8, #ffffff 12%, #e8b597 30%, #fff4ec 48%, #d98a73 64%, #ffffff 80%, #fed7b8)",
  "chip_border": "0 solid transparent",
  "chip_radius": "9999px",
  "chip_bg": "rgb(255 244 236 / 0.92)",
  "chip_ink": "#59171b",
  "chip_shadow": "0 10px 24px -12px rgb(89 23 27 / 0.6)",
  "features_pad": "2rem",
  "features_border": "0 solid transparent",
  "features_bg": "#ffffff",
  "features_shadow": "0 24px 50px -30px rgb(89 23 27 / 0.35)",
  "features_divider": "rgb(89 23 27 / 0.08)",
  "icon_radius": "9999px",
  "icon_bg": "linear-gradient(135deg, #fed7b8, #f3b08f)",
  "icon_ink": "#59171b",
  "icon_shadow": "none",
  "bg": "#fff4ec",
  "ink": "#3d0f12",
  "accent": "#59171b",
  "glow": "254 170 140",
  "cta": "linear-gradient(120deg, #59171b 0%, #a8473f 100%)",
  "cta_ink": "#fff4ec",
  "cta_hover": "linear-gradient(120deg, #3d0f12 0%, #59171b 100%)",
  "eyebrow": "#a8473f",
  "logo": "#59171b",
  "underline": "linear-gradient(90deg, #a8473f, #fed7b8)",
  "badge_bg": "linear-gradient(120deg, #59171b, #a8473f)",
  "badge_ink": "#fff4ec",
  "header_solid": "#fff4ec",
  "header_bg": "rgb(255 244 236 / 0.9)",
  "header_ink": "#3d0f12",
  "hero_solid": "#7a2c2a",
  "hero_ink": "#fff4ec",
  "hero_bg": "linear-gradient(120deg, #59171b 0%, #8e3a36 40%, #d98a73 75%, #fed7b8 100%)",
  "footer_solid": "#59171b",
  "footer_bg": "linear-gradient(180deg, #59171b, #3d0f12)",
  "footer_ink": "#fed7b8",
  "footer_logo": "#fed7b8"
}
```

### Отличия остальных раскладок от основной

#### Закатная шапка (`bar`)

```json
{
  "header_solid": "#8e3a36",
  "header_bg": "linear-gradient(90deg, #59171b 0%, #8e3a36 60%, color-mix(in srgb, #8e3a36 70%, #fed7b8) 100%)",
  "header_ink": "#fffaf6",
  "header_line": "transparent",
  "header_scheme": "dark",
  "logo": "#fffaf6",
  "hero_bg": "linear-gradient(120deg, color-mix(in srgb, #59171b 92%, #8e3a36) 0%, #8e3a36 50%, color-mix(in srgb, #fed7b8 80%, #ffffff) 100%)",
  "hero_width": "auto",
  "hero_margin": "0",
  "hero_radius": "0",
  "hero_border": "0 solid transparent",
  "hero_shadow": "none"
}
```

#### Сумерки (`dusk`)

```json
{
  "hero_solid": "#59171b",
  "hero_bg": "radial-gradient(30rem 20rem at 85% 30%, color-mix(in srgb, #fed7b8 45%, transparent), transparent 70%), radial-gradient(24rem 16rem at 0% 100%, color-mix(in srgb, #8e3a36 50%, transparent), transparent 70%), #59171b",
  "cta": "linear-gradient(120deg, #fed7b8 0%, color-mix(in srgb, #fed7b8 70%, #8e3a36) 100%)",
  "cta_ink": "#3d0f12",
  "cta_hover": "#fed7b8",
  "badge_bg": "#59171b",
  "icon_bg": "#59171b",
  "icon_ink": "#fed7b8"
}
```

#### Сияние (`glow`)

```json
{
  "hero_solid": "#fde4d0",
  "hero_bg": "radial-gradient(30rem 20rem at 82% 40%, rgb(255 255 255 / 0.7), transparent 70%), linear-gradient(120deg, #fff4ec 0%, #fde4d0 55%, #fed7b8 100%)",
  "hero_ink": "#3d0f12",
  "hero_scheme": "light",
  "hero_glow": "radial-gradient(26rem 18rem at 82% 45%, rgb(168 71 63 / 0.18), transparent 70%)",
  "hero_shadow": "0 30px 60px -40px rgb(89 23 27 / 0.35)",
  "underline": "linear-gradient(90deg, #a8473f, #e8866a)",
  "chip_bg": "#59171b",
  "chip_ink": "#fff4ec"
}
```

#### Бархат (`velvet`)

```json
{
  "hero_solid": "#5c1d20",
  "hero_bg": "radial-gradient(60% 90% at 70% 45%, #8e3a36 0%, #59171b 55%, #3d0f12 100%)",
  "hero_glow": "radial-gradient(22rem 16rem at 80% 45%, rgb(254 215 184 / 0.3), transparent 70%)",
  "hero_pattern": "radial-gradient(rgb(254 215 184 / 0.07) 1px, transparent 1.4px)",
  "hero_pattern_size": "6px 6px",
  "hero_pattern_mask": "radial-gradient(ellipse at 70% 50%, black, transparent 80%)",
  "cta": "linear-gradient(120deg, #fed7b8 0%, #f3a988 100%)",
  "cta_ink": "#3d0f12",
  "cta_hover": "#fed7b8"
}
```

#### Диагональ (`diagonal`)

```json
{
  "hero_solid": "#fde4d0",
  "hero_ink": "#3d0f12",
  "hero_scheme": "light",
  "hero_bg": "linear-gradient(105deg, transparent 0 58%, #fed7b8 58% 58.6%, transparent 58.6%), linear-gradient(105deg, #fff1e6 0 58%, #59171b 58% 100%)",
  "hero_glow": "radial-gradient(22rem 16rem at 82% 50%, rgb(254 215 184 / 0.35), transparent 70%)",
  "hero_width": "auto",
  "hero_margin": "0",
  "hero_radius": "0",
  "hero_border": "0 solid transparent",
  "hero_shadow": "none",
  "chip_bg": "#fed7b8",
  "chip_ink": "#59171b"
}
```

#### Нежный (`tender`)

```json
{
  "radius": "14px",
  "photo_radius": "10px",
  "card_border": "1px solid rgb(254 215 184 / 0.9)",
  "card_shadow": "none",
  "card_shadow_hover": "0 0 0 1px #e8866a",
  "card_border_hover": "1px solid #e8866a",
  "hero_solid": "#fff4ec",
  "hero_bg": "linear-gradient(180deg, #fff4ec 0%, #fde8d8 100%)",
  "hero_ink": "#3d0f12",
  "hero_scheme": "light",
  "hero_glow": "radial-gradient(28rem 18rem at 82% 45%, rgb(232 134 106 / 0.2), transparent 70%)",
  "hero_width": "auto",
  "hero_margin": "0",
  "hero_radius": "0",
  "hero_border": "0 solid transparent",
  "hero_shadow": "none",
  "features_shadow": "none",
  "features_border": "1px solid rgb(254 215 184 / 0.9)",
  "chip_bg": "#ffffff",
  "chip_ink": "#59171b",
  "cta_shadow": "none",
  "cta_shadow_hover": "none"
}
```
