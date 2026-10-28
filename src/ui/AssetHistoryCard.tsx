import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { CandleSource } from "@/data/CandleSource";
import {
  ASSET_RANGES,
  buildAssetHistory,
  FREE_ASSET_RANGES,
  rangeStart,
  symbolsInRange,
  type AssetHistoryPoint,
  type AssetRange,
} from "@/domain/assetHistory";
import { formatIsoDate } from "@/domain/buyDate";
import { formatAmount } from "@/domain/holdings";
import type { Ledger } from "@/domain/ledgerTypes";
import { useAssetHistoryCloses } from "@/hooks/useAssetHistory";
import { describeLoadError } from "@/hooks/usePriceHistory";
import { useProStatus } from "@/hooks/useProStatus";
import { AssetHistoryChart } from "./AssetHistoryChart";
import { ProGate } from "./ProLockedCard";
import { Segmented } from "./Segmented";
import { cardSurface, cardTitle, chartColors, colors, fonts, fontSize, pressedOpacity, radius, space, touchTarget } from "./theme";

type Props = {
  ledger: Ledger;
  /** 首頁同一組現價（代號 → 價格），讓走勢最後一天等於首頁總市值；還在抓是 null */
  latestPrices: Readonly<Record<string, number>> | null;
  today: string;
  /** 測試傳假來源；app 裡用 src/data 的 candleSource（有快取） */
  candleSource?: CandleSource;
};

/**
 * 資產走勢卡片（P2-07 走勢圖，docs/stories/023-asset-history.md）：期間切換 + 總市值、累計投入兩條線。
 * - Free 只能看近 1 個月，近 1 年與全部用 ProGate 包住（P2-08）；鎖住時內容不會掛上，也就不抓資料。
 * - 載入中、失敗（附重試與技術細節）、資料不足（少於 2 個交易日）各有自己的畫面，不畫少算的圖。
 * 獨立元件，首頁只放入口，畫面在 /history（src/screens/AssetHistoryScreen.tsx）。
 */
export function AssetHistoryCard({ ledger, latestPrices, today, candleSource }: Props) {
  const { pro } = useProStatus();
  const [range, setRange] = useState<AssetRange>("1m");
  const from = rangeStart(range, today, ledger);

  const options = ASSET_RANGES.map((r) => ({
    value: r.value,
    label: !pro && !FREE_ASSET_RANGES.includes(r.value) ? `${r.label}・Pro` : r.label,
  }));

  const body = (
    <HistoryBody
      // 換期間時選到的那天回到最後一天
      key={range}
      ledger={ledger}
      from={from}
      today={today}
      latestPrices={latestPrices}
      candleSource={candleSource}
    />
  );

  return (
    <View style={styles.card} testID="asset-history-card">
      <Text style={styles.title} accessibilityRole="header">
        資產走勢
      </Text>
      <Segmented label="走勢期間" options={options} value={range} onChange={setRange} />
      {FREE_ASSET_RANGES.includes(range) ? body : <ProGate feature="assetHistory">{body}</ProGate>}
    </View>
  );
}

function HistoryBody({
  ledger,
  from,
  today,
  latestPrices,
  candleSource,
}: {
  ledger: Ledger;
  from: string | null;
  today: string;
  latestPrices: Readonly<Record<string, number>> | null;
  candleSource?: CandleSource;
}) {
  const closes = useAssetHistoryCloses(ledger, from, today, candleSource);
  const [selected, setSelected] = useState<number | null>(null);

  const points = useMemo(() => {
    if (closes.status !== "ready" || from === null || latestPrices === null) return null;
    return buildAssetHistory(ledger, closes.closes, { from, to: today, latestPrices });
  }, [closes, ledger, from, today, latestPrices]);

  if (from === null) {
    return <Message>還沒有任何交易。記下第一筆買入後，這裡會畫出每天的總市值與累計投入。</Message>;
  }
  if (closes.status === "error") {
    return <LoadError error={closes.error} onRetry={closes.retry} />;
  }
  if (points === null) {
    const progress = closes.status === "loading" && closes.total > 1 ? `（${closes.done}/${closes.total} 檔）` : "";
    return (
      <View style={styles.placeholder} testID="asset-history-loading">
        <ActivityIndicator color={colors.primary} accessibilityLabel="走勢載入中" />
        <Text style={styles.hint}>載入歷史收盤價{progress}</Text>
      </View>
    );
  }
  if (points.length < 2) {
    return (
      <Message testID="asset-history-insufficient">
        資料不足：這段期間只有 {points.length} 個交易日的資料，至少要 2 天才畫得出走勢。剛開始記帳的話，過幾個交易日再來看。
      </Message>
    );
  }

  // 首頁拿不到現價的那幾檔，最後一天用最近的收盤價（首頁那幾檔的市值顯示 —）
  const missingLatest = symbolsInRange(ledger, today, today).filter((s) => latestPrices?.[s] === undefined).length;
  const index = selected ?? points.length - 1;
  const point = points[index];
  return (
    <View style={styles.body}>
      <SelectedDay point={point} isLast={index === points.length - 1} />
      <AssetHistoryChart
        points={points}
        selectedIndex={index}
        onSelect={setSelected}
        accessibilityLabel={chartSummary(points)}
      />
      <View style={styles.legend}>
        <LegendItem swatch={<View style={styles.swatchMarket} />}>總市值</LegendItem>
        <LegendItem swatch={<View style={styles.swatchInvested} />}>累計投入</LegendItem>
      </View>
      <Text style={styles.note}>
        累計投入是所有買入的成交金額加手續費，賣出後不會減少。
        {missingLatest > 0
          ? `有 ${missingLatest} 檔拿不到現價，最後一天先用最近一個交易日的收盤價。`
          : "最後一天用首頁同一組價格，所以會等於首頁的目前市值。"}
      </Text>
    </View>
  );
}

function SelectedDay({ point, isLast }: { point: AssetHistoryPoint; isLast: boolean }) {
  return (
    <View style={styles.selected} testID="asset-history-selected">
      <Text style={styles.selectedDate}>
        {formatIsoDate(point.date)}
        {isLast ? "（最新）" : ""}
      </Text>
      <View style={styles.selectedRow}>
        <Text style={styles.selectedLabel}>總市值</Text>
        <Text style={styles.selectedValue} testID="asset-history-market-value">
          {formatAmount(point.marketValue)}
        </Text>
      </View>
      <View style={styles.selectedRow}>
        <Text style={styles.selectedLabel}>累計投入</Text>
        <Text style={styles.selectedValue} testID="asset-history-invested">
          {formatAmount(point.invested)}
        </Text>
      </View>
    </View>
  );
}

function Message({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.placeholder} testID={testID}>
      <Text style={styles.hint}>{children}</Text>
    </View>
  );
}

function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText}>{children}</Text>
    </View>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { message, detail } = describeLoadError(error, "走勢圖");
  return (
    <View style={styles.placeholder} testID="asset-history-error">
      <Text style={styles.error} accessibilityRole="alert">
        {message}
      </Text>
      <Text style={styles.detail} selectable>
        技術細節：{detail}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新載入走勢圖"
        onPress={onRetry}
        style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
      >
        <Text style={styles.retryText}>重試</Text>
      </Pressable>
    </View>
  );
}

/** 整張圖給螢幕閱讀器的一句話 */
function chartSummary(points: AssetHistoryPoint[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  return [
    `資產走勢，${formatIsoDate(first.date)} 到 ${formatIsoDate(last.date)}`,
    `總市值從 ${formatAmount(first.marketValue)} 到 ${formatAmount(last.marketValue)}`,
    `累計投入從 ${formatAmount(first.invested)} 到 ${formatAmount(last.invested)}`,
  ].join("；");
}

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    padding: space.md,
    gap: space.sm,
  },
  title: cardTitle,
  body: { gap: space.sm },
  placeholder: { paddingVertical: space.lg, alignItems: "center", gap: space.sm },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: fontSize.sm * 1.5,
  },
  error: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.destructive, textAlign: "center" },
  detail: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, textAlign: "center" },
  retry: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.primary },
  selected: { gap: 2 },
  selectedDate: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.mutedForeground },
  selectedRow: { flexDirection: "row", justifyContent: "space-between" },
  selectedLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  selectedValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.cardForeground,
    fontVariant: ["tabular-nums"],
  },
  legend: { flexDirection: "row", gap: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  swatchMarket: { width: 16, height: 2, backgroundColor: chartColors.line },
  swatchInvested: {
    width: 16,
    height: 0,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: chartColors.cost,
  },
  note: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, lineHeight: fontSize.xs * 1.5 },
  pressed: { opacity: pressedOpacity },
});
