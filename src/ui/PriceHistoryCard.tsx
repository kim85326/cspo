import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatIsoDate } from "@/domain/buyDate";
import { locateBuyDate, MAX_CHART_MONTHS } from "@/domain/candles";
import type { Candle } from "@/domain/types";
import { useDailyCandles } from "@/hooks/useDailyCandles";
import { CandleChart, formatPrice } from "./CandleChart";
import { colors, fonts, fontSize, radius, shadow, space, touchTarget } from "./theme";

type Props = {
  symbol: string;
  name: string;
  /** 買入價：K 線圖上的成本虛線 */
  costPrice: number;
  /** 買入日期（ISO），選填 */
  buyDate?: string;
};

export const CANDLE_LOAD_ERROR = "K 線載入失敗，請檢查網路後重試";
export const CANDLE_EMPTY = "查不到這檔股票的 K 線資料（目前只支援上市股票）";

/** 結果卡下方的 K 線圖卡片：載入中、失敗可重試、沒資料、正常四種狀態 */
export function PriceHistoryCard({ symbol, name, costPrice, buyDate }: Props) {
  const state = useDailyCandles(symbol, buyDate);

  return (
    <View style={styles.card} accessibilityLabel="K 線圖">
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          日 K 線
        </Text>
        {state.status === "ready" && state.candles.length > 0 ? (
          <Text style={styles.range}>
            {formatIsoDate(state.candles[0].date)}–{formatIsoDate(state.candles[state.candles.length - 1].date)}
          </Text>
        ) : null}
      </View>

      {state.status === "loading" ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>K 線載入中…</Text>
        </View>
      ) : null}

      {state.status === "error" ? (
        <View style={styles.placeholder}>
          <Text style={styles.error} accessibilityRole="alert">
            {CANDLE_LOAD_ERROR}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新載入 K 線"
            onPress={state.retry}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>重試</Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === "ready" && state.candles.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={styles.muted}>{CANDLE_EMPTY}</Text>
        </View>
      ) : null}

      {state.status === "ready" && state.candles.length > 0 ? (
        <>
          <CandleChart
            candles={state.candles}
            costPrice={costPrice}
            buyDate={buyDate}
            accessibilityLabel={chartSummary(name, symbol, state.candles, costPrice, buyDate)}
          />
          <View style={styles.legend}>
            {buyDate ? (
              <Text style={styles.legendBuy}>{buyPointNote(state.candles, buyDate)}</Text>
            ) : (
              <Text style={styles.muted}>填「買入日期」就會在圖上標出買入點</Text>
            )}
            <Text style={styles.legendCost}>- - 成本 {formatPrice(costPrice)}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** 圖例裡買入點的說明：在圖上、落在下一個交易日、早於圖表、K 棒還沒出來 */
export function buyPointNote(candles: Candle[], buyDate: string): string {
  const location = locateBuyDate(candles, buyDate);
  const label = formatIsoDate(buyDate);
  if (location.kind === "before") {
    return `買入日 ${label} 早於圖表範圍（最多顯示近 ${MAX_CHART_MONTHS} 個月）`;
  }
  if (location.kind === "after") return `買入日 ${label} 的 K 棒還沒出來（收盤後更新）`;
  const tradeDate = candles[location.index].date;
  if (tradeDate === buyDate) return `▲ 買入 ${label}`;
  return `▲ 買入 ${label}（非交易日，標在 ${formatIsoDate(tradeDate)}）`;
}

/** 整張圖給螢幕閱讀器的一句話 */
function chartSummary(
  name: string,
  symbol: string,
  candles: Candle[],
  costPrice: number,
  buyDate?: string,
): string {
  const first = formatIsoDate(candles[0].date);
  const last = candles[candles.length - 1];
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const parts = [
    `${name}（${symbol}）日 K 線，${first} 到 ${formatIsoDate(last.date)}`,
    `最高 ${formatPrice(high)}、最低 ${formatPrice(low)}、最新收盤 ${formatPrice(last.close)}`,
    `成本 ${formatPrice(costPrice)}`,
  ];
  if (buyDate) parts.push(buyPointNote(candles, buyDate).replace("▲ ", ""));
  return parts.join("；");
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.md,
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
    marginBottom: space.sm,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.cardForeground },
  range: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  placeholder: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  muted: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  error: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.destructive, textAlign: "center" },
  retry: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontFamily: fonts.medium, fontSize: fontSize.md, color: colors.primary },
  pressed: { opacity: 0.6 },
  legend: { marginTop: space.sm, gap: space.xs },
  legendBuy: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.secondary },
  legendCost: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.accent },
});
