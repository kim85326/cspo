import type { ReactNode } from "react";
import { View, type ColorValue } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";
import { colors, iconSize } from "./theme";

/**
 * 圖示：Lucide（ISC 授權）的路徑，用已經在用的 react-native-svg 畫。
 * 不用 @expo/vector-icons：SDK 58 沒有內建它，裝新套件會動到 package.json；SVG 這樣就不會影響 OTA。
 * 一律 24×24 viewBox、線寬 2、圓角端點，同一層級不混用實心與線框（caretUp／caretDown 是唯一的實心，用在漲跌）。
 * 圖示預設對輔助工具隱藏：旁邊都有文字。只有圖示的按鈕，由按鈕本身給 accessibilityLabel。
 */
const PATHS = {
  home: (
    <>
      <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <Path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  pieChart: (
    <>
      <Path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z" />
      <Path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    </>
  ),
  plus: (
    <>
      <Path d="M5 12h14" />
      <Path d="M12 5v14" />
    </>
  ),
  settings: (
    <>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  chevronRight: <Path d="m9 18 6-6-6-6" />,
  chevronLeft: <Path d="m15 18-6-6 6-6" />,
  alert: (
    <>
      <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <Path d="M12 9v4" />
      <Path d="M12 17h.01" />
    </>
  ),
  refresh: (
    <>
      <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <Path d="M21 3v5h-5" />
      <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <Path d="M8 16H3v5" />
    </>
  ),
  calculator: (
    <>
      <Rect width="16" height="20" x="4" y="2" rx="2" />
      <Line x1="8" x2="16" y1="6" y2="6" />
      <Line x1="16" x2="16" y1="14" y2="18" />
      <Path d="M16 10h.01" />
      <Path d="M12 10h.01" />
      <Path d="M8 10h.01" />
      <Path d="M12 14h.01" />
      <Path d="M8 14h.01" />
      <Path d="M12 18h.01" />
      <Path d="M8 18h.01" />
    </>
  ),
  x: (
    <>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </>
  ),
  check: <Path d="M20 6 9 17l-5-5" />,
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
    </>
  ),
  filePlus: (
    <>
      <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <Path d="M9 15h6" />
      <Path d="M12 18v-6" />
    </>
  ),
  lock: (
    <>
      <Rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  shield: (
    <>
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  crown: (
    <>
      <Path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <Path d="M5 21h14" />
    </>
  ),
  trendingUp: (
    <>
      <Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <Polyline points="16 7 22 7 22 13" />
    </>
  ),
  coins: (
    <>
      <Circle cx="8" cy="8" r="6" />
      <Path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <Path d="M7 6h1v4" />
      <Path d="m16.71 13.88.7.71-2.82 2.82" />
    </>
  ),
  arrowDownLeft: (
    <>
      <Path d="M17 7 7 17" />
      <Path d="M17 17H7V7" />
    </>
  ),
  arrowUpRight: (
    <>
      <Path d="M7 7h10v10" />
      <Path d="M7 17 17 7" />
    </>
  ),
  calendar: (
    <>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect width="18" height="18" x="3" y="4" rx="2" />
      <Path d="M3 10h18" />
    </>
  ),
  lineChart: (
    <>
      <Path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <Path d="m19 9-5 5-4-4-3 3" />
    </>
  ),
  image: (
    <>
      <Rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <Circle cx="9" cy="9" r="2" />
      <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  swords: (
    <>
      <Polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <Line x1="13" x2="19" y1="19" y2="13" />
      <Line x1="16" x2="20" y1="16" y2="20" />
      <Line x1="19" x2="21" y1="21" y2="19" />
      <Polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <Line x1="5" x2="9" y1="14" y2="18" />
      <Line x1="7" x2="4" y1="17" y2="20" />
      <Line x1="3" x2="5" y1="19" y2="21" />
    </>
  ),
  trash: (
    <>
      <Path d="M3 6h18" />
      <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </>
  ),
  inbox: (
    <>
      <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <Path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/** 實心三角：漲跌方向 */
const FILLED = {
  caretUp: <Path d="M12 5 21 19H3z" />,
  caretDown: <Path d="M12 19 3 5h18z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS | keyof typeof FILLED;

type Props = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
};

export function Icon({ name, size = iconSize.md, color = colors.foreground, strokeWidth = 2 }: Props) {
  const filled = name in FILLED;
  // 無障礙屬性放在外層 View：直接給 Svg 的話，網頁版會原封不動寫進 <svg>，造成 hydration 不一致
  return (
    <View aria-hidden pointerEvents="none" style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? color : "none"}
        stroke={filled ? "none" : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {filled ? FILLED[name as keyof typeof FILLED] : PATHS[name as keyof typeof PATHS]}
      </Svg>
    </View>
  );
}

/** 漲跌方向的實心三角；平盤不畫。意思已由「賺了／虧了」與 +／- 表達，所以對輔助工具隱藏 */
export function DirectionIcon({
  direction,
  size = iconSize.sm,
  color,
}: {
  direction: "up" | "down" | "flat";
  size?: number;
  color: ColorValue;
}) {
  if (direction === "flat") return null;
  return (
    <View testID={`direction-${direction}`} aria-hidden>
      <Icon name={direction === "up" ? "caretUp" : "caretDown"} size={size} color={color} />
    </View>
  );
}
