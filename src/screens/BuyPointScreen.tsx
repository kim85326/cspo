import { router, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CandleSource } from "@/data/CandleSource";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import { formatIsoDate, parseBuyDate } from "@/domain/buyDate";
import {
  bandEdges,
  buyPosition,
  buyPositionSentence,
  COMPARE_PERIODS,
  type CompareRange,
  compareStart,
  comparisonChartCandles,
  comparisonWindow,
  DEFAULT_COMPARE_PERIOD,
  earliestCustomStart,
  IMPORTED_DATE_NOTE,
  listingNote,
  MIN_TRADING_DAYS,
  rangeLabel,
  validateCustomStart,
} from "@/domain/buyPosition";
import { periodLabel, shiftMonths } from "@/domain/candles";
import { useBuyPointHistory } from "@/hooks/useBuyPointHistory";
import type { BuyPointParams } from "@/ui/buyPointLink";
import { describeLoadError, type PriceHistory } from "@/hooks/usePriceHistory";
import { LevelBadge, PercentileBar } from "@/ui/BuyLevel";
import { Button } from "@/ui/Button";
import { CandleChart, formatPrice } from "@/ui/CandleChart";
import { DateField } from "@/ui/DateField";
import { Icon } from "@/ui/Icon";
import { Card, surfaceStyles } from "@/ui/Surface";
import { chartColors, colors, fonts, fontSize, iconSize, radius, space, type as typo } from "@/ui/theme";

type Props = BuyPointParams & {
  /** 測試用；預設是 src/data 的來源 */
  sources?: { candles: CandleSource; actions: CorporateActionSource };
};

type RangeChoice = number | "custom";

/**
 * P2-09「買在高點還是低點」單筆畫面（Story 030）：一筆買入跟它之前那段期間比。
 * 區間可切 3 個月／6 個月／1 年（預設）／3 年／自訂（起始日最早買入日前 3 年，結束日固定買入日）。
 * 圖畫的就是比較區間（還原股價），灰色帶標出高檔區與低檔區，買入點標在買入日、買入價。
 * 切換區間時圖、色帶、結論一起換。只陳述事實，不給買賣建議。
 */
export default function BuyPointScreen({ symbol, name, date, price, imported, saved, sources }: Props) {
  const [choice, setChoice] = useState<RangeChoice>(DEFAULT_COMPARE_PERIOD);
  // 自訂起始日：預設帶 1 年前，使用者再改
  const [customText, setCustomText] = useState(formatIsoDate(shiftMonths(date, -DEFAULT_COMPARE_PERIOD)));
  const custom = parseCustom(customText, date);
  // 自訂起始日不合法時，圖與結論先停在上一個合法的區間
  const [lastValidCustom, setLastValidCustom] = useState(shiftMonths(date, -DEFAULT_COMPARE_PERIOD));
  const range: CompareRange =
    choice === "custom" ? { start: custom.ok ? custom.iso : lastValidCustom } : choice;
  const from = compareStart(date, range);
  const history = useBuyPointHistory(symbol, from, date, sources);
  const data: PriceHistory | null = history.status === "ready" ? history.data : history.previous;
  const title = name ? `${name} ${symbol}` : symbol;

  const changeCustom = (text: string) => {
    setCustomText(text);
    const parsed = parseCustom(text, date);
    if (parsed.ok) setLastValidCustom(parsed.iso);
  };

  return (
    <ScrollView style={surfaceStyles.screen} contentContainerStyle={[surfaceStyles.screenContent, styles.content]}>
      <Stack.Screen options={{ title: "買在高點還是低點" }} />

      {saved ? (
        <View style={styles.saved} accessibilityRole="alert">
          <Icon name="check" size={iconSize.sm} color={colors.secondary} />
          <Text style={styles.savedText}>已記下這筆買入。順便看看買的時候算貴還是便宜：</Text>
        </View>
      ) : null}

      <Card accessibilityLabel="這筆買入">
        <Text style={styles.name}>{title}</Text>
        <Text style={styles.meta}>
          {formatIsoDate(date)} 買入 @ {formatPrice(price)}
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          比較區間
        </Text>
        <RangePicker value={choice} onChange={setChoice} />
        {choice === "custom" ? (
          <View style={styles.custom}>
            <DateField
              label="起始日"
              value={customText}
              onChange={changeCustom}
              min={earliestCustomStart(date)}
              max={previousDay(date)}
              hint={`最早 ${formatIsoDate(earliestCustomStart(date))}（買入日前 3 年），結束日固定是買入日 ${formatIsoDate(date)}`}
              error={custom.ok ? undefined : custom.error}
              testID="custom-start"
            />
          </View>
        ) : null}

        {history.status === "loading" && !data ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>股價載入中…</Text>
          </View>
        ) : null}
        {history.status === "error" ? <LoadError error={history.error} onRetry={history.retry} /> : null}
        {data && history.status !== "error" ? (
          <Verdict
            data={data}
            date={date}
            price={price}
            range={range}
            from={from}
            imported={imported}
            refreshing={history.status === "loading"}
          />
        ) : null}
      </Card>

      {saved ? <Button label="完成" icon="check" onPress={() => leave()} /> : null}
    </ScrollView>
  );
}

function RangePicker({ value, onChange }: { value: RangeChoice; onChange: (v: RangeChoice) => void }) {
  const options: { value: RangeChoice; label: string }[] = [
    ...COMPARE_PERIODS.map((p) => ({ value: p as RangeChoice, label: periodLabel(p) })),
    { value: "custom", label: "自訂" },
  ];
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="比較區間">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={`比較區間：${o.label}`}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            hitSlop={4}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 結論＋刻度條＋區間圖（色帶、買入點）＋註明 */
function Verdict({
  data,
  date,
  price,
  range,
  from,
  imported,
  refreshing,
}: {
  data: PriceHistory;
  date: string;
  price: number;
  range: CompareRange;
  from: string;
  imported?: boolean;
  refreshing: boolean;
}) {
  const actions = data.actions ?? [];
  const position = buyPosition(data.candles, actions, date, price, range);
  const sentence = buyPositionSentence(position, range);
  const note = listingNote(position, range);
  const chartCandles = comparisonChartCandles(data.candles, actions, date, from);
  const bands = position.kind === "ok" ? bandEdges(comparisonWindow(data.candles, actions, date, from).map((c) => c.adjClose)) : null;
  const [selected, setSelected] = useState<number | null>(null);
  const selectedIndex = selected !== null && selected < chartCandles.length ? selected : null;
  const selectedCandle = selectedIndex !== null ? chartCandles[selectedIndex] : undefined;

  return (
    <View style={styles.verdictBlock}>
      <View style={styles.verdict} testID="buy-verdict" accessibilityLabel={`買入點：${sentence}`}>
        <View style={styles.verdictHead}>
          {position.kind === "ok" ? <LevelBadge level={position.level} /> : null}
          <Text style={styles.verdictText}>{sentence}</Text>
        </View>
        {position.kind === "ok" ? <PercentileBar position={position} /> : null}
        <Text style={styles.footnote}>
          {position.kind === "ok"
            ? `比較${rangeLabel(range)}（${formatIsoDate(position.from)}–${formatIsoDate(position.to)}）共 ${position.days} 個交易日的${data.actions ? "還原" : ""}收盤價`
            : `這段期間只有 ${position.days} 個交易日的資料，至少要 ${MIN_TRADING_DAYS} 天才判斷`}
          {note ? `；${note}` : ""}
          {data.actions ? "" : "；除權息資料暫時拿不到，這次用未還原價格計算"}
        </Text>
        {imported ? (
          <Text style={styles.importNote} testID="imported-note">
            {IMPORTED_DATE_NOTE}
          </Text>
        ) : null}
      </View>

      {chartCandles.length > 0 ? (
        <View>
          <Text style={styles.dayLine} accessibilityLiveRegion="polite">
            {selectedCandle
              ? `${formatIsoDate(selectedCandle.date)} 收盤 ${formatPrice(selectedCandle.close)}`
              : "點圖可以看某一天的收盤價"}
          </Text>
          <CandleChart
            candles={chartCandles}
            mode={chartCandles.length > 260 ? "line" : "candle"}
            costPrice={price}
            buyDate={date}
            bands={bands ?? undefined}
            selectedIndex={selectedIndex}
            onSelect={setSelected}
            accessibilityLabel={`比較區間股價走勢，${formatIsoDate(chartCandles[0].date)} 到 ${formatIsoDate(
              chartCandles[chartCandles.length - 1].date,
            )}；${sentence}`}
          />
          {refreshing ? (
            <View style={styles.refreshing} pointerEvents="none">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
          <View style={styles.legend}>
            {bands ? (
              <View style={styles.legendItem}>
                <View style={styles.legendBand} />
                <Text style={styles.legendText}>灰底：區間收盤價前 20%（高檔區）與後 20%（低檔區）</Text>
              </View>
            ) : null}
            <Text style={styles.legendBuy}>
              ● 買入 {formatIsoDate(date)} @ {formatPrice(price)}
            </Text>
            <Text style={styles.legendText}>
              {chartCandles.length > 260 ? "區間超過一年改畫收盤價折線。" : ""}
              {data.actions ? "圖上是還原股價（除權息已折算），所以跟當時看到的報價可能不同。" : ""}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.muted}>查不到這檔股票這段期間的股價資料</Text>
        </View>
      )}
    </View>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { message, detail } = describeLoadError(error, "股價");
  return (
    <View style={styles.placeholder}>
      <Text style={styles.error} accessibilityRole="alert">
        {message}
      </Text>
      <Text style={styles.detail} selectable>
        技術細節：{detail}
      </Text>
      <Button label="重試" variant="secondary" size="sm" onPress={onRetry} />
    </View>
  );
}

/** 自訂起始日：格式（沿用 parseBuyDate）＋範圍（validateCustomStart） */
function parseCustom(text: string, buyDate: string): { ok: true; iso: string } | { ok: false; error: string } {
  const parsed = parseBuyDate(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!parsed.iso) return { ok: false, error: "請選起始日" };
  const error = validateCustomStart(parsed.iso, buyDate);
  return error ? { ok: false, error } : { ok: true, iso: parsed.iso };
}

function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  name: { ...typo.title, color: colors.cardForeground },
  meta: { ...typo.caption, color: colors.mutedForeground, marginTop: 2, fontVariant: ["tabular-nums"] },
  sectionTitle: { ...typo.title, color: colors.cardForeground, marginBottom: space.sm },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.secondarySurface,
    borderRadius: radius.md,
    padding: space.md,
  },
  savedText: { flex: 1, fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.secondary },
  custom: { marginTop: space.md },
  segmented: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.md, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.card },
  segmentText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  segmentTextOn: { fontFamily: fonts.semibold, color: colors.foreground },
  verdictBlock: { gap: space.md, marginTop: space.md },
  verdict: { backgroundColor: colors.background, borderRadius: radius.md, padding: space.md, gap: space.sm },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  verdictText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.md, lineHeight: 22, color: colors.foreground },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.xs, lineHeight: 18, color: colors.mutedForeground },
  importNote: { fontFamily: fonts.medium, fontSize: fontSize.xs, lineHeight: 18, color: colors.accent },
  dayLine: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, marginBottom: space.xs },
  refreshing: { position: "absolute", top: 24, left: 4 },
  legend: { gap: space.xs, marginTop: space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendBand: { width: 16, height: 10, borderRadius: 2, backgroundColor: chartColors.band, opacity: 0.3 },
  legendText: { flexShrink: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  legendBuy: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: chartColors.buy },
  placeholder: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: space.sm },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center" },
  error: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.destructive, textAlign: "center" },
  detail: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, textAlign: "center" },
});
