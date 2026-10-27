import { useState } from "react";
import { View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { formatIsoDate } from "@/domain/buyDate";
import { layoutCandleChart } from "@/domain/candles";
import type { Candle } from "@/domain/types";
import { colors, fonts, pnlColors } from "./theme";

type Props = {
  candles: Candle[];
  /** 成本價（買入價）：畫一條虛線 */
  costPrice?: number;
  /** 買入日期（ISO）：在那天的 K 棒下方標 ▲ */
  buyDate?: string;
  height?: number;
  /** 給螢幕閱讀器的整張圖說明 */
  accessibilityLabel: string;
};

const AXIS_WIDTH = 56;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 44;
/** 買入點用深藍：跟紅 K、綠 K 都分得開 */
const BUY_COLOR = colors.secondary;

/**
 * 日 K 線圖。座標全部由 domain 的 layoutCandleChart 算，這裡只負責照著畫。
 * 台股慣例紅 K 漲、綠 K 跌；成本虛線用金色；買入點用深藍 ▲ 加「買入」字樣，不靠顏色單獨傳達。
 * 寬度跟著容器（onLayout），量到之前不畫。
 */
export function CandleChart({ candles, costPrice, buyDate, height = 240, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const layout =
    width > 0
      ? layoutCandleChart(candles, {
          width,
          height,
          axisWidth: AXIS_WIDTH,
          paddingTop: PADDING_TOP,
          paddingBottom: PADDING_BOTTOM,
          costPrice,
          buyDate,
        })
      : null;
  const plotBottom = height - PADDING_BOTTOM;

  return (
    <View
      testID="candle-chart"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
    >
      {layout ? (
        <Svg width={width} height={height}>
          {layout.ticks.map((tick, i) => (
            <G key={`tick-${i}`}>
              <Line
                x1={0}
                x2={layout.plotRight}
                y1={tick.y}
                y2={tick.y}
                stroke={colors.border}
                strokeWidth={1}
              />
              <SvgText
                x={layout.plotRight + 6}
                y={tick.y + 4}
                fontSize={11}
                fontFamily={fonts.regular}
                fill={colors.mutedForeground}
              >
                {formatPrice(tick.price)}
              </SvgText>
            </G>
          ))}

          {layout.buyPoint ? (
            <Line
              x1={layout.buyPoint.x}
              x2={layout.buyPoint.x}
              y1={PADDING_TOP}
              y2={plotBottom}
              stroke={BUY_COLOR}
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          ) : null}

          {layout.shapes.map((shape) => {
            const color = pnlColors[shape.direction];
            return (
              <G key={shape.candle.date}>
                <Line
                  x1={shape.x}
                  x2={shape.x}
                  y1={shape.wickTop}
                  y2={shape.wickBottom}
                  stroke={color}
                  strokeWidth={1}
                />
                <Rect
                  x={shape.bodyX}
                  y={shape.bodyTop}
                  width={shape.bodyWidth}
                  height={shape.bodyHeight}
                  fill={color}
                />
              </G>
            );
          })}

          {layout.costY !== null && costPrice !== undefined ? (
            <G>
              <Line
                x1={0}
                x2={layout.plotRight}
                y1={layout.costY}
                y2={layout.costY}
                stroke={colors.accent}
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <SvgText
                x={layout.plotRight + 6}
                y={layout.costY + 4}
                fontSize={11}
                fontFamily={fonts.semibold}
                fill={colors.accent}
              >
                {formatPrice(costPrice)}
              </SvgText>
            </G>
          ) : null}

          {layout.buyPoint ? (
            <G testID="candle-buy-marker">
              <Path
                d={trianglePath(layout.buyPoint.x, layout.buyPoint.lowY + 4)}
                fill={BUY_COLOR}
              />
              <SvgText
                x={layout.buyPoint.x}
                y={layout.buyPoint.lowY + 28}
                fontSize={11}
                fontFamily={fonts.semibold}
                fill={BUY_COLOR}
                textAnchor="middle"
              >
                買入
              </SvgText>
            </G>
          ) : null}

          {layout.dateLabels.map((label, i) => (
            <SvgText
              key={`date-${i}`}
              x={label.x}
              y={height - 4}
              fontSize={10}
              fontFamily={fonts.regular}
              fill={colors.mutedForeground}
              textAnchor={i === 0 ? "start" : i === layout.dateLabels.length - 1 ? "end" : "middle"}
            >
              {formatIsoDate(label.date).slice(5)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** 往上指的三角形，尖端在 (x, tipY) */
function trianglePath(x: number, tipY: number): string {
  return `M ${x} ${tipY} L ${x - 6} ${tipY + 11} L ${x + 6} ${tipY + 11} Z`;
}

/** 價格刻度：千分位；100 以下留兩位小數 */
export function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: price < 100 ? 2 : 0,
    maximumFractionDigits: price < 100 ? 2 : 0,
  });
}
