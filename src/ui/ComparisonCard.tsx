import { StyleSheet, Text, View } from "react-native";
import type { ComparisonResult, ComparisonRow } from "@/domain/compare";
import { formatReturnRate, formatSignedAmount, pnlDirection } from "@/domain/pnl";
import { colors, fonts, fontSize, pnlColors, radius, shadow, space } from "./theme";

type Props = {
  comparison: ComparisonResult;
};

const TOTAL_VERDICT: Record<ReturnType<typeof pnlDirection>, string> = {
  up: "整體賺了",
  down: "整體虧了",
  flat: "整體不賺不賠",
};

/**
 * 多檔股票比較結果：依報酬率排名，第一名標「表現最好」，最後一名標「表現最差」，底下是合計。
 * 顏色沿用台股慣例（漲紅跌綠），且每列都有正負號與排名文字，不靠顏色單獨傳達。
 */
export function ComparisonCard({ comparison }: Props) {
  const { rows, total } = comparison;
  const totalDirection = pnlDirection(total.pnl);
  const totalColor = pnlColors[totalDirection];

  return (
    <View style={styles.card} accessibilityLabel="比較結果">
      <View style={styles.headerRow}>
        <Text style={styles.title}>比較結果</Text>
        <Text style={styles.subtitle}>依報酬率排序</Text>
      </View>

      {rows.map((row) => (
        <RankRow key={`${row.quote.symbol}-${row.rank}`} row={row} count={rows.length} />
      ))}

      <View style={styles.total}>
        <Text style={styles.totalLabel}>合計（{rows.length} 檔）</Text>
        <Text style={styles.totalVerdict}>{TOTAL_VERDICT[totalDirection]}</Text>
        <Text style={[styles.totalPnl, { color: totalColor }]} accessibilityLabel="總盈虧">
          {formatSignedAmount(total.pnl)}
        </Text>
        <Text style={[styles.totalRate, { color: totalColor }]} accessibilityLabel="總報酬率">
          {formatReturnRate(total.returnRate)}
        </Text>
        <DetailRow label="總成本" value={total.cost.toLocaleString("en-US")} />
        <DetailRow label="總現值" value={total.marketValue.toLocaleString("en-US")} />
      </View>
    </View>
  );
}

function RankRow({ row, count }: { row: ComparisonRow; count: number }) {
  const direction = pnlDirection(row.result.pnl);
  const color = pnlColors[direction];
  const isBest = row.rank === 1 && count > 1;
  const isWorst = row.rank === count && count > 1;

  return (
    <View
      style={[styles.row, isBest && styles.rowBest]}
      accessibilityLabel={`第 ${row.rank} 名 ${row.quote.name} ${row.quote.symbol}`}
      testID={`comparison-row-${row.rank}`}
    >
      <View style={[styles.rankBadge, isBest && styles.rankBadgeBest]}>
        <Text style={[styles.rankText, isBest && styles.rankTextBest]}>{row.rank}</Text>
      </View>

      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {row.quote.name}
            <Text style={styles.symbol}>（{row.quote.symbol}）</Text>
          </Text>
          {isBest ? <Tag text="表現最好" tone="best" /> : null}
          {isWorst ? <Tag text="表現最差" tone="worst" /> : null}
        </View>
        <Text style={styles.meta}>
          {row.holding.buyPrice.toLocaleString("en-US")} → {row.quote.price.toLocaleString("en-US")}
          ・{row.holding.shares.toLocaleString("en-US")} 股
        </Text>
      </View>

      <View style={styles.numbers}>
        <Text style={[styles.pnl, { color }]}>{formatSignedAmount(row.result.pnl)}</Text>
        <Text style={[styles.rate, { color }]}>{formatReturnRate(row.result.returnRate)}</Text>
      </View>
    </View>
  );
}

function Tag({ text, tone }: { text: string; tone: "best" | "worst" }) {
  return (
    <View style={[styles.tag, tone === "best" ? styles.tagBest : styles.tagWorst]}>
      <Text style={[styles.tagText, tone === "best" ? styles.tagTextBest : styles.tagTextWorst]}>
        {text}
      </Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.cardForeground },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowBest: { backgroundColor: colors.background },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.sm + 4,
  },
  rankBadgeBest: { backgroundColor: colors.primary },
  rankText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  rankTextBest: { color: colors.onPrimary },
  rowBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs + 2 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.cardForeground, flexShrink: 1 },
  symbol: { fontFamily: fonts.regular, color: colors.mutedForeground },
  meta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  numbers: { alignItems: "flex-end", marginLeft: space.sm },
  pnl: { fontFamily: fonts.bold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"] },
  rate: { fontFamily: fonts.medium, fontSize: fontSize.sm, fontVariant: ["tabular-nums"] },

  tag: { borderRadius: radius.sm, paddingHorizontal: space.sm - 2, paddingVertical: 1 },
  tagBest: { backgroundColor: colors.primary },
  tagWorst: { backgroundColor: colors.muted },
  tagText: { fontFamily: fonts.medium, fontSize: fontSize.xs },
  tagTextBest: { color: colors.onPrimary },
  tagTextWorst: { color: colors.mutedForeground },

  total: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  totalLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  totalVerdict: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.cardForeground,
    marginTop: space.xs,
  },
  totalPnl: {
    fontFamily: fonts.bold,
    fontSize: fontSize.display * 0.8,
    fontVariant: ["tabular-nums"],
    marginTop: space.xs,
  },
  totalRate: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    fontVariant: ["tabular-nums"],
    marginBottom: space.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: { fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: fontSize.sm },
  detailValue: {
    fontFamily: fonts.medium,
    color: colors.cardForeground,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
});
