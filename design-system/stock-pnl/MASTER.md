# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Stock PnL
**Generated:** 2026-10-27 13:12:57
**Category:** Banking/Traditional Finance
**Design Dials:** Motion 3/10 (Subtle) | Density 5/10 (Standard)

---

## App 實作規則（React Native，2026-10-28 UI 升級）

下面的 CSS 規格是 ui-ux-pro-max 產生的網頁版參考；app 實際用的值在 `src/ui/theme.ts`，元件在 `src/ui/`。兩邊不一致時以這一節和 theme.ts 為準。

### 品牌色（取自 app icon）

| 用途 | token | 值 |
|------|-------|----|
| 主視覺卡（首頁總覽、Pro 介紹）、分頁列「新增」 | `colors.brand` | `#172554` |
| 深藍底上的次要文字 | `colors.onBrandMuted` | `#B4C2E0`（對 brand ≥ 4.5:1） |
| 深藍底上的分隔線 | `colors.brandBorder` | `#2A3A6E` |
| 金色記號（主視覺卡左上短線、衛星圓點、Pro 皇冠） | `colors.gold` | `#EAB308`，只當裝飾，不當白底文字色 |
| 主要按鈕 | `colors.accent` | `#A16207`（白字 ≥ 4.5:1） |

### 漲跌色

- 白底：`pnlColors` 漲 `#C62828`、跌 `#2E7D32`、平 `#475569`。
- 深藍底：`pnlColorsOnBrand` 漲 `#FF8A80`、跌 `#6EE7A0`（對 brand ≥ 4.5:1）。
- 淺底標籤：`pnlSurfaces`。
- 方向一律用 `DirectionIcon`（實心三角）＋ `+`／`-` 號＋「賺了／虧了」文字，不只靠顏色。不要再用 ▲▼ 字元。
- 交易畫面的「買入／賣出」沿用同一組：買紅、賣綠（台股券商慣例）。

### 字級（`type`）

| token | 用途 |
|-------|------|
| `display` 40/48 bold 等寬 | 首頁總報酬 |
| `headline` 28/36 bold 等寬 | 單一持股總報酬、Pro 標題 |
| `title` 18/26 semibold | 區塊標題、卡片標題（`cardTitle`） |
| `bodyStrong` / `body` 16/24 | 內文 |
| `label` 14/20 | 欄位標籤、次要文字 |
| `caption` 12/16 | 註解、日期 |
| `numeric` / `numericSm` / `numericLg` | 金額、股數、百分比，一律 `tabular-nums` |

### 版面與元件

- 頁面：`surfaceStyles.screen` + `surfaceStyles.screenContent`（左右 16、區塊間距 16、最大寬 640）。
- 卡片：`<Card>`（JSX）或 `...cardSurface`（StyleSheet）——圓角 16、細框、淡陰影。不要再自己寫 `borderRadius: radius.md, borderWidth: 1`。
- 按鈕：`<Button>`。一頁只有一個 primary（金色）；次要用 secondary（深藍框）或 tonal（淺灰）。按下透明度 `pressedOpacity`（0.75），不縮放、不位移。
- 進到別頁的入口：`<LinkRow>`（圖示 + 標題 + ›），不要用「文字 ›」連結。
- 提示：`<Notice tone>`（warning／error／info／success），左邊有圖示。
- 空狀態：`<EmptyState icon title message>` + 動作按鈕。
- 載入：`<SkeletonCard>`／`<SkeletonBlock>` 先佔版面，不要只放轉圈圈（按鈕裡的轉圈可以保留）。
- 圖示：`<Icon>`（Lucide 路徑，`react-native-svg` 畫），線寬 2、尺寸 `iconSize` 16／20／24。不要用 emoji 或 ✓ ✕ › ＋ 這類字元當圖示。
- 觸控：最小 48（`touchTarget`）；小按鈕用 `hitSlop` 補足。

### 導覽

- 底部分頁（`src/app/(tabs)`）：總覽／持股／新增／設定。「新增」是動作，按下 push `/transaction/new`。
- 其他頁蓋在分頁上（root Stack），標題在 `src/app/_layout.tsx` 先給，避免載入中閃出路由名稱。

### 深色模式

目前不支援：`app.json` 的 `userInterfaceStyle` 是 `light`，改它會讓 fingerprint 變、OTA 送不到已安裝的 build 5。
token 已經集中在 theme.ts，之後要做時：打新 APK 時把 `userInterfaceStyle` 改 `automatic`，theme 改成依 `useColorScheme()` 回傳兩組色。

### 2026-10-28 稽核：最影響專業感的 10 個問題（都已處理）

1. 沒有主要導覽：只有 Stack，設定是首頁右上的文字，持股要從首頁中段連結進去 → 底部分頁。
2. 沒有圖示系統：▲▼ › ＋ ✕ ✓ 🔒 字元當圖示，各平台字型不同、對不齊 → Lucide SVG 圖示。
3. 首頁沒有主視覺：整體卡跟其他白卡一樣，品牌深藍金色只出現在按鈕 → 深藍總覽卡 + 金色記號。
4. 卡片樣式不一致：圓角 12／16 混用、有的有陰影有的沒有、頁面左右留白 16／24 混用 → `Card`／`cardSurface`、`screenContent`。
5. 按鈕各頁各寫一份：字級 16／18、按下透明度 0.6／0.7／0.85 不一 → `Button`。
6. 損益顏色沒貫徹：首頁摘要的已實現／未實現是黑字，持股單頁卻有上色 → 一律依正負上色。
7. 載入只有轉圈圈，資料到了版面跳動 → 骨架畫面。
8. 空狀態、錯誤提示各頁長得不一樣 → `EmptyState`、`Notice`。
9. 標題閃出路由名稱（`holdings/[symbol]`）、分頁與子頁標題字級不一 → root Stack 先給標題、統一 header 樣式。
10. 字級階層亂：卡片標題有 14 灰也有 16 黑，數字有的沒等寬 → `type` 字級階層、數字一律等寬。

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0F172A` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#1E3A8A` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#A16207` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F4F6FA`（2026-10-28 從 `#F8FAFC` 調深一階，白卡片才分得出來） | `--color-background` |
| Foreground | `#020617` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#020617` | `--color-card-foreground` |
| Muted | `#E8ECF1` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#E2E8F0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#0F172A` | `--color-ring` |

**Color Notes:** Trust navy + premium gold [Accent adjusted from #CA8A04]

### Typography

- **Heading Font:** IBM Plex Sans
- **Body Font:** IBM Plex Sans
- **Mood:** financial, trustworthy, professional, corporate, banking, serious
- **Google Fonts:** [IBM Plex Sans + IBM Plex Sans](https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 5/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #A16207;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0F172A;
  border: 2px solid #0F172A;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #0F172A;
  outline: none;
  box-shadow: 0 0 0 3px #0F172A20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Minimalism & Swiss Style

**Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential

**Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools

**Key Effects:** Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Page Pattern

**Pattern Name:** Trust & Authority + Conversion

- **Conversion Strategy:** Security badges. Case studies. Transparent pricing. Low-friction form. Provide pause/stop and stop the logo carousel on focus, hover, and reduced motion. Previous/next controls provide the keyboard equivalent; pause offscreen/hidden and render a static logo set under reduced motion.
- **CTA Placement:** Contact Sales / Get Quote (primary) + Nav
- **Section Order:** Hero (mission/credibility) > Proof (logos, certs, stats) > Solution overview > Clear CTA path

---

## Motion

**Scroll Reveal** (Subtle) — Trigger: scroll (viewport enter) | Duration: 300-400ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger); Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep the y offset small (8-16px) so it reads as a fade, not a slide
- ❌ Don't reveal below-the-fold content needed for SEO/crawlers as invisible-by-default without a no-JS fallback
- ⚡ toggleActions 'play none none reverse' avoids re-triggering on every scroll direction change

---

## Anti-Patterns (Do NOT Use)

- ❌ Playful design
- ❌ Poor security UX
- ❌ AI purple/pink gradients

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
