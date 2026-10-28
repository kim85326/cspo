import { useState } from "react";
import { type GestureResponderEvent, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { formatIsoDate } from "@/domain/buyDate";
import { assetIndexAtX, formatAxisAmount, layoutAssetChart, type AssetHistoryPoint } from "@/domain/assetHistory";
import { chartColors, colors, fonts } from "./theme";

type Props = {
  points: AssetHistoryPoint[];
  /** 目前選到第幾天；null 不畫十字線 */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  height?: number;
  /** 給螢幕閱讀器的整張圖說明 */
  accessibilityLabel: string;
};

const AXIS_WIDTH = 52;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;

/**
 * 資產走勢圖（Story 023）：總市值（深藍實線）與累計投入（金色虛線）。
 * 座標由 domain 的 layoutAssetChart 算，這裡只照著畫；寫法比照 CandleChart。
 * - 兩條線用實線／虛線區分，圖例另有文字，不靠顏色單獨傳達。
 * - 點一下或按住拖曳選到那一天（畫十字線，數字由外層顯示）；放開手指讓外層 ScrollView 接手上下捲動。
 */
export function AssetHistoryChart({ points, selectedIndex, onSelect, height = 220, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const layout =
    width > 0
      ? layoutAssetChart(points, {
          width,
          height,
          axisWidth: AXIS_WIDTH,
          paddingTop: PADDING_TOP,
          paddingBottom: PADDING_BOTTOM,
        })
      : null;

  const select = (event: GestureResponderEvent) => {
    if (!layout) return;
    const index = assetIndexAtX(layout, event.nativeEvent.locationX);
    if (index !== null) onSelect(index);
  };

  const selected = layout && selectedIndex !== null && points[selectedIndex] ? points[selectedIndex] : null;
  const selectedX = layout && selectedIndex !== null ? layout.xs[selectedIndex] : 0;

  return (
    <View
      testID="asset-history-chart"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onResponderGrant={select}
      onResponderMove={select}
      onResponderTerminationRequest={() => true}
    >
      {layout ? (
        <Svg width={width} height={height} pointerEvents="none">
          {layout.ticks.map((tick, i) => (
            <G key={`tick-${i}`}>
              <Line x1={0} x2={layout.plotRight} y1={tick.y} y2={tick.y} stroke={colors.border} strokeWidth={1} />
              <SvgText
                x={layout.plotRight + 6}
                y={tick.y + 4}
                fontSize={11}
                fontFamily={fonts.regular}
                fill={colors.mutedForeground}
              >
                {formatAxisAmount(tick.value)}
              </SvgText>
            </G>
          ))}

          <Path
            testID="asset-invested-line"
            d={layout.investedPath}
            stroke={chartColors.cost}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            testID="asset-market-value-line"
            d={layout.marketValuePath}
            stroke={chartColors.line}
            strokeWidth={2}
            strokeLinejoin="round"
            fill="none"
          />

          {selected ? (
            <G testID="asset-chart-crosshair">
              <Line
                x1={selectedX}
                x2={selectedX}
                y1={layout.plotTop}
                y2={layout.plotBottom}
                stroke={chartColors.crosshair}
                strokeWidth={1}
              />
              <Circle
                cx={selectedX}
                cy={layout.valueToY(selected.invested)}
                r={3.5}
                fill={colors.card}
                stroke={chartColors.cost}
                strokeWidth={2}
              />
              <Circle
                cx={selectedX}
                cy={layout.valueToY(selected.marketValue)}
                r={4}
                fill={colors.card}
                stroke={chartColors.line}
                strokeWidth={2}
              />
            </G>
          ) : null}

          {layout.dateLabels.map((label, i) => (
            <SvgText
              key={`date-${i}`}
              x={label.x}
              y={height - 6}
              fontSize={10}
              fontFamily={fonts.regular}
              fill={colors.mutedForeground}
              textAnchor={i === 0 ? "start" : i === layout.dateLabels.length - 1 ? "end" : "middle"}
            >
              {formatIsoDate(label.date).slice(2)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
