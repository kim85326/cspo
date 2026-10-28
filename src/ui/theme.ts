import type { TextStyle } from "react-native";
import type { PnlDirection } from "@/domain/types";

/**
 * 設計 token。來源：design-system/stock-pnl/MASTER.md（ui-ux-pro-max 產生，2026-10-28 UI 升級時補齊）
 * 風格：Minimalism & Swiss。品牌色取自 app icon：深藍漸層 + 金色箭頭。
 * 畫面裡不要寫死色碼、字級、圓角，一律從這裡拿。
 */
export const colors = {
  primary: "#0F172A",
  onPrimary: "#FFFFFF",
  secondary: "#1E3A8A",
  /** 深藍的淺底：ETF 標籤用 */
  secondarySurface: "#DBEAFE",
  accent: "#A16207",
  onAccent: "#FFFFFF",
  /** 金色的淺底：提示標籤（例如「請確認」）用 */
  accentSurface: "#FEF3C7",
  background: "#F4F6FA",
  foreground: "#020617",
  card: "#FFFFFF",
  cardForeground: "#020617",
  muted: "#E8ECF1",
  mutedForeground: "#475569",
  /** 比 mutedForeground 再淡一階：只用在輔助說明、不承載資訊的文字（白底對比 ≥ 4.5:1） */
  subtleForeground: "#64748B",
  border: "#E2E8F0",
  destructive: "#DC2626",
  destructiveSurface: "#FEF2F2",
  ring: "#0F172A",
  /** 品牌主視覺（首頁總覽卡、分頁列「新增」）：icon 的深藍 */
  brand: "#172554",
  brandDeep: "#0F172A",
  onBrand: "#FFFFFF",
  /** 深藍底上的次要文字（對 brand 對比 ≥ 4.5:1） */
  onBrandMuted: "#B4C2E0",
  /** 深藍底上的分隔線 */
  brandBorder: "#2A3A6E",
  /** icon 的金色，只當裝飾與強調（深藍底上），白底文字用 accent */
  gold: "#EAB308",
  /** 骨架畫面的底色 */
  skeleton: "#E2E8F0",
};

/**
 * 台股慣例：漲紅、跌綠、平盤灰。
 * 三個值在白底上的對比都 ≥ 4.5:1；顏色之外還有「賺了／虧了」文字與 ▲▼ 符號，不靠顏色單獨傳達。
 */
export const pnlColors: Record<PnlDirection, string> = {
  up: "#C62828",
  down: "#2E7D32",
  flat: colors.mutedForeground,
};

/** 深藍主視覺卡上的漲跌色：亮一階，對 colors.brand 的對比 ≥ 4.5:1 */
export const pnlColorsOnBrand: Record<PnlDirection, string> = {
  up: "#FF8A80",
  down: "#6EE7A0",
  flat: colors.onBrandMuted,
};

/** 漲跌的淺底（標籤、徽章用） */
export const pnlSurfaces: Record<PnlDirection, string> = {
  up: "#FDECEC",
  down: "#E8F5EA",
  flat: colors.muted,
};

/**
 * 走勢圖（Story 016）專用色。
 * 均線避開紅、綠、金（成本）、深藍（買入點），另用實線／虛線區分，不靠顏色單獨傳達。
 * 賺賠區直接用 pnlColors 加低透明度（zoneOpacity），不另訂色碼。
 */
export const chartColors = {
  /** 收盤價折線 */
  line: colors.primary,
  ma5: "#7C3AED",
  ma20: "#0E7490",
  buy: colors.secondary,
  cost: colors.accent,
  crosshair: colors.mutedForeground,
  zoneOpacity: 0.07,
};

/** 間距：4/8 節奏（MASTER.md density 5/10） */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
};

/** 畫面左右留白：所有頁面一致 */
export const screenPadding = space.md;

/** 內容最大寬度（平板、網頁不要拉滿） */
export const contentMaxWidth = 640;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  /** 膠囊形：標籤、徽章 */
  pill: 999,
};

/** 字型：IBM Plex Sans（數字與英文）；中文字自動回退系統字型 */
export const fonts = {
  regular: "IBMPlexSans_400Regular",
  medium: "IBMPlexSans_500Medium",
  semibold: "IBMPlexSans_600SemiBold",
  bold: "IBMPlexSans_700Bold",
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  "2xl": 28,
  display: 40,
};

/** 數字一律等寬，上下列的位數才對得齊 */
const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

/**
 * 字級階層。畫面用 `...type.title` 展開再加顏色，不要自己湊 fontFamily + fontSize。
 * - display / headline：大數字（總報酬）
 * - title：卡片、區塊標題；overline：區塊上方的小標
 * - body / bodyStrong：內文；label：欄位標籤；caption：註解
 * - numeric*：金額、股數、百分比（等寬）
 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: fontSize.display, lineHeight: 48, ...tabular },
  headline: { fontFamily: fonts.bold, fontSize: fontSize["2xl"], lineHeight: 36, ...tabular },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.lg, lineHeight: 26 },
  overline: { fontFamily: fonts.semibold, fontSize: fontSize.xs, lineHeight: 16, letterSpacing: 0.4 },
  body: { fontFamily: fonts.regular, fontSize: fontSize.md, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: fontSize.md, lineHeight: 24 },
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: fontSize.xs, lineHeight: 16 },
  numeric: { fontFamily: fonts.semibold, fontSize: fontSize.md, lineHeight: 22, ...tabular },
  numericSm: { fontFamily: fonts.medium, fontSize: fontSize.sm, lineHeight: 20, ...tabular },
  numericLg: { fontFamily: fonts.bold, fontSize: fontSize.lg, lineHeight: 24, ...tabular },
} satisfies Record<string, TextStyle>;

/** 圖示尺寸 */
export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
};

/** 觸控目標最小高度：iOS 44pt / Android 48dp，取 48 */
export const touchTarget = 48;

/** 按下去的回饋：透明度一致 */
export const pressedOpacity = 0.75;

export const shadow = {
  sm: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
};
