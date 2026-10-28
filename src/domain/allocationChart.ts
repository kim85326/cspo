import type { AllocationSlice } from "./allocation";

/**
 * 配置圓餅圖（P2-07、Story 028）的畫圖用計算：把占比換成甜甜圈的每一段弧。
 * 比例本身來自 allocation.ts 的 computeAllocation，這裡不重算。
 */

/** 每檔持股最多畫幾塊，其餘合成「其他」，免得顏色多到分不出來 */
export const MAX_HOLDING_SLICES = 6;

export const OTHERS_KEY = "其他";

/**
 * 每檔持股的占比：前 MAX_HOLDING_SLICES − 1 檔照列，剩下的合成一塊「其他」。
 * 剛好 MAX_HOLDING_SLICES 檔以內就全部照列。輸入已依市值由大到小排好（computeAllocation 的 byHolding）。
 */
export function groupHoldingSlices<T extends AllocationSlice<string>>(
  slices: readonly T[],
): (T | AllocationSlice<typeof OTHERS_KEY>)[] {
  if (slices.length <= MAX_HOLDING_SLICES) return [...slices];
  const shown = slices.slice(0, MAX_HOLDING_SLICES - 1);
  const rest = slices.slice(MAX_HOLDING_SLICES - 1);
  return [
    ...shown,
    {
      key: OTHERS_KEY,
      marketValue: rest.reduce((sum, s) => sum + s.marketValue, 0),
      ratio: rest.reduce((sum, s) => sum + s.ratio, 0),
    },
  ];
}

/** 甜甜圈的一段：從 12 點鐘方向順時針，角度以弧度表示 */
export type Arc = { startAngle: number; endAngle: number };

/**
 * 依序把占比排成首尾相接的弧，最後一段補到剛好一整圈（浮點誤差不留縫）。
 * 占比 0 的那塊回傳 null（不畫）。
 */
export function arcsOf(ratios: readonly number[]): (Arc | null)[] {
  const total = ratios.reduce((sum, r) => sum + r, 0);
  if (total <= 0) return ratios.map(() => null);
  const lastDrawn = ratios.reduce((last, r, i) => (r > 0 ? i : last), -1);
  let angle = 0;
  return ratios.map((r, i) => {
    if (r <= 0) return null;
    const startAngle = angle;
    angle = i === lastDrawn ? 2 * Math.PI : angle + (r / total) * 2 * Math.PI;
    return { startAngle, endAngle: angle };
  });
}

/** 一整圈（只有一種類型，例如全部都是核心）時，SVG 的弧畫不出來，要改畫整個圓環 */
export function isFullCircle(arc: Arc): boolean {
  return arc.endAngle - arc.startAngle >= 2 * Math.PI - 1e-9;
}

/**
 * 甜甜圈一段的 SVG path（外圓弧 → 內圓弧）。cx、cy 是圓心；outer、inner 是內外半徑。
 * 不能用在整圈（起點終點重合會畫不出來），整圈請用 isFullCircle 判斷後畫兩個圓。
 */
export function donutSegmentPath(arc: Arc, cx: number, cy: number, outer: number, inner: number): string {
  const point = (radius: number, angle: number) => {
    // 0 在 12 點鐘、順時針：x = sin、y = −cos
    const x = cx + radius * Math.sin(angle);
    const y = cy - radius * Math.cos(angle);
    return `${round(x)} ${round(y)}`;
  };
  const largeArc = arc.endAngle - arc.startAngle > Math.PI ? 1 : 0;
  return [
    `M ${point(outer, arc.startAngle)}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${point(outer, arc.endAngle)}`,
    `L ${point(inner, arc.endAngle)}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${point(inner, arc.startAngle)}`,
    "Z",
  ].join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
