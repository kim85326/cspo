import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  BENCHMARK_RANGES,
  BENCHMARK_SCOPE_LABEL,
  BENCHMARKS,
  benchmarkStart,
  buildBenchmarkDuel,
  sharesBefore,
  type BenchmarkDuelResult,
  type BenchmarkRange,
  type BenchmarkSymbol,
} from "@/domain/benchmark";
import { formatAmount } from "@/domain/holdings";
import type { HoldingView } from "@/domain/holdings";
import type { Ledger } from "@/domain/ledgerTypes";
import { useBenchmarkPrices, type BenchmarkPriceSources, type BenchmarkPrices } from "@/hooks/useBenchmarkPrices";
import { describeLoadError } from "@/hooks/usePriceHistory";
import { Segmented } from "./Segmented";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

type Props = {
  ledger: Ledger;
  holdings: readonly HoldingView[];
  /** 首頁現價還在抓：實際價值還算不出來 */
  quotesLoading: boolean;
  today: string;
  /** 測試用；預設是 src/data 的 candleSource／corporateActionSource */
  sources?: BenchmarkPriceSources;
};

const SCOPES = ["satellite", "all"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * 個股 vs ETF 對決 B：如果改買 0050（P2-05 B，實作指南 T16）。對應 docs/stories/022-benchmark-duel.md。
 * 放在對決頁 A 部分下方。衛星（個股）與整體各模擬一次，計算在 src/domain/benchmark.ts。
 * 這是 Pro 功能：外層用 ProGate("etfDuelFull") 包住，鎖住時這個元件不會掛上，也不會去抓價格。
 */
export function BenchmarkDuelCard({ ledger, holdings, quotesLoading, today, sources }: Props) {
  const [benchmark, setBenchmark] = useState<BenchmarkSymbol>("0050");
  const [range, setRange] = useState<BenchmarkRange>("all");

  // 衛星的期初一定不早於整體的期初，而且衛星需要期初市值時兩者是同一天，所以一次抓整體需要的就夠
  const start = benchmarkStart(range, today, ledger.transactions);
  const openingSymbols = useMemo(
    () => (start === null ? [] : Object.keys(sharesBefore(ledger.transactions, ledger.dividends, start))),
    [ledger, start],
  );
  const prices = useBenchmarkPrices(benchmark, start, openingSymbols, today, sources);

  return (
    <View style={styles.card} testID="benchmark-duel">
      <Text style={styles.title} accessibilityRole="header">
        如果改買 {benchmark}
      </Text>
      <Text style={styles.hint}>
        把你每一筆買賣的金額，假設同一天改成買賣 {benchmark}，看現在會是多少。
      </Text>
      <Segmented
        label="比較基準"
        options={BENCHMARKS.map((b) => ({ value: b.value, label: b.label }))}
        value={benchmark}
        onChange={setBenchmark}
      />
      <Segmented
        label="比較期間"
        options={BENCHMARK_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        value={range}
        onChange={setRange}
      />

      {prices.status === "error" ? (
        <LoadError error={prices.error} onRetry={prices.retry} />
      ) : prices.status !== "ready" || quotesLoading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={`${benchmark} 價格載入中`} />
        </View>
      ) : (
        SCOPES.map((scope) => (
          <ScopeResult
            key={scope}
            scope={scope}
            result={scopeResult(scope, { ledger, holdings, benchmark, range, today, prices: prices.prices })}
          />
        ))
      )}

      <Text style={styles.footnote}>
        模擬忽略交易成本。{benchmark} 用還原收盤價，已經把它自己的配息與分割算進去；你實際的價值則加上領到的現金股利。
        沒有價格的日子（例如假日）用前一個交易日的價格。期間不是「全部」時，期初手上持股的市值當成第一筆投入。
      </Text>
    </View>
  );
}

/** 一個範圍的結果；這個範圍完全沒有紀錄時回 null */
function scopeResult(
  scope: Scope,
  input: {
    ledger: Ledger;
    holdings: readonly HoldingView[];
    benchmark: BenchmarkSymbol;
    range: BenchmarkRange;
    today: string;
    prices: BenchmarkPrices;
  },
): BenchmarkDuelResult | null {
  const { ledger, holdings, benchmark, range, today, prices } = input;
  const views = scope === "all" ? holdings : holdings.filter((v) => v.bucket === scope);
  const symbols = new Set(views.map((v) => v.symbol));
  const transactions = ledger.transactions.filter((t) => symbols.has(t.symbol));
  const start = benchmarkStart(range, today, transactions);
  if (start === null) return null;
  let marketValue: number | null = 0;
  for (const v of views) {
    if (v.position.shares === 0) continue;
    if (v.position.marketValue === null) {
      marketValue = null;
      break;
    }
    marketValue += v.position.marketValue;
  }
  return buildBenchmarkDuel({
    benchmark,
    transactions,
    dividends: ledger.dividends.filter((d) => symbols.has(d.symbol)),
    marketValue,
    start,
    today,
    adjCloses: prices.adjCloses,
    openingCloses: prices.openingCloses,
  });
}

function ScopeResult({ scope, result }: { scope: Scope; result: BenchmarkDuelResult | null }) {
  const label = BENCHMARK_SCOPE_LABEL[scope];
  return (
    <View style={styles.scope} testID={`benchmark-${scope}`}>
      <Text style={styles.scopeTitle} accessibilityRole="header">
        {label}
      </Text>
      {result === null ? (
        <Text style={styles.hint}>{scope === "satellite" ? "還沒有個股紀錄" : "還沒有任何交易紀錄"}</Text>
      ) : result.kind !== "ok" ? (
        <Text style={styles.hint}>{result.text}</Text>
      ) : (
        <>
          <Text style={styles.conclusion}>{result.text}</Text>
          <Row label={`若改買 ${result.comparison.benchmark}`} value={`${formatAmount(result.comparison.benchmarkValue)} 元`} />
          <Row label="你實際（市值 + 領到的股利）" value={`${formatAmount(result.comparison.actualValue)} 元`} />
          <Row label="期間投入" value={`${formatAmount(result.comparison.invested)} 元`} />
          {result.comparison.oversold ? (
            <Text style={styles.hint} testID={`benchmark-${scope}-oversold`}>
              有一筆賣出的金額，比當時模擬的 {result.comparison.benchmark} 部位還多，模擬只能全部賣掉，所以「若改買」的數字會偏高一些。
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { message, detail } = describeLoadError(error, "歷史價格");
  return (
    <View style={styles.placeholder} testID="benchmark-error">
      <Text style={styles.error} accessibilityRole="alert">
        {message}
      </Text>
      <Text style={styles.detail} selectable>
        技術細節：{detail}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新載入歷史價格"
        onPress={onRetry}
        style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
      >
        <Text style={styles.retryText}>重試</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.mutedForeground },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, lineHeight: fontSize.sm * 1.5 },
  placeholder: { paddingVertical: space.lg, alignItems: "center", gap: space.sm },
  scope: { gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  scopeTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.cardForeground },
  conclusion: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.cardForeground,
    lineHeight: fontSize.md * 1.5,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space.xs, gap: space.xs },
  rowLabel: { fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: fontSize.sm, flexShrink: 1 },
  rowValue: {
    fontFamily: fonts.medium,
    color: colors.cardForeground,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, lineHeight: fontSize.xs * 1.6 },
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
  pressed: { opacity: 0.85 },
});
