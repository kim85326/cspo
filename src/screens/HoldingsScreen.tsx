import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
import { Button } from "@/ui/Button";
import { HoldingRow } from "@/ui/HoldingRow";
import { Segmented } from "@/ui/Segmented";
import { Card, EmptyState as EmptyView, Notice, SkeletonCard, surfaceStyles } from "@/ui/Surface";
import { colors, space, type } from "@/ui/theme";

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
 * 點一列進單一持股頁（/holdings/[symbol]）。是「持股」分頁，標題在 src/app/(tabs)/_layout.tsx。
 */
export default function HoldingsScreen({ repository, prices, today }: Props) {
  const { loaded, holdings, quotesStatus, asOf } = useHoldings({ repository, prices, today });
  const [tab, setTab] = useState<Tab>("active");
  const [sortKey, setSortKey] = useState<HoldingSortKey>("marketValue");

  const active = useMemo(() => sortHoldings(activeHoldings(holdings), sortKey), [holdings, sortKey]);
  // 已出清沒有市值，依總報酬（已實現 + 股利）排
  const closed = useMemo(() => sortHoldings(closedHoldings(holdings), "totalReturn"), [holdings]);
  const list = tab === "active" ? active : closed;

  return (
    <ScrollView style={surfaceStyles.screen} contentContainerStyle={[surfaceStyles.screenContent, styles.content]}>
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

      {quotesStatus === "error" ? <Notice tone="warning" alert message="行情載入失敗，缺少價格的欄位暫時顯示 —" /> : null}
      {asOf && tab === "active" ? <Text style={styles.asOf}>參考價：{asOf} 收盤價</Text> : null}

      {!loaded ? (
        <View style={styles.list}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
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
      <Card>
        <EmptyView icon="inbox" title="還沒有已出清的股票" message="全部賣掉的股票會移到這裡，保留已實現損益與股利。" />
      </Card>
    );
  }
  return (
    <Card>
      <EmptyView icon="pieChart" title="還沒有持股" message="記下第一筆買入，這裡就會算出每檔賺多少">
        <Button label="新增交易" icon="plus" onPress={() => router.push("/transaction/new")} />
      </EmptyView>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  flex: { flex: 1 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sortLabel: { ...type.label, color: colors.mutedForeground },
  asOf: { ...type.caption, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
  list: { gap: space.sm },
});
