import { Stack } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ledgerRepository as defaultRepository, priceSource as defaultPriceSource } from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { localIsoDate } from "@/domain/buyDate";
import { ledgerSymbols } from "@/domain/holdings";
import { useLedger } from "@/hooks/useLedger";
import { useQuotes } from "@/hooks/useQuotes";
import { AssetHistoryCard } from "@/ui/AssetHistoryCard";
import { colors, space } from "@/ui/theme";

type Props = {
  /** 測試傳記憶體版與假來源；app 裡用 src/data 的 */
  repository?: LedgerRepository;
  priceSource?: PriceSource;
  candleSource?: CandleSource;
  /** 測試固定今天 */
  today?: string;
};

/**
 * 資產走勢頁（P2-07 走勢圖，docs/stories/023-asset-history.md），從首頁「看資產走勢」進來。
 * 現價跟首頁一樣用 useQuotes 抓，讓走勢最後一天等於首頁的目前市值。路由入口在 src/app/history.tsx。
 */
export default function AssetHistoryScreen({
  repository = defaultRepository,
  priceSource = defaultPriceSource,
  candleSource,
  today = localIsoDate(new Date()),
}: Props) {
  const insets = useSafeAreaInsets();
  const { ledger } = useLedger(repository);
  const symbols = useMemo(() => (ledger ? ledgerSymbols(ledger) : []), [ledger]);
  const { quotes, loading } = useQuotes(symbols, priceSource);
  const latestPrices = useMemo(
    () => (loading ? null : Object.fromEntries(Object.values(quotes).map((q) => [q.symbol, q.price]))),
    [quotes, loading],
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
    >
      <Stack.Screen options={{ title: "資產走勢" }} />
      {ledger ? (
        <AssetHistoryCard ledger={ledger} latestPrices={latestPrices} today={today} candleSource={candleSource} />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="載入中" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.md },
  loading: { paddingVertical: space["2xl"], alignItems: "center" },
});
