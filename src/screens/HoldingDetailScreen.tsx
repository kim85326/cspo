import { router, Stack, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { estimatedCashDividends, estimatedStockDividends } from "@/domain/autoDividends";
import { localIsoDate } from "@/domain/buyDate";
import {
  BUCKET_LABEL,
  formatAmount,
  formatPrice,
  formatRate,
  formatShares,
  formatSignedAmountOrDash,
  symbolHistory,
  unrealizedRate,
  type HistoryEntry,
} from "@/domain/holdings";
import type { Bucket } from "@/domain/ledgerTypes";
import { defaultBucket } from "@/domain/portfolio";
import { SECURITY_TYPE_LABEL, securityTypeOf } from "@/domain/security";
import { useHoldings } from "@/hooks/useHoldings";
import { HoldingAnnualizedReturnCard } from "@/ui/AnnualizedReturnCard";
import { directionOf } from "@/ui/HoldingRow";
import { PriceHistoryCard } from "@/ui/PriceHistoryCard";
import { Segmented } from "@/ui/Segmented";
import { colors, fonts, fontSize, pnlColors, radius, shadow, space, touchTarget } from "@/ui/theme";

type Props = {
  symbol: string;
  /** 測試與畫面開發用；預設是 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  prices?: PriceSource;
  today?: string;
};

// T4（Story 009）的交易畫面同時開發中，合併前 typed routes 還不認得這兩個路由，先轉型
const newTransactionHref = (symbol: string) =>
  ({ pathname: "/transaction/new", params: { symbol } }) as unknown as Href;
const editTransactionHref = (id: string) => ({ pathname: "/transaction/[id]", params: { id } }) as unknown as Href;
// T7（Story 012）的股利畫面
const newDividendHref = (symbol: string) => ({ pathname: "/dividend/new", params: { symbol } }) as unknown as Href;
const editDividendHref = (id: string) => ({ pathname: "/dividend/[id]", params: { id } }) as unknown as Href;

const VERDICT = { up: "賺了", down: "虧了", flat: "不賺不賠" } as const;
const ARROW = { up: "▲", down: "▼", flat: "" } as const;

/**
 * 單一持股頁（M-04、M-06，Story 010）：數字摘要、核心／衛星切換、股價走勢、該證券的交易與股利（新到舊）。
 * 「新增交易」→ /transaction/new?symbol=；點交易 → /transaction/[id]（T4 的畫面）。
 * 「記錄股利」→ /dividend/new?symbol=；點股利 → /dividend/[id]（T7 的畫面）。預估股利另外列出，不算進總報酬。
 */
export default function HoldingDetailScreen({ symbol, repository, prices, today }: Props) {
  const insets = useSafeAreaInsets();
  const { ledger, loaded, holdings, quotesStatus, repository: repo } = useHoldings({ repository, prices, today });
  const holding = holdings.find((h) => h.symbol === symbol);
  const history = useMemo(() => (ledger ? symbolHistory(ledger, symbol) : []), [ledger, symbol]);
  const [bucketError, setBucketError] = useState<string | null>(null);

  const title = holding ? `${holding.name} ${symbol}` : symbol;

  if (!loaded) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>載入中…</Text>
      </View>
    );
  }

  if (!holding) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.muted}>記帳本裡沒有 {symbol} 的紀錄</Text>
        <AddButton symbol={symbol} />
      </View>
    );
  }

  const p = holding.position;
  const closed = p.shares === 0;
  const direction = directionOf(p.totalReturn);
  const color = pnlColors[direction];
  const type = securityTypeOf(symbol);
  const estimatedCash = ledger ? estimatedCashDividends(ledger.dividends, symbol) : 0;
  const estimatedStock = ledger ? estimatedStockDividends(ledger.dividends, symbol) : 0;

  const changeBucket = async (bucket: Bucket) => {
    if (bucket === holding.bucket) return;
    setBucketError(null);
    const result = await repo.setBucket(symbol, bucket);
    if (!result.ok) setBucketError(result.error.message);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
    >
      <Stack.Screen options={{ title }} />

      <View style={styles.card} accessibilityLabel="持股摘要">
        <Text style={styles.cardTitle}>
          {holding.name}（{symbol}）· {SECURITY_TYPE_LABEL[type]}
          {closed ? " · 已出清" : ""}
        </Text>
        <Text style={styles.verdict}>{p.totalReturn === null ? "缺少價格，暫時算不出總報酬" : VERDICT[direction]}</Text>
        <View style={styles.amountRow}>
          {ARROW[direction] ? (
            <Text style={[styles.arrow, { color }]} accessibilityElementsHidden importantForAccessibility="no">
              {ARROW[direction]}
            </Text>
          ) : null}
          <Text style={[styles.total, { color }]} accessibilityLabel="總報酬">
            {formatSignedAmountOrDash(p.totalReturn)}
          </Text>
        </View>
        <Text style={[styles.rate, { color }]} accessibilityLabel="報酬率">
          {formatRate(p.returnRate)}
        </Text>

        {closed ? null : (
          <>
            <Row label="持有股數" value={formatShares(p.shares)} />
            <Row label="平均成本" value={formatPrice(p.averageCost)} />
            <Row label="參考價" value={formatPrice(p.price)} />
            <Row label="市值" value={formatAmount(p.marketValue)} />
            <Row
              label="未實現損益"
              value={`${formatSignedAmountOrDash(p.unrealizedPnl)}（${formatRate(unrealizedRate(p))}）`}
              signed={p.unrealizedPnl}
            />
          </>
        )}
        <Row label="已實現損益" value={formatSignedAmountOrDash(p.realizedPnl)} signed={p.realizedPnl} />
        <Row label="已領股利" value={formatAmount(p.cashDividends)} />
        {estimatedCash > 0 || estimatedStock > 0 ? (
          <Row label="預估即將入帳" value={estimatedLabel(estimatedCash, estimatedStock)} />
        ) : null}
        <Row label="累計投入" value={formatAmount(p.invested)} />
        {closed ? null : <Row label="持有天數" value={p.holdingDays === null ? "—" : `${p.holdingDays} 天`} />}
      </View>

      {ledger ? (
        <HoldingAnnualizedReturnCard
          ledger={ledger}
          position={p}
          today={today ?? localIsoDate(new Date())}
          pricesLoading={quotesStatus === "loading"}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          核心／衛星
        </Text>
        <Segmented<Bucket>
          label="核心或衛星"
          options={[
            { value: "core", label: BUCKET_LABEL.core },
            { value: "satellite", label: BUCKET_LABEL.satellite },
          ]}
          value={holding.bucket}
          onChange={changeBucket}
        />
        <Text style={styles.hint}>
          {`預設${SECURITY_TYPE_LABEL[type]}歸${BUCKET_LABEL[defaultBucket(type)]}`}
          {holding.bucketOverridden ? "，你已手動改過" : ""}。切換會套用到這檔的全部紀錄。
        </Text>
        {bucketError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {bucketError}
          </Text>
        ) : null}
      </View>

      {!closed && p.averageCost !== null ? (
        <PriceHistoryCard
          symbol={symbol}
          name={holding.name}
          costPrice={p.averageCost}
          buyDate={p.holdingSince ?? undefined}
        />
      ) : null}

      <View style={styles.card}>
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            交易與股利紀錄
          </Text>
          <View style={styles.historyActions}>
            <AddDividendButton symbol={symbol} />
            <AddButton symbol={symbol} compact />
          </View>
        </View>
        {history.map((entry) => (
          <HistoryRow key={entry.kind === "trade" ? entry.transaction.id : entry.dividend.id} entry={entry} />
        ))}
      </View>
    </ScrollView>
  );
}

function AddButton({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`新增 ${symbol} 的交易`}
      onPress={() => router.push(newTransactionHref(symbol))}
      style={({ pressed }) => [compact ? styles.smallButton : styles.primaryButton, pressed && styles.pressed]}
    >
      <Text style={compact ? styles.smallButtonText : styles.primaryButtonText}>＋ 新增交易</Text>
    </Pressable>
  );
}

function AddDividendButton({ symbol }: { symbol: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`記錄 ${symbol} 的股利`}
      onPress={() => router.push(newDividendHref(symbol))}
      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
    >
      <Text style={styles.smallButtonText}>＋ 記錄股利</Text>
    </Pressable>
  );
}

function estimatedLabel(cash: number, stock: number): string {
  const parts = [cash > 0 ? `${formatAmount(cash)} 元` : null, stock > 0 ? formatShares(stock) : null];
  return parts.filter(Boolean).join(" + ");
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  if (entry.kind === "dividend") {
    const d = entry.dividend;
    const what =
      d.type === "cash" ? `現金股利 ${formatAmount(d.cashAmount ?? 0)} 元` : `股票股利 ${formatShares(d.stockShares ?? 0)}`;
    const sub = [d.status === "estimated" ? "預估即將入帳" : null, d.source === "auto" ? "自動帶入" : null, d.note ?? null]
      .filter(Boolean)
      .join(" · ");
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${d.exDate} ${what}${d.status === "estimated" ? "，預估即將入帳" : ""}，編輯這筆股利`}
        onPress={() => router.push(editDividendHref(d.id))}
        style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
      >
        <Text style={styles.historyDate}>{d.exDate}</Text>
        <View style={styles.historyBody}>
          <Text style={styles.historyMain}>{what}</Text>
          {sub ? <Text style={styles.historySub}>{sub}</Text> : null}
        </View>
        <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
          ›
        </Text>
      </Pressable>
    );
  }

  const t = entry.transaction;
  const side = t.side === "buy" ? "買入" : "賣出";
  const main = `${side} ${formatShares(t.shares)} @ ${formatPrice(t.price)}`;
  const costs = t.side === "buy" ? `手續費 ${formatAmount(t.fee)}` : `手續費 ${formatAmount(t.fee)} · 證交稅 ${formatAmount(t.tax)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.tradeDate} ${main}，編輯這筆交易`}
      onPress={() => router.push(editTransactionHref(t.id))}
      style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
    >
      <Text style={styles.historyDate}>
        {t.tradeDate}
        {t.tradeDateUnknown ? "\n日期待補" : ""}
      </Text>
      <View style={styles.historyBody}>
        <Text style={styles.historyMain}>{main}</Text>
        <Text style={styles.historySub}>
          {costs}
          {t.note ? ` · ${t.note}` : ""}
        </Text>
      </View>
      <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
        ›
      </Text>
    </Pressable>
  );
}

function Row({ label, value, signed }: { label: string; value: string; signed?: number | null }) {
  const color = signed === undefined ? colors.cardForeground : pnlColors[directionOf(signed)];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.md },
  content: { padding: space.md, gap: space.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
    ...shadow.sm,
  },
  cardTitle: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  verdict: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.cardForeground },
  amountRow: { flexDirection: "row", alignItems: "center" },
  arrow: { fontSize: fontSize.xl, marginRight: space.sm },
  total: { fontFamily: fonts.bold, fontSize: fontSize.display, fontVariant: ["tabular-nums"] },
  rate: { fontFamily: fonts.semibold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"] },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  rowValue: { fontFamily: fonts.medium, fontSize: fontSize.sm, fontVariant: ["tabular-nums"] },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.cardForeground },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  error: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.destructive },
  historyHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  historyActions: { flexDirection: "row", gap: space.sm },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touchTarget,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyDate: {
    width: 88,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  historyBody: { flex: 1, minWidth: 0 },
  historyMain: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.cardForeground,
    fontVariant: ["tabular-nums"],
  },
  historySub: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  chevron: { fontSize: fontSize.lg, color: colors.mutedForeground },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center" },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onAccent },
  smallButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    minHeight: 40,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.accent },
  pressed: { opacity: 0.7 },
});
