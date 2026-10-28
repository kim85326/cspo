import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { computeAllocation, toDisplayPercents } from "@/domain/allocation";
import { arcsOf, donutSegmentPath, groupHoldingSlices, isFullCircle, OTHERS_KEY } from "@/domain/allocationChart";
import { BUCKET_LABEL, formatAmount, type HoldingView } from "@/domain/holdings";
import type { HoldingSetting } from "@/domain/ledgerTypes";
import { SECURITY_TYPE_LABEL } from "@/domain/security";
import { Segmented } from "./Segmented";
import { cardSurface, cardTitle, colors, fonts, fontSize, space } from "./theme";

/**
 * 配置圓餅圖（P2-07 配置圖、實作指南 T13，Story 028）。比例來自 src/domain/allocation.ts。
 * 三種看法用分段切換：核心／衛星（預設）、個股／ETF、每檔持股。
 * 圖例一定附文字與百分比，不靠顏色單獨傳達；整張圖對螢幕閱讀器隱藏，改讀圖例。
 */

type View3 = "bucket" | "type" | "holding";

const VIEWS: { value: View3; label: string }[] = [
  { value: "bucket", label: "核心／衛星" },
  { value: "type", label: "個股／ETF" },
  { value: "holding", label: "每檔持股" },
];

/**
 * 圖表色只用在這張圖，不放進 theme.ts（其他 session 同時在改）。
 * 避開漲紅跌綠，免得被看成賺賠；核心＝ETF＝深藍、衛星＝個股＝金，兩種看法顏色一致。
 */
const SLICE_COLORS = ["#1E3A8A", "#A16207", "#0E7490", "#7C3AED", "#BE185D", "#64748B"];
const CORE_COLOR = SLICE_COLORS[0];
const SATELLITE_COLOR = SLICE_COLORS[1];
const OTHERS_COLOR = "#94A3B8";

const SIZE = 168;
const OUTER = SIZE / 2;
const INNER = OUTER * 0.6;

type LegendItem = { key: string; label: string; color: string; marketValue: number; percent: number };

type Props = {
  /** 記帳本每一檔；已出清與缺價格的由 computeAllocation 排除 */
  holdings: readonly HoldingView[];
  holdingSettings: readonly HoldingSetting[];
  /** 價格還在載入：先不畫，免得閃出「缺少價格」 */
  pricesLoading?: boolean;
};

export function AllocationCard({ holdings, holdingSettings, pricesLoading = false }: Props) {
  const [view, setView] = useState<View3>("bucket");
  const allocation = useMemo(
    () =>
      computeAllocation(
        holdings.map((h) => h.position),
        holdingSettings,
      ),
    [holdings, holdingSettings],
  );
  const nameOf = useMemo(() => new Map(holdings.map((h) => [h.symbol, h.name])), [holdings]);

  const items = useMemo((): LegendItem[] => {
    const raw =
      view === "bucket"
        ? allocation.byBucket.map((s) => ({
            key: s.key,
            label: BUCKET_LABEL[s.key],
            color: s.key === "core" ? CORE_COLOR : SATELLITE_COLOR,
            marketValue: s.marketValue,
            ratio: s.ratio,
          }))
        : view === "type"
          ? allocation.byType.map((s) => ({
              key: s.key,
              label: SECURITY_TYPE_LABEL[s.key],
              color: s.key === "etf" ? CORE_COLOR : SATELLITE_COLOR,
              marketValue: s.marketValue,
              ratio: s.ratio,
            }))
          : groupHoldingSlices(allocation.byHolding).map((s, i) => {
              const name = s.key === OTHERS_KEY ? undefined : nameOf.get(s.key);
              return {
                key: s.key,
                label: name && name !== s.key ? `${name} ${s.key}` : s.key,
                color: s.key === OTHERS_KEY ? OTHERS_COLOR : SLICE_COLORS[i % SLICE_COLORS.length],
                marketValue: s.marketValue,
                ratio: s.ratio,
              };
            });
    const percents = toDisplayPercents(raw.map((r) => r.ratio));
    return raw.map(({ ratio: _ratio, ...rest }, i) => ({ ...rest, percent: percents[i] }));
  }, [allocation, view, nameOf]);

  const empty = allocation.totalMarketValue === 0;

  return (
    <View style={styles.card} testID="allocation-card">
      <Text style={styles.title} accessibilityRole="header">
        資產配置
      </Text>
      <Segmented<View3> label="配置的分法" options={VIEWS} value={view} onChange={setView} />

      {pricesLoading ? (
        <Text style={styles.hint}>價格更新中…</Text>
      ) : empty ? (
        <Text style={styles.hint} testID="allocation-empty">
          {allocation.missingPriceCount > 0 ? "持股都還沒有價格，暫時畫不出配置" : "目前沒有持有中的股票"}
        </Text>
      ) : (
        <View style={styles.body}>
          <Donut items={items} />
          <View style={styles.legend}>
            {items.map((item) => (
              <View
                key={item.key}
                style={styles.legendRow}
                accessible
                accessibilityLabel={`${item.label} ${item.percent.toFixed(2)}%，市值 ${formatAmount(item.marketValue)} 元`}
              >
                <View style={[styles.swatch, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={styles.legendPercent}>{item.percent.toFixed(2)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!pricesLoading && allocation.missingPriceCount > 0 && !empty ? (
        <Text style={styles.hint} testID="allocation-missing-price">
          有 {allocation.missingPriceCount} 檔持股缺少價格，沒有算進配置
        </Text>
      ) : null}
      {!pricesLoading && !empty ? (
        <Text style={styles.hint}>依目前市值計算，合計 {formatAmount(allocation.totalMarketValue)} 元</Text>
      ) : null}
    </View>
  );
}

function Donut({ items }: { items: LegendItem[] }) {
  const arcs = arcsOf(items.map((i) => i.percent));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {items.map((item, i) => {
          const arc = arcs[i];
          if (!arc) return null;
          if (isFullCircle(arc)) {
            // 只有一種（例如全部都是核心）：畫一整圈圓環
            const mid = (OUTER + INNER) / 2;
            return (
              <Circle
                key={item.key}
                cx={OUTER}
                cy={OUTER}
                r={mid}
                stroke={item.color}
                strokeWidth={OUTER - INNER}
                fill="none"
              />
            );
          }
          return (
            <Path
              key={item.key}
              d={donutSegmentPath(arc, OUTER, OUTER, OUTER, INNER)}
              fill={item.color}
              stroke={colors.card}
              strokeWidth={1}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    padding: space.md,
    gap: space.sm,
  },
  title: cardTitle,
  body: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: space.md },
  legend: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: space.xs },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.cardForeground },
  legendPercent: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.cardForeground,
    fontVariant: ["tabular-nums"],
  },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
});
