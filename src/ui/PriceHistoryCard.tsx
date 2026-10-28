import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatIsoDate, localIsoDate } from "@/domain/buyDate";
import {
  buyPosition,
  buyPositionSentence,
  IMPORTED_DATE_NOTE,
  listingNote,
  MIN_TRADING_DAYS,
} from "@/domain/buyPosition";
import {
  CHART_PERIODS,
  chartStart,
  dayChange,
  locateBuyDate,
  MA_LONG,
  MA_SHORT,
  movingAverage,
  periodLabel,
} from "@/domain/candles";
import type { Candle } from "@/domain/types";
import { type ChartMode, useChartPrefs } from "@/hooks/useChartPrefs";
import { describeLoadError, type PriceHistory, usePriceHistory } from "@/hooks/usePriceHistory";
import { LevelBadge, PercentileBar } from "./BuyLevel";
import { buyPointHref } from "./buyPointLink";
import { CandleChart, formatPrice } from "./CandleChart";
import { ChartGuide } from "./ChartGuide";
import { Icon, type IconName } from "./Icon";
import {
  chartColors,
  colors,
  fonts,
  fontSize,
  iconSize,
  pnlColors,
  pressedOpacity,
  radius,
  shadow,
  space,
  touchTarget,
  type,
} from "./theme";

type Props = {
  symbol: string;
  name: string;
  /** 成本價：成本線、賺賠區；沒給 buyPrice 時買入點百分位也用它（快速試算只有一個價格） */
  costPrice: number;
  /** 買入日期（ISO），選填 */
  buyDate?: string;
  /** 這筆買入的成交價（持股頁只有一筆買入時給；跟平均成本不同，平均成本含手續費） */
  buyPrice?: number;
  /** 拍照匯入的期初持股、或日期待補：結論旁註明「買入日為匯入日期」 */
  importedDate?: boolean;
  /**
   * 分好幾筆買入（持股頁）：圖上每筆都標一個點；結論不再拿平均成本跟第一筆的日期比，
   * 改請使用者到下方每一筆買入看各自的結果（P2-09「每筆買入交易各自判斷」）。給了就不看 buyDate。
   */
  buys?: { date: string; price: number }[];
  /** 放在有 gap 的版面（持股單頁）時拿掉上方外距 */
  flush?: boolean;
};

export const CANDLE_EMPTY = "查不到這檔股票這段期間的股價資料";
export const BUY_DATE_HINT = "填「買入日期」，就能看出你買在相對高點還是低點";

/**
 * 結果卡下方的走勢圖卡片（Story 016）。由上到下：
 * 1. 一句話結論（P2-09 買在高點還是低點）＋百分位刻度條；
 * 2. 期間（1 個月～1 年）、折線／K 棒、均線切換；
 * 3. 選到的那一天（預設最新一天）的開高低收與漲跌，左右按鈕可換天；
 * 4. 圖：成本線、賺賠區、買入點、十字線；
 * 5. 圖例。第一次看會先跳「怎麼看這張圖」。
 */
export function PriceHistoryCard({
  symbol,
  name,
  costPrice,
  buyDate: singleBuyDate,
  buyPrice = costPrice,
  importedDate,
  buys,
  flush = false,
}: Props) {
  const multiple = buys !== undefined && buys.length > 1;
  const buyDate = multiple ? undefined : singleBuyDate;
  const prefs = useChartPrefs();
  const history = usePriceHistory(symbol, buyDate, prefs.period);
  const [guideOpen, setGuideOpen] = useState<boolean | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 沒手動開關過說明時：第一次（還沒按過「知道了」）自動打開
  const showGuide = guideOpen ?? (prefs.loaded && !prefs.guideSeen);
  const data: PriceHistory | null = history.status === "ready" ? history.data : history.previous;
  const today = localIsoDate(new Date());
  const view = data ? chartView(data.candles, today, prefs.period) : null;

  const closeGuide = () => {
    setGuideOpen(false);
    prefs.update({ guideSeen: true });
  };

  return (
    <View style={[styles.card, flush && styles.flush]} accessibilityLabel="K 線圖">
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          股價走勢
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showGuide ? "收起看圖說明" : "怎麼看這張圖"}
          onPress={() => (showGuide ? closeGuide() : setGuideOpen(true))}
          hitSlop={8}
          style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
        >
          <Text style={styles.helpText}>{showGuide ? "收起說明" : "怎麼看？"}</Text>
        </Pressable>
      </View>

      {showGuide ? <ChartGuide onClose={closeGuide} /> : null}

      {multiple ? (
        <View style={styles.verdict} testID="multi-buy-note">
          <Text style={styles.verdictHint}>
            這段持有分 {buys.length} 筆買入，每一筆各自比較：點下方紀錄裡買入的「買在高點還是低點？」查看
          </Text>
        </View>
      ) : data ? (
        <BuyVerdict
          data={data}
          symbol={symbol}
          name={name}
          buyDate={buyDate}
          buyPrice={buyPrice}
          importedDate={importedDate}
          period={prefs.period}
        />
      ) : null}

      <Segmented
        label="期間"
        options={CHART_PERIODS.map((p) => ({ value: p, label: periodLabel(p) }))}
        value={prefs.period}
        onChange={(period) => prefs.update({ period })}
      />
      <View style={styles.controlRow}>
        <View style={styles.flex}>
          <Segmented<ChartMode>
            label="圖表樣式"
            options={[
              { value: "line", label: "折線" },
              { value: "candle", label: "K 棒" },
            ]}
            value={prefs.mode}
            onChange={(mode) => prefs.update({ mode })}
          />
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="均線"
          accessibilityState={{ checked: prefs.showMa }}
          onPress={() => prefs.update({ showMa: !prefs.showMa })}
          hitSlop={4}
          style={({ pressed }) => [styles.toggle, prefs.showMa && styles.toggleOn, pressed && styles.pressed]}
        >
          {prefs.showMa ? <Icon name="check" size={iconSize.sm} color={colors.secondary} /> : null}
          <Text style={[styles.toggleText, prefs.showMa && styles.toggleTextOn]}>均線</Text>
        </Pressable>
      </View>

      {history.status === "loading" && !data ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>K 線載入中…</Text>
        </View>
      ) : null}

      {history.status === "error" ? <LoadError error={history.error} onRetry={history.retry} /> : null}

      {data && view && view.candles.length === 0 && history.status !== "error" ? (
        <View style={styles.placeholder}>
          <Text style={styles.muted}>{CANDLE_EMPTY}</Text>
        </View>
      ) : null}

      {data && view && view.candles.length > 0 && history.status !== "error" ? (
        <ChartBody
          name={name}
          symbol={symbol}
          view={view}
          mode={prefs.mode}
          showMa={prefs.showMa}
          period={prefs.period}
          costPrice={costPrice}
          buyDate={buyDate}
          buys={multiple ? buys : undefined}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          refreshing={history.status === "loading"}
        />
      ) : null}
    </View>
  );
}

type ChartView = {
  /** 圖上要畫的日子（近 N 個月） */
  candles: Candle[];
  /** 每一天的前一個交易日收盤（算漲跌）；第一天用暖身資料的最後一天 */
  previousCloses: (number | undefined)[];
  ma: { short: (number | null)[]; long: (number | null)[] };
};

/** 從抓回來的資料切出圖上近 N 個月；均線用含暖身資料的整段算，圖一開始就有值 */
function chartView(all: Candle[], today: string, period: number): ChartView {
  const start = chartStart(today, period);
  const first = all.findIndex((c) => c.date > start && c.date <= today);
  if (first === -1) return { candles: [], previousCloses: [], ma: { short: [], long: [] } };
  const closes = all.map((c) => c.close);
  const short = movingAverage(closes, MA_SHORT);
  const long = movingAverage(closes, MA_LONG);
  const candles = all.slice(first).filter((c) => c.date <= today);
  const end = first + candles.length;
  return {
    candles,
    previousCloses: candles.map((_, i) => all[first + i - 1]?.close),
    ma: { short: short.slice(first, end), long: long.slice(first, end) },
  };
}

/** P2-09：一句話結論＋百分位刻度條。只陳述事實，不給買賣建議 */
function BuyVerdict({
  data,
  symbol,
  name,
  buyDate,
  buyPrice,
  importedDate,
  period,
}: {
  data: PriceHistory;
  symbol: string;
  name: string;
  buyDate?: string;
  buyPrice: number;
  importedDate?: boolean;
  period: number;
}) {
  if (!buyDate) {
    return (
      <View style={styles.verdict}>
        <Text style={styles.verdictHint}>{BUY_DATE_HINT}</Text>
      </View>
    );
  }
  const position = buyPosition(data.candles, data.actions ?? [], buyDate, buyPrice, period);
  const sentence = buyPositionSentence(position, period);
  const note = listingNote(position, period);
  return (
    <View style={styles.verdict} testID="buy-verdict" accessibilityLabel={`買入點：${sentence}`}>
      {position.kind === "ok" ? (
        <>
          <View style={styles.verdictHead}>
            <LevelBadge level={position.level} />
            <Text style={styles.verdictText}>{sentence}</Text>
          </View>
          <PercentileBar position={position} />
          <Text style={styles.footnote}>
            比較買入日前 {periodLabel(period)}（{formatIsoDate(position.from)}–{formatIsoDate(position.to)}）共{" "}
            {position.days} 個交易日的{data.actions ? "還原" : ""}收盤價
            {note ? `；${note}` : ""}
            {data.actions ? "" : "；除權息資料暫時拿不到，這次用未還原價格計算"}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.verdictText}>{sentence}</Text>
          <Text style={styles.footnote}>
            買入日前 {periodLabel(period)}只有 {position.days} 個交易日的資料，至少要 {MIN_TRADING_DAYS} 天才判斷
          </Text>
        </>
      )}
      {importedDate ? <Text style={styles.importNote}>{IMPORTED_DATE_NOTE}</Text> : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="看比較區間的走勢與高檔、低檔色帶"
        onPress={() =>
          router.push(buyPointHref({ symbol, name, date: buyDate, price: buyPrice, imported: importedDate }))
        }
        hitSlop={8}
        style={({ pressed }) => [styles.verdictLink, pressed && styles.pressed]}
      >
        <Text style={styles.verdictLinkText}>看比較區間的走勢與高檔／低檔色帶（3 個月～3 年、自訂）</Text>
        <Icon name="chevronRight" size={iconSize.sm} color={colors.secondary} />
      </Pressable>
    </View>
  );
}

function ChartBody({
  name,
  symbol,
  view,
  mode,
  showMa,
  period,
  costPrice,
  buyDate,
  buys,
  selectedDate,
  onSelectDate,
  refreshing,
}: {
  name: string;
  symbol: string;
  view: ChartView;
  mode: ChartMode;
  showMa: boolean;
  period: number;
  costPrice: number;
  buyDate?: string;
  buys?: { date: string; price: number }[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  refreshing: boolean;
}) {
  const { candles } = view;
  const found = selectedDate ? candles.findIndex((c) => c.date === selectedDate) : -1;
  const index = found === -1 ? candles.length - 1 : found;
  const selectIndex = (i: number) => onSelectDate(candles[Math.max(0, Math.min(candles.length - 1, i))].date);

  return (
    <>
      <DayDetail
        candle={candles[index]}
        previousClose={view.previousCloses[index]}
        costPrice={costPrice}
        isLatest={index === candles.length - 1}
        ma={showMa ? { short: view.ma.short[index], long: view.ma.long[index] } : null}
        onPrevious={index > 0 ? () => selectIndex(index - 1) : undefined}
        onNext={index < candles.length - 1 ? () => selectIndex(index + 1) : undefined}
      />
      <View>
        <CandleChart
          candles={candles}
          mode={mode}
          costPrice={costPrice}
          buyDate={buyDate}
          buys={buys}
          movingAverages={showMa ? view.ma : undefined}
          selectedIndex={index}
          onSelect={selectIndex}
          accessibilityLabel={chartSummary(name, symbol, candles, costPrice, buyDate, period)}
        />
        {refreshing ? (
          <View style={styles.refreshing} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          {mode === "line" ? (
            <LegendItem swatch={<View style={[styles.legendLine, { backgroundColor: chartColors.line }]} />}>
              收盤價
            </LegendItem>
          ) : (
            <>
              <LegendItem swatch={<View style={[styles.legendCandle, { backgroundColor: pnlColors.up }]} />}>
                紅 K 漲
              </LegendItem>
              <LegendItem swatch={<View style={[styles.legendCandle, { backgroundColor: pnlColors.down }]} />}>
                綠 K 跌
              </LegendItem>
            </>
          )}
          <Text style={styles.legendCost}>- - 成本 {formatPrice(costPrice)}</Text>
          {showMa ? (
            <>
              <LegendItem swatch={<View style={[styles.legendLine, { backgroundColor: chartColors.ma5 }]} />}>
                {MA_SHORT} 日均線
              </LegendItem>
              <LegendItem swatch={<View style={[styles.legendDash, { borderColor: chartColors.ma20 }]} />}>
                {MA_LONG} 日均線
              </LegendItem>
            </>
          ) : null}
        </View>
        {buyDate ? <Text style={styles.legendBuy}>{buyPointNote(candles, buyDate, period)}</Text> : null}
        {buys ? <Text style={styles.legendBuy}>● 每筆買入（日期、買入價）</Text> : null}
      </View>
    </>
  );
}

/** 選到的那一天：收盤、漲跌、比成本，第二行開高低（＋均線）。左右按鈕換天，給不方便點圖的人用 */
function DayDetail({
  candle,
  previousClose,
  costPrice,
  isLatest,
  ma,
  onPrevious,
  onNext,
}: {
  candle: Candle;
  previousClose: number | undefined;
  costPrice: number;
  isLatest: boolean;
  ma: { short: number | null; long: number | null } | null;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const change = dayChange(candle.close, previousClose);
  const direction = !change || change.change === 0 ? "flat" : change.change > 0 ? "up" : "down";
  const vsCost = ((candle.close - costPrice) / costPrice) * 100;
  const changeText = change
    ? `${direction === "up" ? "▲" : direction === "down" ? "▼" : ""}${formatPrice(Math.abs(change.change))}（${signed(change.percent)}%）`
    : "";
  return (
    <View style={styles.day} testID="day-detail" accessibilityLiveRegion="polite">
      <DayButton label="前一個交易日" icon="chevronLeft" onPress={onPrevious} />
      <View style={styles.dayBody}>
        <Text style={styles.dayDate}>
          {formatIsoDate(candle.date)}
          {isLatest ? "（最新）" : ""}
        </Text>
        <Text style={styles.dayMain}>
          收盤 <Text style={styles.dayClose}>{formatPrice(candle.close)}</Text>{" "}
          <Text style={{ color: pnlColors[direction] }}>{changeText}</Text>
          <Text style={styles.dayCost}> · 比成本 {signed(vsCost)}%</Text>
        </Text>
        <Text style={styles.daySub}>
          開 {formatPrice(candle.open)} · 高 {formatPrice(candle.high)} · 低 {formatPrice(candle.low)}
          {ma
            ? ` · ${MA_SHORT}日 ${ma.short === null ? "—" : formatPrice(ma.short)} · ${MA_LONG}日 ${ma.long === null ? "—" : formatPrice(ma.long)}`
            : ""}
        </Text>
      </View>
      <DayButton label="後一個交易日" icon="chevronRight" onPress={onNext} />
    </View>
  );
}

function DayButton({ label, icon, onPress }: { label: string; icon: IconName; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.dayButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={iconSize.lg} color={onPress ? colors.primary : colors.border} />
    </Pressable>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${label}：${option.label}`}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            hitSlop={4}
            style={({ pressed }) => [styles.segment, selected && styles.segmentOn, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
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
  const { message, detail } = describeLoadError(error);
  return (
    <View style={styles.placeholder}>
      <Text style={styles.error} accessibilityRole="alert">
        {message}
      </Text>
      <Text style={styles.detail} selectable>
        技術細節：{detail}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新載入 K 線"
        onPress={onRetry}
        style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
      >
        <Text style={styles.retryText}>重試</Text>
      </Pressable>
    </View>
  );
}

/** 圖例裡買入點的說明：在圖上、落在下一個交易日、早於圖表、K 棒還沒出來 */
export function buyPointNote(candles: Candle[], buyDate: string, period: number): string {
  const location = locateBuyDate(candles, buyDate);
  const label = formatIsoDate(buyDate);
  if (location.kind === "before") {
    return `買入日 ${label} 早於圖表範圍（目前顯示近 ${periodLabel(period)}）`;
  }
  if (location.kind === "after") return `買入日 ${label} 的股價還沒出來（收盤後更新）`;
  const tradeDate = candles[location.index].date;
  if (tradeDate === buyDate) return `● 買入 ${label}`;
  return `● 買入 ${label}（非交易日，標在 ${formatIsoDate(tradeDate)}）`;
}

/** 整張圖給螢幕閱讀器的一句話 */
function chartSummary(
  name: string,
  symbol: string,
  candles: Candle[],
  costPrice: number,
  buyDate: string | undefined,
  period: number,
): string {
  const first = formatIsoDate(candles[0].date);
  const last = candles[candles.length - 1];
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const parts = [
    `${name}（${symbol}）近 ${periodLabel(period)}股價走勢，${first} 到 ${formatIsoDate(last.date)}`,
    `最高 ${formatPrice(high)}、最低 ${formatPrice(low)}、最新收盤 ${formatPrice(last.close)}`,
    `成本 ${formatPrice(costPrice)}`,
  ];
  if (buyDate) parts.push(buyPointNote(candles, buyDate, period).replace("● ", ""));
  return parts.join("；");
}

function signed(n: number): string {
  const fixed = n.toFixed(2);
  return n > 0 ? `+${fixed}` : fixed === "-0.00" ? "0.00" : fixed;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.sm,
    ...shadow.sm,
  },
  flush: { marginTop: 0 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  title: { ...type.title, color: colors.cardForeground },
  helpButton: { minHeight: 32, justifyContent: "center", paddingHorizontal: space.sm },
  helpText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.secondary },
  flex: { flex: 1 },
  verdict: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  verdictHint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  verdictText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.foreground,
  },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.xs, lineHeight: 18, color: colors.mutedForeground },
  importNote: { fontFamily: fonts.medium, fontSize: fontSize.xs, lineHeight: 18, color: colors.accent },
  verdictLink: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32 },
  verdictLinkText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.secondary },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  segmentOn: { backgroundColor: colors.card, ...shadow.sm },
  segmentText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  segmentTextOn: { fontFamily: fonts.semibold, color: colors.foreground },
  controlRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  toggle: {
    minHeight: 42,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOn: { backgroundColor: colors.secondarySurface, borderColor: colors.secondary },
  toggleText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  toggleTextOn: { color: colors.secondary, fontFamily: fonts.semibold },
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
  error: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.destructive, textAlign: "center" },
  detail: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, textAlign: "center" },
  retry: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontFamily: fonts.medium, fontSize: fontSize.md, color: colors.primary },
  pressed: { opacity: pressedOpacity },
  day: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dayBody: { flex: 1, gap: 2 },
  dayDate: { fontFamily: fonts.medium, fontSize: fontSize.xs, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  dayMain: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.foreground, fontVariant: ["tabular-nums"] },
  dayClose: { fontFamily: fonts.semibold, fontSize: fontSize.md },
  dayCost: { color: colors.mutedForeground },
  daySub: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  dayButton: {
    width: 40,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  refreshing: { position: "absolute", top: 4, left: 4 },
  legend: { gap: space.xs },
  legendRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendDash: { width: 16, borderTopWidth: 2, borderStyle: "dashed" },
  legendCandle: { width: 6, height: 12, borderRadius: 1 },
  legendBuy: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: chartColors.buy },
  legendCost: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: chartColors.cost },
});
