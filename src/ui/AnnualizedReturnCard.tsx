import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { annualizedReturnText, type AnnualizedReturnText } from "@/domain/annualizedReturnText";
import type { HoldingView } from "@/domain/holdings";
import type { Bucket, Ledger } from "@/domain/ledgerTypes";
import { bucketOf } from "@/domain/portfolio";
import type { Position } from "@/domain/position";
import { portfolioAnnualizedReturns, positionAnnualizedReturn } from "@/domain/xirr";
import { useFeatures } from "@/hooks/useFeatures";
import { ProGate } from "./ProLockedCard";
import { colors, fonts, fontSize, pnlColors, radius, space } from "./theme";

/**
 * 年化報酬率（P2-04、實作指南 T11 的畫面，Story 028）。數字全部來自 src/domain/xirr.ts。
 * 年化報酬率是 Pro 功能（P2-08）：Pro 方案開關（proPlan）打開時用 ProGate 包住；
 * 開關關閉（APK 目前的狀態）時還沒有 Free／Pro 之分，直接顯示，免得「升級 Pro」按了被導回首頁。
 */
function AnnualizedReturnGate({ children }: { children: ReactNode }) {
  const { proPlan } = useFeatures();
  return proPlan ? <ProGate feature="annualizedReturn">{children}</ProGate> : <>{children}</>;
}

const LOADING: AnnualizedReturnText = { value: "—", reason: null, direction: null };

/** 各組的原因，同一個原因合併成一行，例如「整體、核心、衛星：第一筆投入到今天不到 365 天…」 */
function mergedReasons(rows: { label: string; text: AnnualizedReturnText }[]): string[] {
  const labelsByReason = new Map<string, string[]>();
  for (const { label, text } of rows) {
    if (!text.reason) continue;
    labelsByReason.set(text.reason, [...(labelsByReason.get(text.reason) ?? []), label]);
  }
  return [...labelsByReason].map(([reason, labels]) => `${labels.join("、")}：${reason}`);
}

const GROUPS: { key: "overall" | Bucket; label: string }[] = [
  { key: "overall", label: "整體" },
  { key: "core", label: "核心" },
  { key: "satellite", label: "衛星" },
];

type PortfolioProps = {
  ledger: Ledger;
  /** 記帳本裡每一檔（含已出清，賣出的現金流也要算） */
  holdings: readonly HoldingView[];
  today: string;
  /** 價格還在載入：先不算，免得閃出「缺少價格」 */
  pricesLoading?: boolean;
};

/** 首頁總覽：整體、核心、衛星三組的年化報酬率 */
export function PortfolioAnnualizedReturnCard({ ledger, holdings, today, pricesLoading = false }: PortfolioProps) {
  const texts = useMemo(() => {
    if (pricesLoading) return null;
    const positions = holdings.map((h) => h.position);
    const results = portfolioAnnualizedReturns(
      positions,
      ledger.transactions,
      ledger.dividends,
      ledger.holdingSettings,
      today,
    );
    const inGroup = (key: "overall" | Bucket) =>
      key === "overall" ? positions : positions.filter((p) => bucketOf(p, ledger.holdingSettings) === key);
    return Object.fromEntries(
      GROUPS.map(({ key }) => [key, annualizedReturnText(results[key], inGroup(key))]),
    ) as Record<"overall" | Bucket, AnnualizedReturnText>;
  }, [ledger, holdings, today, pricesLoading]);
  const reasons = texts
    ? mergedReasons(GROUPS.map(({ key, label }) => ({ label, text: texts[key] })))
    : ["價格更新中…"];

  return (
    <AnnualizedReturnGate>
      <View style={styles.card} testID="annualized-return-portfolio">
        <Text style={styles.title} accessibilityRole="header">
          年化報酬率
        </Text>
        {GROUPS.map(({ key, label }) => (
          <ReturnRow
            key={key}
            label={label}
            name={`${label}年化報酬率`}
            text={texts ? texts[key] : LOADING}
            showReason={false}
          />
        ))}
        {/* 三組常常是同一個原因（例如全部都未滿一年），原因合併寫在下面，不重複三次 */}
        {reasons.map((reason) => (
          <Text key={reason} style={styles.reason}>
            {reason}
          </Text>
        ))}
        <Text style={styles.footnote}>把每筆投入的時間算進去，換算成每年平均報酬（XIRR）。</Text>
      </View>
    </AnnualizedReturnGate>
  );
}

type HoldingProps = {
  ledger: Ledger;
  position: Position;
  today: string;
  /** 價格還在載入：先不算，免得閃出「缺少價格」 */
  pricesLoading?: boolean;
};

/** 單一持股頁：這一檔的年化報酬率 */
export function HoldingAnnualizedReturnCard({ ledger, position, today, pricesLoading = false }: HoldingProps) {
  const text = useMemo(
    () =>
      pricesLoading
        ? { ...LOADING, reason: "價格更新中…" }
        : annualizedReturnText(positionAnnualizedReturn(position, ledger.transactions, ledger.dividends, today), [
            position,
          ]),
    [ledger, position, today, pricesLoading],
  );
  return (
    <AnnualizedReturnGate>
      <View style={styles.card} testID="annualized-return-holding">
        <ReturnRow label="年化報酬率" name="年化報酬率" text={text} first />
      </View>
    </AnnualizedReturnGate>
  );
}

function ReturnRow({
  label,
  name,
  text,
  first = false,
  showReason = true,
}: {
  label: string;
  /** 螢幕閱讀器念的名稱，例如「核心年化報酬率」 */
  name: string;
  text: AnnualizedReturnText;
  first?: boolean;
  /** 原因寫在這一列下面；首頁總覽改成合併寫在卡片底部 */
  showReason?: boolean;
}) {
  const color = text.direction ? pnlColors[text.direction] : colors.cardForeground;
  return (
    <View
      style={[styles.row, first && styles.rowFirst]}
      accessible
      accessibilityLabel={`${name} ${text.value}${text.reason ? `，${text.reason}` : ""}`}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, { color }]}>{text.value}</Text>
      </View>
      {showReason && text.reason ? <Text style={styles.reason}>{text.reason}</Text> : null}
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
    gap: space.xs,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.mutedForeground },
  row: { paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  rowFirst: { borderTopWidth: 0, paddingVertical: 0 },
  rowMain: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  rowLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  rowValue: { fontFamily: fonts.semibold, fontSize: fontSize.md, fontVariant: ["tabular-nums"] },
  reason: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  footnote: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground, marginTop: space.xs },
});
