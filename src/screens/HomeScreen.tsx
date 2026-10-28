import { router } from "expo-router";
import { useMemo, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ledgerRepository as defaultRepository, priceSource as defaultPriceSource } from "@/data";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { localIsoDate } from "@/domain/buyDate";
import { ledgerSymbols, type HoldingView } from "@/domain/holdings";
import type { Bucket } from "@/domain/ledgerTypes";
import { buildOverview, oldestPriceDate } from "@/domain/overview";
import { formatReturnRate, formatSignedAmount, pnlDirection } from "@/domain/pnl";
import type { GroupSummary } from "@/domain/portfolio";
import type { PnlDirection, Quote } from "@/domain/types";
import { useFeatures } from "@/hooks/useFeatures";
import { useLedger } from "@/hooks/useLedger";
import { useQuotes } from "@/hooks/useQuotes";
import { AllocationCard } from "@/ui/AllocationCard";
import { PortfolioAnnualizedReturnCard } from "@/ui/AnnualizedReturnCard";
import { Button } from "@/ui/Button";
import { HoldingRow } from "@/ui/HoldingRow";
import { DirectionIcon } from "@/ui/Icon";
import {
  Card,
  EmptyState,
  LinkRow,
  Notice,
  SectionHeader,
  SkeletonBlock,
  SkeletonCard,
  surfaceStyles,
} from "@/ui/Surface";
import { colors, fonts, fontSize, pnlColors, pnlColorsOnBrand, radius, space, type } from "@/ui/theme";
import { VersionBadge } from "@/ui/VersionBadge";

/** 交易畫面是 Story 009，持股明細與單一持股頁是 Story 010，從截圖匯入是 Story 015 */
const ROUTES = {
  newTransaction: "/transaction/new",
  importScreenshot: "/import",
  holdings: "/holdings",
  holding: (symbol: string) => ({ pathname: "/holdings/[symbol]", params: { symbol } }) as const,
  calculate: "/calculate",
  /** 個股 vs ETF 對決 A（Story 027） */
  versus: "/versus",
  /** 資產走勢（Story 023） */
  history: "/history",
} as const;

/** 首頁最多列幾檔，其他的到「看全部持股」 */
const MAX_HOME_HOLDINGS = 5;

const VERDICT: Record<PnlDirection, string> = { up: "賺了", down: "虧了", flat: "不賺不賠" };

type Props = {
  /** 測試傳記憶體版；app 裡用 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  priceSource?: PriceSource;
};

/**
 * 首頁總覽（M-05）：深藍主視覺卡是整體損益，下面是核心（ETF）、衛星（個股）兩張卡與市值最大的幾檔持股。
 * 沒有任何交易時顯示空狀態與「新增第一筆交易」。快速試算在 /calculate。
 * 首頁是「總覽」分頁，標題與分頁列在 src/app/(tabs)/_layout.tsx。對應 docs/stories/011-home-overview.md。
 */
export default function HomeScreen({ repository = defaultRepository, priceSource = defaultPriceSource }: Props) {
  const { ledger } = useLedger(repository);
  const symbols = useMemo(() => (ledger ? ledgerSymbols(ledger) : []), [ledger]);
  const {
    quotes,
    loading: quotesLoading,
    refreshing,
    failedCount,
    updatedAt,
    refresh,
  } = useQuotes(symbols, priceSource);

  const features = useFeatures();
  const today = localIsoDate(new Date());
  const overview = useMemo(() => {
    if (!ledger) return null;
    return buildOverview(ledger, (symbol) => quotes[symbol], today);
  }, [ledger, quotes, today]);

  const isEmpty = !!ledger && ledger.transactions.length === 0 && ledger.dividends.length === 0;

  return (
    <ScrollView
      style={surfaceStyles.screen}
      contentContainerStyle={[surfaceStyles.screenContent, styles.content]}
      refreshControl={
        isEmpty || !ledger ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
      }
    >
      {!overview || !ledger ? (
        <HomeSkeleton />
      ) : isEmpty ? (
        <Card testID="home-empty">
          <EmptyState
            icon="filePlus"
            title="還沒有任何交易"
            message="把你在券商的買入、賣出一筆一筆記下來，這裡就會幫你算整體、ETF 和個股各賺了多少。"
          >
            <Button
              label="新增第一筆交易"
              icon="plus"
              testID="button-add-first-transaction"
              onPress={() => router.push(ROUTES.newTransaction)}
            />
            {/* Story 015：由功能開關 screenshotImport 控制 */}
            {features.screenshotImport ? (
              <Button
                label="從券商截圖匯入"
                variant="secondary"
                icon="image"
                accessibilityHint="用券商 app 的庫存截圖一次記好每一檔"
                testID="button-empty-import"
                onPress={() => router.push(ROUTES.importScreenshot)}
              />
            ) : null}
            <QuickCalcButton />
          </EmptyState>
        </Card>
      ) : (
        <>
          <OverallHero
            summary={overview.summary.overall}
            pricesLoading={quotesLoading}
            priceStatus={<PriceAsOf quotes={Object.values(quotes)} loading={quotesLoading} updatedAt={updatedAt} />}
          />
          {!quotesLoading && failedCount > 0 ? (
            <Notice
              tone="warning"
              testID="price-warning"
              message={`有 ${failedCount} 檔拿不到現價，市值與總報酬先不計算`}
              action={{ label: "重新載入", accessibilityLabel: "重新載入價格", onPress: () => void refresh() }}
            />
          ) : null}

          <View style={styles.actions}>
            <Button
              label="新增交易"
              icon="plus"
              testID="button-add-transaction"
              onPress={() => router.push(ROUTES.newTransaction)}
              style={styles.action}
            />
            <QuickCalcButton style={styles.action} />
          </View>

          <SectionHeader title="核心與衛星" />
          <View style={styles.bucketRow}>
            <BucketCard bucket="core" summary={overview.summary.core} pricesLoading={quotesLoading} />
            <BucketCard bucket="satellite" summary={overview.summary.satellite} pricesLoading={quotesLoading} />
          </View>
          <LinkRow
            icon="trendingUp"
            title="核心 vs 衛星，誰賺比較多？"
            subtitle="ETF 和個股並排比，附白話結論"
            testID="button-open-versus"
            onPress={() => router.push(ROUTES.versus)}
          />

          {/* 年化報酬率（P2-04）與配置圓餅圖（P2-07），Story 028 */}
          <PortfolioAnnualizedReturnCard
            ledger={ledger}
            holdings={overview.views}
            today={today}
            pricesLoading={quotesLoading}
          />
          <AllocationCard holdings={overview.views} holdingSettings={ledger.holdingSettings} pricesLoading={quotesLoading} />

          <LinkRow
            icon="lineChart"
            title="看資產走勢"
            subtitle="每天的總市值與累計投入"
            accessibilityHint="每天的總市值與累計投入走勢圖"
            testID="button-asset-history"
            onPress={() => router.push(ROUTES.history)}
          />

          <HoldingsSection holdings={overview.holdings} pricesLoading={quotesLoading} />
        </>
      )}

      <VersionBadge />
    </ScrollView>
  );
}

function QuickCalcButton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Button
      label="快速試算"
      variant="tonal"
      icon="calculator"
      accessibilityHint="不記帳，輸入代號、買入價、數量直接算盈虧"
      testID="button-open-calculate"
      onPress={() => router.push(ROUTES.calculate)}
      style={style}
    />
  );
}

/** 記帳本還沒讀到：主視覺卡 + 兩張小卡的骨架，資料到了版面不跳 */
function HomeSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityLabel="載入中">
      <View style={[styles.hero, styles.heroSkeleton]}>
        <SkeletonBlock tone="dark" width="30%" height={12} />
        <SkeletonBlock tone="dark" width="65%" height={40} />
        <SkeletonBlock tone="dark" width="25%" height={16} />
        <SkeletonBlock tone="dark" width="100%" height={48} />
      </View>
      <View style={styles.bucketRow}>
        <View style={styles.flex}>
          <SkeletonCard lines={2} />
        </View>
        <View style={styles.flex}>
          <SkeletonCard lines={2} />
        </View>
      </View>
    </View>
  );
}

function PriceAsOf({ quotes, loading, updatedAt }: { quotes: Quote[]; loading: boolean; updatedAt: Date | null }) {
  if (loading) return <Text style={styles.heroCaption}>價格更新中…</Text>;
  const asOf = oldestPriceDate(quotes);
  return (
    <Text style={styles.heroCaption} testID="price-as-of">
      {asOf ? `價格：${asOf} 收盤價` : updatedAt ? `價格更新於 ${updatedAt.toTimeString().slice(0, 5)}` : "還沒有價格"}
    </Text>
  );
}

/** 深藍主視覺：整體總報酬。漲跌色用深底專用的亮一階版本，對比才夠 */
function OverallHero({
  summary,
  pricesLoading,
  priceStatus,
}: {
  summary: GroupSummary;
  pricesLoading: boolean;
  priceStatus: ReactNode;
}) {
  const total = pricesLoading ? null : summary.totalReturn;
  const direction = total === null ? null : pnlDirection(total);
  const color = direction ? pnlColorsOnBrand[direction] : colors.onBrandMuted;
  const priced = !pricesLoading && summary.missingPriceCount === 0;
  return (
    <View style={styles.hero} accessibilityLabel="整體" testID="summary-overall">
      <View style={styles.heroTop}>
        <View>
          <View style={styles.heroRule} />
          <Text style={styles.heroOverline}>整體總報酬</Text>
        </View>
        <View style={styles.verdictPill}>
          <Text style={styles.verdict}>{direction ? VERDICT[direction] : "—"}</Text>
        </View>
      </View>

      <View style={styles.heroAmountRow}>
        {direction ? <DirectionIcon direction={direction} size={22} color={color} /> : null}
        <Text style={[styles.heroAmount, { color }]} accessibilityLabel="總報酬" numberOfLines={1} adjustsFontSizeToFit>
          {total === null ? "—" : formatSignedAmount(total)}
        </Text>
      </View>
      <Text style={[styles.heroRate, { color }]} accessibilityLabel="報酬率">
        {formatRate(pricesLoading ? null : summary.returnRate)}
      </Text>

      <View style={styles.heroStats}>
        <HeroStat label="累計投入" value={formatAmount(summary.invested)} />
        <HeroStat label="目前市值" value={priced ? formatAmount(summary.marketValue) : "—"} />
      </View>
      <View style={[styles.heroStats, styles.heroStatsSmall]}>
        <HeroStat label="已實現" value={formatSignedAmount(summary.realizedPnl)} signed={summary.realizedPnl} small />
        <HeroStat
          label="未實現"
          value={priced ? formatSignedAmount(summary.unrealizedPnl) : "—"}
          signed={priced ? summary.unrealizedPnl : undefined}
          small
        />
        <HeroStat label="已領股利" value={formatAmount(summary.cashDividends)} small />
      </View>
      {priceStatus}
    </View>
  );
}

function HeroStat({
  label,
  value,
  signed,
  small = false,
}: {
  label: string;
  value: string;
  signed?: number;
  small?: boolean;
}) {
  const color = signed === undefined ? colors.onBrand : pnlColorsOnBrand[pnlDirection(signed)];
  return (
    <View style={styles.heroStat} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text
        style={[small ? styles.heroStatValueSmall : styles.heroStatValue, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
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
    <Card style={styles.bucketCard} accessibilityLabel={title} testID={`summary-${bucket}`}>
      <View style={styles.bucketTitleRow}>
        <View style={[styles.bucketDot, bucket === "core" ? styles.dotCore : styles.dotSatellite]} />
        <Text style={styles.bucketTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {hasRecords ? (
        <>
          <View style={styles.bucketAmountRow}>
            {direction ? <DirectionIcon direction={direction} size={12} color={color} /> : null}
            <Text
              style={[styles.bucketReturn, { color }]}
              accessibilityLabel="總報酬"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {total === null ? "—" : formatSignedAmount(total)}
            </Text>
          </View>
          <Text style={[styles.bucketRate, { color }]} accessibilityLabel="報酬率">
            {formatRate(pricesLoading ? null : summary.returnRate)}
          </Text>
          <SummaryRows summary={summary} pricesLoading={pricesLoading} />
        </>
      ) : (
        <Text style={styles.hint}>{bucket === "core" ? "還沒有 ETF 紀錄" : "還沒有個股紀錄"}</Text>
      )}
    </Card>
  );
}

/** 累計投入、目前市值、已實現、未實現、已領股利。缺價格時市值與未實現顯示 —，不顯示少算的數字 */
function SummaryRows({ summary, pricesLoading }: { summary: GroupSummary; pricesLoading: boolean }) {
  const priced = !pricesLoading && summary.missingPriceCount === 0;
  const rows: [string, string, number | null][] = [
    ["累計投入", formatAmount(summary.invested), null],
    ["目前市值", priced ? formatAmount(summary.marketValue) : "—", null],
    ["已實現", formatSignedAmount(summary.realizedPnl), summary.realizedPnl],
    ["未實現", priced ? formatSignedAmount(summary.unrealizedPnl) : "—", priced ? summary.unrealizedPnl : null],
    ["已領股利", formatAmount(summary.cashDividends), null],
  ];
  return (
    <View style={styles.rows}>
      {rows.map(([label, value, signed]) => (
        <View key={label} style={styles.row} accessibilityLabel={`${label} ${value}`}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text
            style={[styles.rowValue, signed !== null && { color: pnlColors[pnlDirection(signed)] }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HoldingsSection({ holdings, pricesLoading }: { holdings: HoldingView[]; pricesLoading: boolean }) {
  return (
    <View style={styles.section}>
      <SectionHeader
        title="持股"
        action={
          <Button
            label="看全部"
            variant="ghost"
            size="sm"
            accessibilityLabel="看全部持股"
            testID="button-all-holdings"
            onPress={() => router.push(ROUTES.holdings)}
          />
        }
      />
      {holdings.length === 0 ? (
        <Card>
          <Text style={styles.hint}>目前沒有持有中的股票，已出清的在「看全部持股」</Text>
        </Card>
      ) : pricesLoading ? (
        // 價格還沒回來時 HoldingRow 會寫「缺少價格」，先放骨架，免得閃一下
        <View style={styles.list} accessible accessibilityLabel="價格更新中">
          {holdings.slice(0, Math.min(3, MAX_HOME_HOLDINGS)).map((h) => (
            <SkeletonCard key={h.symbol} lines={1} label="價格更新中" />
          ))}
        </View>
      ) : (
        // 持股列和持股明細共用（Story 010），首頁用精簡版
        <View style={styles.list}>
          {holdings.slice(0, MAX_HOME_HOLDINGS).map((h) => (
            <HoldingRow key={h.symbol} holding={h} onPress={() => router.push(ROUTES.holding(h.symbol))} />
          ))}
        </View>
      )}
    </View>
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
  flex: { flex: 1 },
  content: { paddingBottom: space.xl },
  skeleton: { gap: space.md },
  hero: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
    overflow: "hidden",
  },
  heroSkeleton: { gap: space.md },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  // icon 的金色箭頭縮成一條短線，當品牌記號
  heroRule: { width: 24, height: 3, borderRadius: 2, backgroundColor: colors.gold, marginBottom: space.sm },
  heroOverline: { ...type.label, color: colors.onBrandMuted },
  verdictPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  verdict: { ...type.bodyStrong, color: colors.onBrand },
  heroAmountRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  heroAmount: { ...type.display, flexShrink: 1 },
  heroRate: { fontFamily: fonts.semibold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"] },
  heroStats: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.brandBorder,
  },
  heroStatsSmall: { marginTop: space.sm, paddingTop: 0, borderTopWidth: 0 },
  heroStat: { flex: 1, minWidth: 0, gap: 2 },
  heroStatLabel: { ...type.caption, color: colors.onBrandMuted },
  heroStatValue: { ...type.numericLg, color: colors.onBrand },
  heroStatValueSmall: { ...type.numericSm, fontFamily: fonts.semibold, color: colors.onBrand },
  heroCaption: { ...type.caption, color: colors.onBrandMuted, marginTop: space.md, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: space.sm },
  action: { flex: 1, paddingHorizontal: space.sm },
  bucketRow: { flexDirection: "row", gap: space.sm },
  bucketCard: { flex: 1, minWidth: 0, padding: space.sm + space.xs, gap: 2 },
  bucketTitleRow: { flexDirection: "row", alignItems: "center", gap: space.xs + 2, marginBottom: space.xs },
  bucketDot: { width: 8, height: 8, borderRadius: 4 },
  dotCore: { backgroundColor: colors.secondary },
  dotSatellite: { backgroundColor: colors.gold },
  bucketTitle: { ...type.label, fontFamily: fonts.semibold, color: colors.foreground, flexShrink: 1 },
  bucketAmountRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  bucketReturn: { ...type.numericLg, flexShrink: 1 },
  bucketRate: { ...type.numericSm, fontFamily: fonts.semibold },
  hint: { ...type.label, fontFamily: fonts.regular, color: colors.mutedForeground },
  rows: { marginTop: space.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.xs,
  },
  rowLabel: { ...type.caption, color: colors.mutedForeground },
  rowValue: {
    ...type.caption,
    fontFamily: fonts.medium,
    color: colors.cardForeground,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    textAlign: "right",
  },
  section: { gap: space.sm },
  list: { gap: space.sm },
});
