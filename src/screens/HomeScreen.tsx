import { router, Stack, type Href } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ledgerRepository as defaultRepository, priceSource as defaultPriceSource } from "@/data";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { localIsoDate } from "@/domain/buyDate";
import type { Bucket, HoldingSetting } from "@/domain/ledgerTypes";
import { buildOverview, ledgerSymbols, oldestPriceDate } from "@/domain/overview";
import { formatReturnRate, formatSignedAmount, pnlDirection } from "@/domain/pnl";
import { bucketOf, type GroupSummary } from "@/domain/portfolio";
import type { Position } from "@/domain/position";
import type { PnlDirection, Quote } from "@/domain/types";
import { useLedger } from "@/hooks/useLedger";
import { useQuotes } from "@/hooks/useQuotes";
import { colors, fonts, fontSize, pnlColors, radius, space, touchTarget } from "@/ui/theme";
import { VersionBadge } from "@/ui/VersionBadge";

/**
 * 交易與持股的路由由 Story 009（T4）、010（T5）做，三條線同時開發，路由先講好。
 * 在那兩張合併之前 typed routes 還不認得這些路徑，所以先轉成 Href；合併後可以拿掉 as。
 */
const ROUTES = {
  newTransaction: "/transaction/new" as Href,
  holdings: "/holdings" as Href,
  holding: (symbol: string) => `/holdings/${symbol}` as Href,
  calculate: "/calculate" as Href,
};

/** 首頁最多列幾檔，其他的到「看全部持股」 */
const MAX_HOME_HOLDINGS = 5;

const BUCKET_LABEL: Record<Bucket, string> = { core: "核心", satellite: "衛星" };

const VERDICT: Record<PnlDirection, string> = { up: "賺了", down: "虧了", flat: "不賺不賠" };

/** 方向符號：純文字字形，意思已由「賺了／虧了」與 +／- 承載，所以對輔助工具隱藏 */
const ARROW: Record<PnlDirection, string> = { up: "▲", down: "▼", flat: "" };

type Props = {
  /** 測試傳記憶體版；app 裡用 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  priceSource?: PriceSource;
};

/**
 * 首頁總覽（M-05）：整體、核心（ETF）、衛星（個股）三組數字，下面列市值最大的幾檔持股。
 * 沒有任何交易時顯示空狀態與「新增第一筆交易」。舊的試算畫面搬到 /calculate，從底部「快速試算」進去。
 * 對應 docs/stories/011-home-overview.md。路由入口在 src/app/index.tsx。
 */
export default function HomeScreen({ repository = defaultRepository, priceSource = defaultPriceSource }: Props) {
  const insets = useSafeAreaInsets();
  const { ledger } = useLedger(repository);
  const symbols = useMemo(() => (ledger ? ledgerSymbols(ledger) : []), [ledger]);
  const { quotes, loading: quotesLoading, refreshing, failedCount, updatedAt, refresh } = useQuotes(
    symbols,
    priceSource,
  );

  const overview = useMemo(() => {
    if (!ledger) return null;
    const prices: Record<string, number> = {};
    for (const [symbol, quote] of Object.entries(quotes)) prices[symbol] = quote.price;
    return buildOverview(ledger, prices, localIsoDate(new Date()));
  }, [ledger, quotes]);

  const isEmpty = !!ledger && ledger.transactions.length === 0 && ledger.dividends.length === 0;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
      refreshControl={
        isEmpty || !ledger ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
      }
    >
      <Stack.Screen options={{ title: "賺了嗎" }} />

      {!overview || !ledger ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="載入中" />
        </View>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <PriceStatus
            quotes={Object.values(quotes)}
            loading={quotesLoading}
            failedCount={failedCount}
            updatedAt={updatedAt}
            onRetry={() => void refresh()}
          />
          <OverallCard summary={overview.summary.overall} pricesLoading={quotesLoading} />
          <View style={styles.bucketRow}>
            <BucketCard bucket="core" summary={overview.summary.core} pricesLoading={quotesLoading} />
            <BucketCard bucket="satellite" summary={overview.summary.satellite} pricesLoading={quotesLoading} />
          </View>

          {/* 之後的任務放這裡：配置圓餅圖（P2-07，Story 019）；年化報酬率（P2-04）加在上面三張卡裡 */}

          <PrimaryButton label="新增交易" testID="button-add-transaction" onPress={() => router.push(ROUTES.newTransaction)} />

          <HoldingsSection
            holdings={overview.holdings}
            quotes={quotes}
            holdingSettings={ledger.holdingSettings}
            pricesLoading={quotesLoading}
          />
        </>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="快速試算"
        accessibilityHint="不記帳，輸入代號、買入價、數量直接算盈虧"
        testID="button-open-calculate"
        onPress={() => router.push(ROUTES.calculate)}
        style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
      >
        <Text style={styles.outlineButtonText}>快速試算</Text>
      </Pressable>
      <Text style={styles.calculateHint}>不記帳，直接輸入買入價和數量算盈虧</Text>

      <VersionBadge />
    </ScrollView>
  );
}

function EmptyState() {
  return (
    <View style={styles.card} testID="home-empty">
      <Text style={styles.emptyTitle} accessibilityRole="header">
        還沒有任何交易
      </Text>
      <Text style={styles.bodyText}>
        把你在券商的買入、賣出一筆一筆記下來，這裡就會幫你算整體、ETF 和個股各賺了多少。
      </Text>
      <PrimaryButton
        label="新增第一筆交易"
        testID="button-add-first-transaction"
        onPress={() => router.push(ROUTES.newTransaction)}
      />
    </View>
  );
}

function PriceStatus({
  quotes,
  loading,
  failedCount,
  updatedAt,
  onRetry,
}: {
  quotes: Quote[];
  loading: boolean;
  failedCount: number;
  updatedAt: Date | null;
  onRetry: () => void;
}) {
  if (loading) return <Text style={styles.priceStatus}>價格更新中…</Text>;
  const asOf = oldestPriceDate(quotes);
  return (
    <View style={styles.priceStatusRow}>
      <Text style={styles.priceStatus} testID="price-as-of">
        {asOf
          ? `價格：${asOf} 收盤價`
          : updatedAt
            ? `價格更新於 ${updatedAt.toTimeString().slice(0, 5)}`
            : "還沒有價格"}
      </Text>
      {failedCount > 0 ? (
        <View style={styles.warning} testID="price-warning">
          <Text style={styles.warningText}>有 {failedCount} 檔拿不到現價，市值與總報酬先不計算</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新載入價格"
            hitSlop={space.sm}
            onPress={onRetry}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>重新載入</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function OverallCard({ summary, pricesLoading }: { summary: GroupSummary; pricesLoading: boolean }) {
  const total = pricesLoading ? null : summary.totalReturn;
  const direction = total === null ? null : pnlDirection(total);
  const color = direction ? pnlColors[direction] : colors.mutedForeground;
  return (
    <View style={styles.card} accessibilityLabel="整體" testID="summary-overall">
      <Text style={styles.cardTitle}>整體</Text>
      <Text style={styles.verdict}>{direction ? VERDICT[direction] : "—"}</Text>
      <View style={styles.amountRow}>
        {direction && ARROW[direction] ? (
          <Text style={[styles.arrow, { color }]} accessibilityElementsHidden importantForAccessibility="no">
            {ARROW[direction]}
          </Text>
        ) : null}
        <Text style={[styles.totalReturn, { color }]} accessibilityLabel="總報酬">
          {total === null ? "—" : formatSignedAmount(total)}
        </Text>
      </View>
      <Text style={[styles.rate, { color }]} accessibilityLabel="報酬率">
        {formatRate(pricesLoading ? null : summary.returnRate)}
      </Text>
      <SummaryRows summary={summary} pricesLoading={pricesLoading} />
    </View>
  );
}

function BucketCard({
  bucket,
  summary,
  pricesLoading,
}: {
  bucket: Bucket;
  summary: GroupSummary;
  pricesLoading: boolean;
}) {
  const title = bucket === "core" ? "核心（ETF）" : "衛星（個股）";
  const hasRecords = summary.invested > 0 || summary.realizedPnl !== 0 || summary.cashDividends > 0;
  const total = pricesLoading ? null : summary.totalReturn;
  const direction = total === null ? null : pnlDirection(total);
  const color = direction ? pnlColors[direction] : colors.mutedForeground;
  return (
    <View style={[styles.card, styles.bucketCard]} accessibilityLabel={title} testID={`summary-${bucket}`}>
      <Text style={styles.cardTitle}>{title}</Text>
      {hasRecords ? (
        <>
          <Text style={[styles.bucketReturn, { color }]} accessibilityLabel="總報酬">
            {direction && ARROW[direction] ? `${ARROW[direction]} ` : ""}
            {total === null ? "—" : formatSignedAmount(total)}
          </Text>
          <Text style={[styles.bucketRate, { color }]} accessibilityLabel="報酬率">
            {formatRate(pricesLoading ? null : summary.returnRate)}
          </Text>
          <SummaryRows summary={summary} pricesLoading={pricesLoading} compact />
        </>
      ) : (
        <Text style={styles.hint}>{bucket === "core" ? "還沒有 ETF 紀錄" : "還沒有個股紀錄"}</Text>
      )}
    </View>
  );
}

/** 累計投入、目前市值、已實現、未實現、已領股利。缺價格時市值與未實現顯示 —，不顯示少算的數字 */
function SummaryRows({
  summary,
  pricesLoading,
  compact = false,
}: {
  summary: GroupSummary;
  pricesLoading: boolean;
  compact?: boolean;
}) {
  const priced = !pricesLoading && summary.missingPriceCount === 0;
  const rows: [string, string][] = [
    ["累計投入", formatAmount(summary.invested)],
    ["目前市值", priced ? formatAmount(summary.marketValue) : "—"],
    ["已實現", formatSignedAmount(summary.realizedPnl)],
    ["未實現", priced ? formatSignedAmount(summary.unrealizedPnl) : "—"],
    ["已領股利", formatAmount(summary.cashDividends)],
  ];
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={[styles.row, compact && styles.rowCompact]} accessibilityLabel={`${label} ${value}`}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={[styles.rowValue, compact && styles.rowValueCompact]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function HoldingsSection({
  holdings,
  quotes,
  holdingSettings,
  pricesLoading,
}: {
  holdings: Position[];
  quotes: Readonly<Record<string, Quote>>;
  holdingSettings: readonly HoldingSetting[];
  pricesLoading: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          持股
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="看全部持股"
          testID="button-all-holdings"
          hitSlop={space.sm}
          onPress={() => router.push(ROUTES.holdings)}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>看全部持股</Text>
        </Pressable>
      </View>
      {holdings.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.hint}>目前沒有持有中的股票，已出清的在「看全部持股」</Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {holdings.slice(0, MAX_HOME_HOLDINGS).map((position, index) => (
            <HomeHoldingRow
              key={position.symbol}
              position={position}
              name={quotes[position.symbol]?.name}
              bucket={bucketOf(position, holdingSettings)}
              pricesLoading={pricesLoading}
              first={index === 0}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * 首頁的持股列。Story 010（T5）會在 src/ui/ 做一個可重用的持股列，合併時換成那個。
 */
function HomeHoldingRow({
  position,
  name,
  bucket,
  pricesLoading,
  first,
}: {
  position: Position;
  name: string | undefined;
  bucket: Bucket;
  pricesLoading: boolean;
  first: boolean;
}) {
  const total = pricesLoading ? null : position.totalReturn;
  const direction = total === null ? null : pnlDirection(total);
  const color = direction ? pnlColors[direction] : colors.mutedForeground;
  const title = name ? `${name} ${position.symbol}` : position.symbol;
  const totalText = total === null ? "—" : formatSignedAmount(total);
  const rateText = formatRate(pricesLoading ? null : position.returnRate);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}，${BUCKET_LABEL[bucket]}，總報酬 ${totalText}，報酬率 ${rateText}`}
      testID={`home-holding-${position.symbol}`}
      onPress={() => router.push(ROUTES.holding(position.symbol))}
      style={({ pressed }) => [styles.holdingRow, !first && styles.holdingRowBorder, pressed && styles.pressed]}
    >
      <View style={styles.holdingMain}>
        <View style={styles.holdingTitleRow}>
          <Text style={styles.holdingName} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.tag, bucket === "core" ? styles.tagCore : styles.tagSatellite]}>
            {BUCKET_LABEL[bucket]}
          </Text>
        </View>
        <Text style={styles.holdingSub}>
          {position.shares.toLocaleString("en-US")} 股 · 市值{" "}
          {position.marketValue === null || pricesLoading ? "—" : formatAmount(position.marketValue)}
        </Text>
      </View>
      <View style={styles.holdingRight}>
        <Text style={[styles.holdingReturn, { color }]}>
          {direction && ARROW[direction] ? `${ARROW[direction]} ` : ""}
          {totalText}
        </Text>
        <Text style={[styles.holdingRate, { color }]}>{rateText}</Text>
      </View>
    </Pressable>
  );
}

function PrimaryButton({ label, testID, onPress }: { label: string; testID: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

/** 不帶正負號的金額：1,234,567 */
function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}

/** 累計投入為 0、或缺價格算不出來時顯示 —（規格 3.5） */
function formatRate(rate: number | null): string {
  return rate === null ? "—" : formatReturnRate(rate);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.md },
  loading: { paddingVertical: space["2xl"], alignItems: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.mutedForeground },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.foreground },
  bodyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.foreground,
    lineHeight: fontSize.md * 1.6,
    marginBottom: space.sm,
  },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  priceStatusRow: { gap: space.sm },
  priceStatus: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  warningText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.foreground },
  retry: { minHeight: touchTarget, justifyContent: "center" },
  retryText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.primary },
  verdict: { fontFamily: fonts.semibold, fontSize: fontSize.xl, color: colors.cardForeground },
  amountRow: { flexDirection: "row", alignItems: "center" },
  arrow: { fontSize: fontSize.xl, marginRight: space.sm },
  totalReturn: { fontFamily: fonts.bold, fontSize: fontSize.display, fontVariant: ["tabular-nums"] },
  rate: { fontFamily: fonts.semibold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"], marginBottom: space.sm },
  bucketRow: { flexDirection: "row", gap: space.sm },
  bucketCard: { flex: 1, minWidth: 0, padding: space.sm + space.xs },
  bucketReturn: { fontFamily: fonts.bold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"] },
  bucketRate: { fontFamily: fonts.semibold, fontSize: fontSize.sm, fontVariant: ["tabular-nums"], marginBottom: space.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  rowCompact: { paddingVertical: space.xs + 2, gap: space.xs },
  rowLabel: { fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: fontSize.sm },
  rowValue: {
    fontFamily: fonts.medium,
    color: colors.cardForeground,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    textAlign: "right",
  },
  rowValueCompact: { fontSize: fontSize.xs },
  section: { gap: space.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.mutedForeground },
  linkButton: { minHeight: touchTarget, justifyContent: "center" },
  linkText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.primary },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  holdingRow: {
    minHeight: touchTarget + space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  holdingRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  holdingMain: { flex: 1, minWidth: 0, gap: 2 },
  holdingTitleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  holdingName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.foreground },
  holdingSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  holdingRight: { alignItems: "flex-end", gap: 2 },
  holdingReturn: { fontFamily: fonts.semibold, fontSize: fontSize.md, fontVariant: ["tabular-nums"] },
  holdingRate: { fontFamily: fonts.medium, fontSize: fontSize.xs, fontVariant: ["tabular-nums"] },
  tag: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    paddingHorizontal: space.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  tagCore: { backgroundColor: colors.secondarySurface, color: colors.secondary },
  tagSatellite: { backgroundColor: colors.muted, color: colors.mutedForeground },
  primaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onAccent },
  outlineButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.md,
  },
  outlineButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.primary },
  calculateHint: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, textAlign: "center" },
  pressed: { opacity: 0.85 },
});
