import { router, Stack } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { localIsoDate } from "@/domain/buyDate";
import { buildDuel, duelConclusion, formatAnnualized, type DuelConclusion, type DuelSide } from "@/domain/duel";
import { DASH, formatAmount, formatRate, formatSignedAmountOrDash } from "@/domain/holdings";
import type { Bucket } from "@/domain/ledgerTypes";
import { pnlDirection } from "@/domain/pnl";
import type { BenchmarkPriceSources } from "@/hooks/useBenchmarkPrices";
import { useFeatures } from "@/hooks/useFeatures";
import { useHoldings } from "@/hooks/useHoldings";
import { useProStatus } from "@/hooks/useProStatus";
import { BenchmarkDuelCard } from "@/ui/BenchmarkDuelCard";
import { Button } from "@/ui/Button";
import { DirectionIcon } from "@/ui/Icon";
import { SkeletonCard } from "@/ui/Surface";
import { ProGate } from "@/ui/ProLockedCard";
import { cardSurface, cardTitle, colors, contentMaxWidth, fonts, fontSize, pnlColors, radius, space } from "@/ui/theme";

type Props = {
  /** 測試與畫面開發用；預設是 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  prices?: PriceSource;
  today?: string;
  /** 對決 B 的歷史價格來源；預設是 src/data 的 candleSource／corporateActionSource */
  benchmarkSources?: BenchmarkPriceSources;
};

const TITLE: Record<Bucket, string> = { core: "核心（ETF）", satellite: "衛星（個股）" };
const NO_RECORDS: Record<Bucket, string> = { core: "還沒有 ETF 紀錄", satellite: "還沒有個股紀錄" };

/** 方向符號：意思已由 +／- 承載，對輔助工具隱藏 */

/**
 * 個股 vs ETF 對決 A：我的核心 vs 我的衛星（P2-05 A，實作指南 T12）。對應 docs/stories/018-core-vs-satellite-duel.md。
 * 兩邊並排顯示總報酬、報酬率；年化報酬率是 Pro 功能（P2-08），proPlan 開關打開時用 ProGate 鎖住。
 * 上方一句白話結論只陳述事實（src/domain/duel.ts）。
 * 下方是對決 B「如果改買 0050」（Story 022，BenchmarkDuelCard），Pro 功能，proPlan 開關打開時用 ProGate 鎖住。從首頁「核心 vs 衛星，誰賺比較多？」進來，路由在 src/app/versus.tsx。
 */
export default function VersusScreen({ repository, prices, today: todayProp, benchmarkSources }: Props) {
  const insets = useSafeAreaInsets();
  const today = todayProp ?? localIsoDate(new Date());
  const { ledger, loaded, holdings, quotesStatus } = useHoldings({ repository, prices, today });
  const { proPlan } = useFeatures();
  const { pro } = useProStatus();
  // 功能開關關閉時沒有 Free／Pro 之分（Story 020），年化報酬率直接顯示
  const annualizedVisible = !proPlan || pro;

  const duel = useMemo(() => (ledger ? buildDuel(ledger, holdings, today) : null), [ledger, holdings, today]);
  const pricesLoading = quotesStatus === "loading";
  const conclusion = duel && !pricesLoading ? duelConclusion(duel, annualizedVisible) : null;
  const leader = conclusion?.kind === "compared" ? conclusion : null;

  const annualizedCard = duel ? <AnnualizedCard core={duel.core} satellite={duel.satellite} /> : null;
  const benchmarkCard = ledger ? (
    <BenchmarkDuelCard
      ledger={ledger}
      holdings={holdings}
      quotesLoading={pricesLoading}
      today={today}
      sources={benchmarkSources}
    />
  ) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
    >
      <Stack.Screen options={{ title: "個股 vs ETF 對決" }} />

      {!loaded || !duel ? (
        <View style={styles.loading}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </View>
      ) : (
        <>
          <Text style={styles.intro}>
            你的核心（ETF）和衛星（個股）放在一起看：花時間挑的個股，有沒有贏過 ETF？
          </Text>

          <ConclusionCard conclusion={conclusion} />

          {conclusion?.kind === "noRecords" ? (
            <Button
              label="新增交易"
              icon="plus"
              testID="button-add-transaction"
              onPress={() => router.push("/transaction/new")}
            />
          ) : (
            <>
              <View style={styles.sideRow}>
                {(["core", "satellite"] as const).map((bucket) => (
                  <SideCard
                    key={bucket}
                    bucket={bucket}
                    side={duel[bucket]}
                    pricesLoading={pricesLoading}
                    leaderLabel={
                      leader?.leader === bucket ? (leader.metric === "annualized" ? "年化較高" : "報酬率較高") : null
                    }
                  />
                ))}
              </View>

              {proPlan ? <ProGate feature="annualizedReturn">{annualizedCard}</ProGate> : annualizedCard}

              {proPlan ? <ProGate feature="etfDuelFull">{benchmarkCard}</ProGate> : benchmarkCard}
            </>
          )}

          <GlossaryCard />
          <Text style={styles.footnote}>這裡只整理你過去的紀錄，過去的結果不代表未來也會一樣。</Text>
        </>
      )}
    </ScrollView>
  );
}

function ConclusionCard({ conclusion }: { conclusion: DuelConclusion | null }) {
  return (
    <View style={[styles.card, styles.conclusionCard]} testID="duel-conclusion">
      <Text style={styles.cardTitle} accessibilityRole="header">
        結論
      </Text>
      {conclusion ? (
        <>
          <Text style={styles.conclusionText}>{conclusion.text}</Text>
          {conclusion.kind === "compared" && conclusion.note ? (
            <Text style={styles.hint} testID="duel-conclusion-note">
              {conclusion.note}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.hint}>價格更新中…</Text>
      )}
    </View>
  );
}

function SideCard({
  bucket,
  side,
  pricesLoading,
  leaderLabel,
}: {
  bucket: Bucket;
  side: DuelSide;
  pricesLoading: boolean;
  leaderLabel: string | null;
}) {
  const { summary } = side;
  const total = pricesLoading ? null : summary.totalReturn;
  const direction = total === null ? null : pnlDirection(total);
  const color = direction ? pnlColors[direction] : colors.mutedForeground;
  const priced = !pricesLoading && summary.missingPriceCount === 0;
  return (
    <View style={[styles.card, styles.sideCard]} accessibilityLabel={TITLE[bucket]} testID={`duel-${bucket}`}>
      <Text style={styles.cardTitle}>{TITLE[bucket]}</Text>
      {leaderLabel ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{leaderLabel}</Text>
        </View>
      ) : null}
      {side.hasRecords ? (
        <>
          <Text style={styles.label}>總報酬</Text>
          <View style={styles.bigNumberRow}>
            {direction ? <DirectionIcon direction={direction} size={14} color={color} /> : null}
            <Text style={[styles.bigNumber, { color }]} accessibilityLabel="總報酬">
              {formatSignedAmountOrDash(total)}
            </Text>
          </View>
          <Text style={styles.label}>報酬率</Text>
          <Text style={[styles.number, { color }]} accessibilityLabel="報酬率">
            {pricesLoading ? DASH : formatRate(summary.returnRate)}
          </Text>
          <View style={styles.rows}>
            <Row label="累計投入" value={formatAmount(summary.invested)} />
            <Row label="目前市值" value={priced ? formatAmount(summary.marketValue) : DASH} />
            <Row label="持有" value={`${summary.holdingCount} 檔`} />
          </View>
        </>
      ) : (
        <Text style={styles.hint}>{NO_RECORDS[bucket]}</Text>
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

/** 年化報酬率（P2-04）。持有未滿一年、算不出來時，用白話說明原因 */
function AnnualizedCard({ core, satellite }: { core: DuelSide; satellite: DuelSide }) {
  const sides = [
    { bucket: "core" as const, side: core },
    { bucket: "satellite" as const, side: satellite },
  ].filter(({ side }) => side.hasRecords);
  if (sides.length === 0) return null;
  const underOneYear = sides.some(({ side }) => side.annualized.kind === "underOneYear");
  const unavailable = sides.some(({ side }) => side.annualized.kind === "unavailable");
  return (
    <View style={styles.card} testID="duel-annualized">
      <Text style={styles.cardTitle} accessibilityRole="header">
        年化報酬率
      </Text>
      {sides.map(({ bucket, side }) => (
        <Row key={bucket} label={TITLE[bucket]} value={formatAnnualized(side.annualized)} />
      ))}
      {underOneYear ? (
        <Text style={styles.hint}>
          持有未滿一年：時間太短時，換算成「每年平均」會把短期的漲跌放大（例如一個月賺 5%，年化會變成 80%），所以先不顯示。
        </Text>
      ) : null}
      {unavailable ? (
        <Text style={styles.hint}>—：有股票拿不到現價，或紀錄還不夠，暫時算不出來。</Text>
      ) : null}
    </View>
  );
}

function GlossaryCard() {
  const items: [string, string][] = [
    ["總報酬", "實際賺（或虧）了多少錢，包含已經賣掉的、還沒賣的和領到的股利。"],
    ["報酬率", "總報酬 ÷ 累計投入。投入金額不同也能比，但沒有把持有時間長短算進去。"],
    ["年化報酬率", "把持有時間算進去，換算成「平均每年賺幾 %」，持有時間不同的兩邊也能公平比較。"],
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        這些數字怎麼看
      </Text>
      {items.map(([term, meaning]) => (
        <Text key={term} style={styles.glossary}>
          <Text style={styles.glossaryTerm}>{term}：</Text>
          {meaning}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.md,
    width: "100%",
    maxWidth: contentMaxWidth,
    alignSelf: "center",
  },
  loading: { gap: space.md },
  intro: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, lineHeight: fontSize.sm * 1.5 },
  card: {
    ...cardSurface,
    padding: space.md,
    gap: space.xs,
  },
  conclusionCard: { gap: space.sm },
  cardTitle,
  conclusionText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.cardForeground,
    lineHeight: fontSize.lg * 1.5,
  },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, lineHeight: fontSize.sm * 1.5 },
  sideRow: { flexDirection: "row", gap: space.sm },
  sideCard: { flex: 1, minWidth: 0, padding: space.sm + space.xs },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.secondarySurface,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.secondary },
  label: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, marginTop: space.xs },
  bigNumber: { fontFamily: fonts.bold, fontSize: fontSize.lg, fontVariant: ["tabular-nums"] },
  number: { fontFamily: fonts.semibold, fontSize: fontSize.md, fontVariant: ["tabular-nums"] },
  rows: { marginTop: space.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.xs,
  },
  rowLabel: { fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: fontSize.sm, flexShrink: 1 },
  rowValue: {
    fontFamily: fonts.medium,
    color: colors.cardForeground,
    fontSize: fontSize.sm,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  glossary: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.foreground, lineHeight: fontSize.sm * 1.6 },
  glossaryTerm: { fontFamily: fonts.semibold },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, textAlign: "center" },
  bigNumberRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
