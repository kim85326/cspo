import { StyleSheet, Text, View } from "react-native";
import { formatReturnRate, formatSignedAmount, pnlDirection } from "@/domain/pnl";
import type { PnlResult, Quote } from "@/domain/types";
import { DirectionIcon } from "./Icon";
import { colors, fonts, fontSize, pnlColors, radius, shadow, space } from "./theme";

type Props = {
  quote: Quote;
  result: PnlResult;
};

const VERDICT: Record<ReturnType<typeof pnlDirection>, string> = {
  up: "賺了",
  down: "虧了",
  flat: "不賺不賠",
};

/** 盈虧結果卡片 */
export function PnlCard({ quote, result }: Props) {
  const direction = pnlDirection(result.pnl);
  const color = pnlColors[direction];

  return (
    <View style={styles.card} accessibilityLabel="盈虧結果">
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {quote.name}（{quote.symbol}）
        </Text>
        {quote.asOf ? <Text style={styles.asOf}>收盤價 {quote.asOf}</Text> : null}
      </View>
      <Text style={styles.verdict}>{VERDICT[direction]}</Text>

      <View style={styles.amountRow}>
        <DirectionIcon direction={direction} size={20} color={color} />
        <Text style={[styles.pnl, { color }]} accessibilityLabel="盈虧金額">
          {formatSignedAmount(result.pnl)}
        </Text>
      </View>
      <Text style={[styles.rate, { color }]} accessibilityLabel="報酬率">
        {formatReturnRate(result.returnRate)}
      </Text>

      <Row label="現價" value={quote.price.toLocaleString("en-US")} />
      <Row label="買入成本" value={result.cost.toLocaleString("en-US")} />
      <Row label="現值" value={result.marketValue.toLocaleString("en-US")} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.sm,
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.mutedForeground,
  },
  asOf: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  verdict: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.xl,
    color: colors.cardForeground,
    marginTop: space.sm,
  },
  amountRow: { flexDirection: "row", alignItems: "center", marginTop: space.xs },
  pnl: {
    fontFamily: fonts.bold,
    fontSize: fontSize.display,
    fontVariant: ["tabular-nums"],
  },
  rate: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    fontVariant: ["tabular-nums"],
    marginBottom: space.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: { fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: fontSize.sm },
  rowValue: {
    fontFamily: fonts.medium,
    color: colors.cardForeground,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
});
