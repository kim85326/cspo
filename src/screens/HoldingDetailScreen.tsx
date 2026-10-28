import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { estimatedCashDividends, estimatedStockDividends } from "@/domain/autoDividends";
import { formatIsoDate, localIsoDate } from "@/domain/buyDate";
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
import { Button } from "@/ui/Button";
import { BucketTag, directionOf } from "@/ui/HoldingRow";
import { DirectionIcon, Icon, type IconName } from "@/ui/Icon";
import { PriceHistoryCard } from "@/ui/PriceHistoryCard";
import { Segmented } from "@/ui/Segmented";
import { Card, EmptyState, KeyValueRow, SkeletonCard, surfaceStyles } from "@/ui/Surface";
import {
  colors,
  fonts,
  fontSize,
  iconSize,
  pnlColors,
  pnlSurfaces,
  pressedOpacity,
  radius,
  space,
  touchTarget,
  type as typo,
} from "@/ui/theme";

type Props = {
  symbol: string;
  /** 測試與畫面開發用；預設是 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  prices?: PriceSource;
  today?: string;
};

const newTransactionHref = (symbol: string) => ({ pathname: "/transaction/new", params: { symbol } }) as const;
const editTransactionHref = (id: string) => ({ pathname: "/transaction/[id]", params: { id } }) as const;
// T7（Story 012）的股利畫面
const newDividendHref = (symbol: string) => ({ pathname: "/dividend/new", params: { symbol } }) as const;
const editDividendHref = (id: string) => ({ pathname: "/dividend/[id]", params: { id } }) as const;

const VERDICT = { up: "賺了", down: "虧了", flat: "不賺不賠" } as const;

/**
 * 單一持股頁（M-04、M-06，Story 010）：數字摘要、核心／衛星切換、股價走勢、該證券的交易與股利（新到舊）。
 * 「新增交易」→ /transaction/new?symbol=；點交易 → /transaction/[id]（T4 的畫面）。
 * 「記錄股利」→ /dividend/new?symbol=；點股利 → /dividend/[id]（T7 的畫面）。預估股利另外列出，不算進總報酬。
 */
export default function HoldingDetailScreen({ symbol, repository, prices, today }: Props) {
  const { ledger, loaded, holdings, quotesStatus, repository: repo } = useHoldings({ repository, prices, today });
  const holding = holdings.find((h) => h.symbol === symbol);
  const history = useMemo(() => (ledger ? symbolHistory(ledger, symbol) : []), [ledger, symbol]);
  const [bucketError, setBucketError] = useState<string | null>(null);

  const title = holding ? `${holding.name} ${symbol}` : symbol;

  if (!loaded) {
    return (
      <ScrollView style={surfaceStyles.screen} contentContainerStyle={surfaceStyles.screenContent}>
        <Stack.Screen options={{ title }} />
        <SkeletonCard lines={6} />
        <SkeletonCard lines={2} />
      </ScrollView>
    );
  }

  if (!holding) {
    return (
      <ScrollView style={surfaceStyles.screen} contentContainerStyle={surfaceStyles.screenContent}>
        <Stack.Screen options={{ title }} />
        <Card>
          <EmptyState
            icon="inbox"
            title={`記帳本裡沒有 ${symbol} 的紀錄`}
            message="記下第一筆買入，就能看到這檔的損益與走勢。"
          >
            <AddButton symbol={symbol} />
          </EmptyState>
        </Card>
      </ScrollView>
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

  const rows: { label: string; value: string; signed?: number | null }[] = [
    ...(closed
      ? []
      : [
          { label: "持有股數", value: formatShares(p.shares) },
          { label: "平均成本", value: formatPrice(p.averageCost) },
          { label: "參考價", value: formatPrice(p.price) },
          { label: "市值", value: formatAmount(p.marketValue) },
          {
            label: "未實現損益",
            value: `${formatSignedAmountOrDash(p.unrealizedPnl)}（${formatRate(unrealizedRate(p))}）`,
            signed: p.unrealizedPnl,
          },
        ]),
    { label: "已實現損益", value: formatSignedAmountOrDash(p.realizedPnl), signed: p.realizedPnl },
    { label: "已領股利", value: formatAmount(p.cashDividends) },
    ...(estimatedCash > 0 || estimatedStock > 0
      ? [{ label: "預估即將入帳", value: estimatedLabel(estimatedCash, estimatedStock) }]
      : []),
    { label: "累計投入", value: formatAmount(p.invested) },
    ...(closed ? [] : [{ label: "持有天數", value: p.holdingDays === null ? "—" : `${p.holdingDays} 天` }]),
  ];

  return (
    <ScrollView style={surfaceStyles.screen} contentContainerStyle={[surfaceStyles.screenContent, styles.content]}>
      <Stack.Screen options={{ title }} />

      <Card accessibilityLabel="持股摘要">
        <View style={styles.summaryHead}>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {holding.name}
            </Text>
            <Text style={styles.meta}>
              {symbol} · {SECURITY_TYPE_LABEL[type]}
            </Text>
          </View>
          <View style={styles.tags}>
            <BucketTag bucket={holding.bucket} />
            {closed ? (
              <View style={styles.closedTag}>
                <Text style={styles.closedTagText}>已出清</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.totalBlock}>
          <Text style={styles.verdict}>
            {p.totalReturn === null ? "缺少價格，暫時算不出總報酬" : VERDICT[direction]}
          </Text>
          <View style={styles.amountRow}>
            <DirectionIcon direction={direction} size={18} color={color} />
            <Text style={[styles.total, { color }]} accessibilityLabel="總報酬" numberOfLines={1} adjustsFontSizeToFit>
              {formatSignedAmountOrDash(p.totalReturn)}
            </Text>
            <View style={[styles.ratePill, { backgroundColor: pnlSurfaces[direction] }]}>
              <Text style={[styles.rate, { color }]} accessibilityLabel="報酬率">
                {formatRate(p.returnRate)}
              </Text>
            </View>
          </View>
        </View>

        <View>
          {rows.map((r, i) => (
            <KeyValueRow
              key={r.label}
              label={r.label}
              value={r.value}
              first={i === 0}
              valueColor={r.signed === undefined ? colors.cardForeground : pnlColors[directionOf(r.signed)]}
            />
          ))}
        </View>
      </Card>

      {ledger ? (
        <HoldingAnnualizedReturnCard
          ledger={ledger}
          position={p}
          today={today ?? localIsoDate(new Date())}
          pricesLoading={quotesStatus === "loading"}
        />
      ) : null}

      <Card>
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
      </Card>

      {!closed && p.averageCost !== null ? (
        <PriceHistoryCard
          symbol={symbol}
          name={holding.name}
          costPrice={p.averageCost}
          buyDate={p.holdingSince ?? undefined}
          flush
        />
      ) : null}

      <Card style={styles.historyCard}>
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
      </Card>
    </ScrollView>
  );
}

function AddDividendButton({ symbol }: { symbol: string }) {
  return (
    <Button
      label="記錄股利"
      icon="coins"
      variant="secondary"
      size="sm"
      accessibilityLabel={`記錄 ${symbol} 的股利`}
      onPress={() => router.push(newDividendHref(symbol))}
      style={styles.flex}
    />
  );
}

function estimatedLabel(cash: number, stock: number): string {
  const parts = [cash > 0 ? `${formatAmount(cash)} 元` : null, stock > 0 ? formatShares(stock) : null];
  return parts.filter(Boolean).join(" + ");
}

function AddButton({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  return (
    <Button
      label="新增交易"
      icon="plus"
      variant={compact ? "secondary" : "primary"}
      size={compact ? "sm" : "md"}
      accessibilityLabel={`新增 ${symbol} 的交易`}
      onPress={() => router.push(newTransactionHref(symbol))}
      style={compact ? styles.flex : undefined}
    />
  );
}

const ENTRY_BADGE: Record<"buy" | "sell" | "dividend", { icon: IconName; bg: string; fg: string }> = {
  buy: { icon: "arrowDownLeft", bg: colors.secondarySurface, fg: colors.secondary },
  sell: { icon: "arrowUpRight", bg: colors.accentSurface, fg: colors.accent },
  dividend: { icon: "coins", bg: colors.muted, fg: colors.primary },
};

/** 每筆紀錄左邊的圓形圖示：買入、賣出、股利。只是輔助辨識，文字本身就寫了是哪一種 */
function EntryBadge({ kind }: { kind: "buy" | "sell" | "dividend" }) {
  const b = ENTRY_BADGE[kind];
  return (
    <View style={[styles.badge, { backgroundColor: b.bg }]}>
      <Icon name={b.icon} size={iconSize.sm} color={b.fg} />
    </View>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  if (entry.kind === "dividend") {
    const d = entry.dividend;
    const what =
      d.type === "cash"
        ? `現金股利 ${formatAmount(d.cashAmount ?? 0)} 元`
        : `股票股利 ${formatShares(d.stockShares ?? 0)}`;
    const sub = [
      d.status === "estimated" ? "預估即將入帳" : null,
      d.source === "auto" ? "自動帶入" : null,
      d.note ?? null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${d.exDate} ${what}${d.status === "estimated" ? "，預估即將入帳" : ""}，編輯這筆股利`}
        onPress={() => router.push(editDividendHref(d.id))}
        style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
      >
        <EntryBadge kind="dividend" />
        <View style={styles.historyBody}>
          <Text style={[styles.historyMain, d.status === "estimated" && styles.estimated]}>{what}</Text>
          <Text style={styles.historySub}>{formatIsoDate(d.exDate)} 除權息</Text>
          {sub ? <Text style={styles.historySub}>{sub}</Text> : null}
        </View>
        <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  const t = entry.transaction;
  const side = t.side === "buy" ? "買入" : "賣出";
  const main = `${side} ${formatShares(t.shares)} @ ${formatPrice(t.price)}`;
  const costs =
    t.side === "buy"
      ? `手續費 ${formatAmount(t.fee)}`
      : `手續費 ${formatAmount(t.fee)} · 證交稅 ${formatAmount(t.tax)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.tradeDate} ${main}${t.source === "dca" ? "，定期定額" : ""}，編輯這筆交易`}
      onPress={() => router.push(editTransactionHref(t.id))}
      style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
    >
      <EntryBadge kind={t.side} />
      <View style={styles.historyBody}>
        <View style={styles.mainRow}>
          <Text style={styles.historyMain}>{main}</Text>
          {t.source === "dca" ? (
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>定期定額</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.historySub}>{costs}</Text>
        <Text style={styles.historySub}>
          {formatIsoDate(t.tradeDate)}
          {t.tradeDateUnknown ? " · 日期待補" : ""}
          {t.note ? ` · ${t.note}` : ""}
        </Text>
      </View>
      <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  flex: { flex: 1, minWidth: 0 },
  summaryHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  name: { ...typo.title, color: colors.cardForeground },
  meta: { ...typo.caption, color: colors.mutedForeground, marginTop: 2, fontVariant: ["tabular-nums"] },
  tags: { flexDirection: "row", gap: space.xs },
  closedTag: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: colors.muted,
  },
  closedTagText: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.mutedForeground },
  totalBlock: { paddingVertical: space.sm, gap: space.xs },
  verdict: { ...typo.label, color: colors.mutedForeground },
  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  total: { ...typo.headline, flexShrink: 1 },
  ratePill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  rate: { ...typo.numericSm, fontFamily: fonts.semibold },
  sectionTitle: { ...typo.title, color: colors.cardForeground },
  hint: { ...typo.caption, color: colors.mutedForeground },
  error: { ...typo.label, fontFamily: fonts.regular, color: colors.destructive },
  historyCard: { gap: 0 },
  historyHeader: { gap: space.sm, marginBottom: space.sm },
  historyActions: { flexDirection: "row", gap: space.sm },
  mainRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs + 2 },
  /** 交易來源標記（Story 024 定期定額） */
  sourceTag: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    backgroundColor: colors.secondarySurface,
  },
  sourceTagText: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.secondary },
  estimated: { color: colors.mutedForeground },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm + space.xs,
    minHeight: touchTarget + space.md,
    paddingVertical: space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  historyBody: { flex: 1, minWidth: 0, gap: 2 },
  historyMain: { ...typo.numericSm, fontFamily: fonts.semibold, color: colors.cardForeground },
  historySub: { ...typo.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  pressed: { opacity: pressedOpacity },
});
