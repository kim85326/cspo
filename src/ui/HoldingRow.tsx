import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BUCKET_LABEL,
  formatAmount,
  formatPrice,
  formatRate,
  formatShares,
  formatSignedAmountOrDash,
  unrealizedRate,
  type HoldingView,
} from "@/domain/holdings";
import type { Bucket } from "@/domain/ledgerTypes";
import type { PnlDirection } from "@/domain/types";
import { colors, fonts, fontSize, pnlColors, radius, space, touchTarget } from "./theme";

type Props = {
  holding: HoldingView;
  /** 點整列；沒給就不能點 */
  onPress?: () => void;
  /**
   * true：持股明細用，列出 M-04 的全部欄位。
   * false（預設）：精簡版（名稱、市值、總報酬與報酬率、股數與平均成本），給首頁等空間小的地方。
   */
  detailed?: boolean;
};

/** 方向：null（沒有價格）當平盤，顏色用灰 */
export function directionOf(value: number | null): PnlDirection {
  if (value === null || Math.round(value) === 0) return "flat";
  return value > 0 ? "up" : "down";
}

const ARROW: Record<PnlDirection, string> = { up: "▲", down: "▼", flat: "" };
const VERDICT: Record<PnlDirection, string> = { up: "賺了", down: "虧了", flat: "不賺不賠" };

/**
 * 持股明細的一列（Story 010）。持有中顯示市值與總報酬；已出清（股數 0）顯示已實現損益與股利。
 * 漲紅跌綠，另有 ▲▼ 與「賺了／虧了」文字，不只靠顏色。
 */
export function HoldingRow({ holding, onPress, detailed = false }: Props) {
  const p = holding.position;
  const closed = p.shares === 0;
  const direction = directionOf(p.totalReturn);
  const color = pnlColors[direction];
  const verdict = p.totalReturn === null ? "缺少價格" : VERDICT[direction];

  const label = [
    `${holding.name} ${holding.symbol}`,
    BUCKET_LABEL[holding.bucket],
    closed ? "已出清" : `市值 ${formatAmount(p.marketValue)} 元`,
    `總報酬 ${verdict} ${formatSignedAmountOrDash(p.totalReturn)} 元`,
    `報酬率 ${formatRate(p.returnRate)}`,
  ].join("，");

  const body = (
    <>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {holding.name}
            </Text>
            <BucketTag bucket={holding.bucket} />
          </View>
          <Text style={styles.sub}>
            {holding.symbol}
            {closed ? " · 已出清" : ` · ${formatShares(p.shares)} · 均價 ${formatPrice(p.averageCost)}`}
          </Text>
        </View>
        <View style={styles.valueBlock}>
          <Text style={styles.valueLabel}>{closed ? "已實現" : "市值"}</Text>
          <Text style={styles.value}>
            {closed ? formatSignedAmountOrDash(p.realizedPnl) : formatAmount(p.marketValue)}
          </Text>
        </View>
      </View>

      <View style={styles.returnRow}>
        <Text style={styles.returnLabel}>總報酬 · {verdict}</Text>
        <View style={styles.returnValues}>
          {ARROW[direction] ? (
            <Text style={[styles.arrow, { color }]} accessibilityElementsHidden importantForAccessibility="no">
              {ARROW[direction]}
            </Text>
          ) : null}
          <Text style={[styles.returnAmount, { color }]}>{formatSignedAmountOrDash(p.totalReturn)}</Text>
          <Text style={[styles.returnRate, { color }]}>{formatRate(p.returnRate)}</Text>
        </View>
      </View>

      {detailed ? <DetailGrid holding={holding} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label} testID={`holding-row-${holding.symbol}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="查看這檔的交易紀錄"
      onPress={onPress}
      testID={`holding-row-${holding.symbol}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function DetailGrid({ holding }: { holding: HoldingView }) {
  const p = holding.position;
  if (p.shares === 0) {
    return (
      <View style={styles.grid}>
        <Cell label="已實現損益" value={formatSignedAmountOrDash(p.realizedPnl)} signed={p.realizedPnl} />
        <Cell label="已領股利" value={formatAmount(p.cashDividends)} />
        <Cell label="累計投入" value={formatAmount(p.invested)} />
      </View>
    );
  }
  const uRate = unrealizedRate(p);
  return (
    <View style={styles.grid}>
      <Cell label="參考價" value={formatPrice(p.price)} />
      <Cell label="持有天數" value={p.holdingDays === null ? "—" : `${p.holdingDays} 天`} />
      <Cell
        label="未實現損益"
        value={`${formatSignedAmountOrDash(p.unrealizedPnl)}（${formatRate(uRate)}）`}
        signed={p.unrealizedPnl}
      />
      <Cell label="已實現損益" value={formatSignedAmountOrDash(p.realizedPnl)} signed={p.realizedPnl} />
      <Cell label="已領股利" value={formatAmount(p.cashDividends)} />
      <Cell label="累計投入" value={formatAmount(p.invested)} />
    </View>
  );
}

function Cell({ label, value, signed }: { label: string; value: string; signed?: number | null }) {
  const color = signed === undefined ? colors.cardForeground : pnlColors[directionOf(signed)];
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, { color }]}>{value}</Text>
    </View>
  );
}

/** 核心／衛星標籤：核心用深藍淺底、衛星用灰底；文字本身就說明分類 */
export function BucketTag({ bucket }: { bucket: Bucket }) {
  return (
    <View style={[styles.tag, bucket === "core" ? styles.tagCore : styles.tagSatellite]}>
      <Text style={[styles.tagText, bucket === "core" ? styles.tagTextCore : styles.tagTextSatellite]}>
        {BUCKET_LABEL[bucket]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    minHeight: touchTarget,
    gap: space.sm,
  },
  pressed: { opacity: 0.7 },
  topRow: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  titleBlock: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.cardForeground,
    flexShrink: 1,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  valueBlock: { alignItems: "flex-end" },
  valueLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  value: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.cardForeground,
    fontVariant: ["tabular-nums"],
  },
  returnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xs,
  },
  returnLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  returnValues: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  arrow: { fontSize: fontSize.sm },
  returnAmount: { fontFamily: fonts.bold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"] },
  returnRate: { fontFamily: fonts.semibold, fontSize: fontSize.sm, fontVariant: ["tabular-nums"] },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    rowGap: space.sm,
  },
  cell: { width: "50%", paddingRight: space.sm },
  cellLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  cellValue: { fontFamily: fonts.medium, fontSize: fontSize.sm, fontVariant: ["tabular-nums"] },
  tag: { borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
  tagCore: { backgroundColor: colors.secondarySurface },
  tagSatellite: { backgroundColor: colors.muted },
  tagText: { fontFamily: fonts.medium, fontSize: fontSize.xs },
  tagTextCore: { color: colors.secondary },
  tagTextSatellite: { color: colors.mutedForeground },
});
