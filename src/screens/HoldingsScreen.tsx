import { router, Stack, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import {
  activeHoldings,
  closedHoldings,
  HOLDING_SORT_LABEL,
  sortHoldings,
  type HoldingSortKey,
} from "@/domain/holdings";
import { useHoldings } from "@/hooks/useHoldings";
import { HoldingRow } from "@/ui/HoldingRow";
import { Segmented } from "@/ui/Segmented";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

type Props = {
  /** 測試與畫面開發用；預設是 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  prices?: PriceSource;
  today?: string;
};

type Tab = "active" | "closed";

const SORT_KEYS: HoldingSortKey[] = ["marketValue", "returnRate", "totalReturn"];

/**
 * 持股明細（M-04，Story 010）：「持有中／已出清」兩個分頁；持有中可依市值、報酬率、總報酬排序。
 * 點一列進單一持股頁（/holdings/[symbol]）。
 */
export default function HoldingsScreen({ repository, prices, today }: Props) {
  const insets = useSafeAreaInsets();
  const { loaded, holdings, quotesStatus, asOf } = useHoldings({ repository, prices, today });
  const [tab, setTab] = useState<Tab>("active");
  const [sortKey, setSortKey] = useState<HoldingSortKey>("marketValue");

  const active = useMemo(() => sortHoldings(activeHoldings(holdings), sortKey), [holdings, sortKey]);
  // 已出清沒有市值，依總報酬（已實現 + 股利）排
  const closed = useMemo(() => sortHoldings(closedHoldings(holdings), "totalReturn"), [holdings]);
  const list = tab === "active" ? active : closed;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
    >
      <Stack.Screen options={{ title: "持股明細" }} />

      <Segmented<Tab>
        label="持股分頁"
        options={[
          { value: "active", label: `持有中（${active.length}）` },
          { value: "closed", label: `已出清（${closed.length}）` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "active" && active.length > 1 ? (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>排序</Text>
          <View style={styles.flex}>
            <Segmented<HoldingSortKey>
              label="排序方式"
              options={SORT_KEYS.map((k) => ({ value: k, label: HOLDING_SORT_LABEL[k] }))}
              value={sortKey}
              onChange={setSortKey}
            />
          </View>
        </View>
      ) : null}

      {quotesStatus === "error" ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Text style={styles.noticeText}>行情載入失敗，缺少價格的欄位暫時顯示 —</Text>
        </View>
      ) : null}
      {asOf && tab === "active" ? <Text style={styles.asOf}>參考價：{asOf} 收盤價</Text> : null}

      {!loaded ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>載入中…</Text>
        </View>
      ) : list.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <View style={styles.list}>
          {list.map((h) => (
            <HoldingRow
              key={h.symbol}
              holding={h}
              detailed
              onPress={() => router.push({ pathname: "/holdings/[symbol]", params: { symbol: h.symbol } })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  if (tab === "closed") {
    return (
      <View style={styles.empty}>
        <Text style={styles.muted}>還沒有已出清的股票</Text>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>還沒有持股</Text>
      <Text style={styles.muted}>記下第一筆買入，這裡就會算出每檔賺多少</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="新增交易"
        // T4（Story 009）同時開發中，合併前 typed routes 還不認得這個路由，先轉型
        onPress={() => router.push("/transaction/new" as Href)}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.primaryButtonText}>新增交易</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, gap: space.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  flex: { flex: 1 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sortLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  notice: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  noticeText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.foreground },
  asOf: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  list: { gap: space.sm },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space["2xl"] },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.foreground },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center" },
  primaryButton: {
    marginTop: space.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onAccent },
  pressed: { opacity: 0.7 },
});
