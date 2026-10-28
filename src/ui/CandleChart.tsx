import { useState } from "react";
import { type GestureResponderEvent, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { formatIsoDate } from "@/domain/buyDate";
import { indexAtX, layoutCandleChart, linePath } from "@/domain/candles";
import type { Candle } from "@/domain/types";
import type { ChartMode } from "@/hooks/useChartPrefs";
import { chartColors, colors, fonts, pnlColors } from "./theme";

type Props = {
  candles: Candle[];
  /** 折線（只連收盤價）或 K 棒 */
  mode: ChartMode;
  /** 成本價（買入價）：金色虛線，線上淡紅（賺）、線下淡綠（賠） */
  costPrice?: number;
  /** 買入日期（ISO）：在那天、成本價的位置畫一個點 */
  buyDate?: string;
  /** 分好幾筆買入時每一筆的日期與買入價（持股頁）：每筆一個小圓點 */
  buys?: { date: string; price: number }[];
  /**
   * P2-09 區間圖的高檔／低檔色帶（bandEdges 算的邊界）：高於 highAbove 是高檔區、不高於 lowUpTo 是低檔區。
   * 給了就不畫成本線上下的賺賠區，免得兩種底色疊在一起。
   */
  bands?: { highAbove: number; lowUpTo: number };
  /** 均線，長度跟 candles 一樣；不顯示就不給 */
  movingAverages?: { short: (number | null)[]; long: (number | null)[] };
  /** 目前選到第幾天（點圖或用前後按鈕切換）；null 不畫十字線 */
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
 * 走勢圖（折線／K 棒）。座標全部由 domain 的 layoutCandleChart 算，這裡只負責照著畫。
 * - 台股慣例紅 K 漲、綠 K 跌；成本線金色虛線；買入點深藍圓點加「買入」字樣，不靠顏色單獨傳達。
 * - 點一下或按住拖曳，選到那一天（畫十字線，詳細數字由外層顯示）。
 *   放開手指讓外層 ScrollView 接手（onResponderTerminationRequest），不會卡住上下捲動。
 * - 寬度跟著容器（onLayout），量到之前不畫。
 */
export function CandleChart({
  candles,
  mode,
  costPrice,
  buyDate,
  buys,
  bands,
  movingAverages,
  selectedIndex,
  onSelect,
  height = 220,
  accessibilityLabel,
}: Props) {
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
          buys,
          extraPrices: bands
            ? [bands.highAbove, bands.lowUpTo]
            : movingAverages ? [...movingAverages.short, ...movingAverages.long] : undefined,
        })
      : null;

  const select = (event: GestureResponderEvent) => {
    if (!layout) return;
    const index = indexAtX(layout, event.nativeEvent.locationX);
    if (index !== null) onSelect(index);
  };

  const maPath = (values: (number | null)[]) =>
    layout
      ? linePath(values.map((v, i) => (v === null ? null : { x: layout.shapes[i].x, y: layout.priceToY(v) })))
      : "";

  const selected = layout && selectedIndex !== null ? layout.shapes[selectedIndex] : undefined;
  const costY = layout?.costY ?? null;

  return (
    <View
      testID="candle-chart"
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
          {bands ? (
            <G testID="chart-level-bands">
              <Rect
                x={0}
                y={layout.plotTop}
                width={layout.plotRight}
                height={clamp(layout.priceToY(bands.highAbove) - layout.plotTop, 0, layout.plotBottom - layout.plotTop)}
                fill={chartColors.band}
                fillOpacity={chartColors.bandOpacity}
              />
              <Rect
                x={0}
                y={clamp(layout.priceToY(bands.lowUpTo), layout.plotTop, layout.plotBottom)}
                width={layout.plotRight}
                height={clamp(layout.plotBottom - layout.priceToY(bands.lowUpTo), 0, layout.plotBottom - layout.plotTop)}
                fill={chartColors.band}
                fillOpacity={chartColors.bandOpacity}
              />
              <SvgText x={4} y={layout.plotTop + 12} fontSize={10} fontFamily={fonts.medium} fill={colors.mutedForeground}>
                高檔區（前 20%）
              </SvgText>
              <SvgText x={4} y={layout.plotBottom - 4} fontSize={10} fontFamily={fonts.medium} fill={colors.mutedForeground}>
                低檔區（後 20%）
              </SvgText>
            </G>
          ) : costY !== null ? (
            <G testID="chart-pnl-zones">
              <Rect
                x={0}
                y={layout.plotTop}
                width={layout.plotRight}
                height={clamp(costY - layout.plotTop, 0, layout.plotBottom - layout.plotTop)}
                fill={pnlColors.up}
                fillOpacity={chartColors.zoneOpacity}
              />
              <Rect
                x={0}
                y={clamp(costY, layout.plotTop, layout.plotBottom)}
                width={layout.plotRight}
                height={clamp(layout.plotBottom - costY, 0, layout.plotBottom - layout.plotTop)}
                fill={pnlColors.down}
                fillOpacity={chartColors.zoneOpacity}
              />
              {costY - layout.plotTop > 16 ? (
                <SvgText x={4} y={layout.plotTop + 12} fontSize={10} fontFamily={fonts.medium} fill={pnlColors.up}>
                  ↑ 高於成本＝賺
                </SvgText>
              ) : null}
              {layout.plotBottom - costY > 16 ? (
                <SvgText
                  x={4}
                  y={layout.plotBottom - 4}
                  fontSize={10}
                  fontFamily={fonts.medium}
                  fill={pnlColors.down}
                >
                  ↓ 低於成本＝賠
                </SvgText>
              ) : null}
            </G>
          ) : null}

          {layout.ticks.map((tick, i) => (
            <G key={`tick-${i}`}>
              <Line x1={0} x2={layout.plotRight} y1={tick.y} y2={tick.y} stroke={colors.border} strokeWidth={1} />
              {/* 刻度跟成本標籤太近就不畫，免得疊在一起 */}
              {costY === null || Math.abs(tick.y - costY) > 12 ? (
                <SvgText
                  x={layout.plotRight + 6}
                  y={tick.y + 4}
                  fontSize={11}
                  fontFamily={fonts.regular}
                  fill={colors.mutedForeground}
                >
                  {formatPrice(tick.price)}
                </SvgText>
              ) : null}
            </G>
          ))}

          {layout.buyPoint ? (
            <Line
              x1={layout.buyPoint.x}
              x2={layout.buyPoint.x}
              y1={layout.plotTop}
              y2={layout.plotBottom}
              stroke={chartColors.buy}
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
          ) : null}

          {mode === "line" ? (
            <Path
              testID="chart-close-line"
              d={layout.closePath}
              stroke={chartColors.line}
              strokeWidth={2}
              strokeLinejoin="round"
              fill="none"
            />
          ) : (
            layout.shapes.map((shape) => {
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
                  <Rect x={shape.bodyX} y={shape.bodyTop} width={shape.bodyWidth} height={shape.bodyHeight} fill={color} />
                </G>
              );
            })
          )}

          {movingAverages ? (
            <G testID="chart-moving-averages">
              <Path d={maPath(movingAverages.short)} stroke={chartColors.ma5} strokeWidth={1.5} fill="none" />
              <Path
                d={maPath(movingAverages.long)}
                stroke={chartColors.ma20}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                fill="none"
              />
            </G>
          ) : null}

          {costY !== null && costPrice !== undefined ? (
            <G>
              <Line
                x1={0}
                x2={layout.plotRight}
                y1={costY}
                y2={costY}
                stroke={chartColors.cost}
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <Rect
                testID={layout.costOffChart ? "chart-cost-off-chart" : undefined}
                x={layout.plotRight + 2}
                y={clamp(costY - 9, 0, height - 18)}
                width={AXIS_WIDTH - 2}
                height={18}
                rx={4}
                fill={chartColors.cost}
              />
              <SvgText
                x={layout.plotRight + 6}
                y={clamp(costY - 9, 0, height - 18) + 13}
                fontSize={11}
                fontFamily={fonts.semibold}
                fill={colors.onAccent}
              >
                {`${layout.costOffChart === "above" ? "↑" : layout.costOffChart === "below" ? "↓" : ""}${formatPrice(costPrice)}`}
              </SvgText>
            </G>
          ) : null}

          {selected ? (
            <G testID="chart-crosshair">
              <Line
                x1={selected.x}
                x2={selected.x}
                y1={layout.plotTop}
                y2={layout.plotBottom}
                stroke={chartColors.crosshair}
                strokeWidth={1}
              />
              <Circle
                cx={selected.x}
                cy={layout.priceToY(selected.candle.close)}
                r={4}
                fill={colors.card}
                stroke={chartColors.line}
                strokeWidth={2}
              />
            </G>
          ) : null}

          {layout.buyPoint ? (
            <G testID="candle-buy-marker">
              <Circle
                cx={layout.buyPoint.x}
                cy={layout.buyPoint.y}
                r={6}
                fill={chartColors.buy}
                stroke={colors.card}
                strokeWidth={2}
              />
              <SvgText
                x={clamp(layout.buyPoint.x, 16, layout.plotRight - 16)}
                // 點靠近上緣就把字放下面
                y={layout.buyPoint.y - layout.plotTop > 22 ? layout.buyPoint.y - 11 : layout.buyPoint.y + 20}
                fontSize={11}
                fontFamily={fonts.semibold}
                fill={chartColors.buy}
                textAnchor="middle"
              >
                買入
              </SvgText>
            </G>
          ) : null}

          {layout.buyPoints.length > 0 ? (
            <G testID="chart-buy-points">
              {layout.buyPoints.map((point) => (
                <Circle
                  key={`${point.date}-${point.price}`}
                  cx={point.x}
                  cy={point.y}
                  r={4.5}
                  fill={chartColors.buy}
                  stroke={colors.card}
                  strokeWidth={1.5}
                />
              ))}
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 價格刻度：千分位；100 以下留兩位小數 */
export function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: price < 100 ? 2 : 0,
    maximumFractionDigits: price < 100 ? 2 : 0,
  });
}
