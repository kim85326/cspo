import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { formatStockLabel, searchStocks } from "@/domain/stockSearch";
import type { StockInfo } from "@/domain/types";
import { colors, fonts, fontSize, radius, shadow, space, touchTarget } from "./theme";

type Props = {
  stocks: StockInfo[];
  query: string;
  selected: StockInfo | null;
  error?: string;
  /** 顯示在標籤右邊的小提示，例如截圖匯入後的「請確認」 */
  badge?: string;
  /** 多個選擇器同時存在時用來區分（測試與 Maestro 用）；預設 input-stock */
  testID?: string;
  onChangeQuery: (query: string) => void;
  onSelect: (stock: StockInfo) => void;
  onClear: () => void;
};

const LABEL = "股票代號或名稱";
const MAX_SUGGESTIONS = 8;

/**
 * 股票選擇器：打代號、打公司名、或從清單點選。
 * - 空白時列出熱門股票讓人直接選。
 * - 選定後欄位顯示「台積電（2330）」，右側有清除鈕；再點欄位也會清除重選。
 */
export function StockPicker({
  stocks,
  query,
  selected,
  error,
  badge,
  testID = "input-stock",
  onChangeQuery,
  onSelect,
  onClear,
}: Props) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    if (selected) onClear();
    setFocused(true);
  };

  // 延遲收起清單，讓點選建議的動作先完成（網頁版 blur 會先於 click 觸發）
  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setFocused(false), 150);
  };

  const handleSelect = (stock: StockInfo) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setFocused(false);
    onSelect(stock);
  };

  const suggestions = focused && !selected ? searchStocks(query, stocks, MAX_SUGGESTIONS) : [];
  const showList = focused && !selected && stocks.length > 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{LABEL}</Text>
        {badge ? (
          <Text style={styles.badge} accessibilityLabel={`${LABEL} ${badge}`}>
            {badge}
          </Text>
        ) : null}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={LABEL}
          accessibilityHint="輸入代號或公司名稱，或從下方清單點選"
          testID={testID}
          placeholder="例如 2330 或 台積電"
          placeholderTextColor={colors.mutedForeground}
          value={selected ? formatStockLabel(selected) : query}
          onChangeText={onChangeQuery}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.input, error ? styles.inputError : null, selected && styles.inputSelected]}
        />
        {selected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清除股票"
            testID={`${testID}-clear`}
            onPress={onClear}
            hitSlop={8}
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {showList ? (
        <View style={styles.list} testID={`${testID}-suggestions`}>
          <Text style={styles.listHeader}>
            {query.trim() === "" ? "熱門股票" : suggestions.length > 0 ? "符合的股票" : "找不到符合的股票"}
          </Text>
          {suggestions.map((stock) => (
            <Pressable
              key={stock.symbol}
              accessibilityRole="button"
              accessibilityLabel={`選擇 ${stock.name} ${stock.symbol}`}
              testID={`${testID}-suggestion-${stock.symbol}`}
              onPress={() => handleSelect(stock)}
              android_ripple={{ color: colors.muted }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowSymbol}>{stock.symbol}</Text>
              <Text style={styles.rowName}>{stock.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: space.md },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: space.xs + 2 },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  badge: {
    marginLeft: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSurface,
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
  },
  inputRow: { position: "relative", justifyContent: "center" },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingRight: touchTarget,
    paddingVertical: space.sm + 4,
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    backgroundColor: colors.card,
    color: colors.foreground,
  },
  inputError: { borderColor: colors.destructive, borderWidth: 1.5 },
  inputSelected: { borderColor: colors.primary, fontFamily: fonts.medium },
  clear: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { fontSize: fontSize.md, color: colors.mutedForeground },
  pressed: { opacity: 0.6 },
  error: {
    marginTop: space.xs + 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.destructive,
  },
  list: {
    marginTop: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  listHeader: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    paddingHorizontal: space.md,
    paddingTop: space.sm + 2,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.muted },
  rowSymbol: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
    width: 72,
  },
  rowName: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.foreground },
});
