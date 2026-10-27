import type { PnlDirection } from "@/domain/types";

/**
 * 設計 token。來源：design-system/stock-pnl/MASTER.md（ui-ux-pro-max 產生）
 * 風格：Minimalism & Swiss。信任感深藍 + 金色 CTA。
 * 畫面裡不要寫死色碼，一律從這裡拿。
 */
export const colors = {
  primary: "#0F172A",
  onPrimary: "#FFFFFF",
  secondary: "#1E3A8A",
  accent: "#A16207",
  onAccent: "#FFFFFF",
  /** 金色的淺底：提示標籤（例如「請確認」）用 */
  accentSurface: "#FEF3C7",
  background: "#F8FAFC",
  foreground: "#020617",
  card: "#FFFFFF",
  cardForeground: "#020617",
  muted: "#E8ECF1",
  mutedForeground: "#475569",
  border: "#E2E8F0",
  destructive: "#DC2626",
  destructiveSurface: "#FEF2F2",
  ring: "#0F172A",
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

/** 間距：4/8 節奏（MASTER.md density 5/10） */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
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
  display: 40,
};

/** 觸控目標最小高度：iOS 44pt / Android 48dp，取 48 */
export const touchTarget = 48;

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
};
