import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PriceLoadError, priceSource, stockDirectory } from "@/data";
import { calculatePnl, validateHoldingInput, type HoldingInput } from "@/domain/pnl";
import { resolveStock, searchStocks } from "@/domain/stockSearch";
import type { PnlResult, Quote, StockInfo } from "@/domain/types";
import { LabeledInput } from "@/ui/LabeledInput";
import { PnlCard } from "@/ui/PnlCard";
import { StockPicker } from "@/ui/StockPicker";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

type Errors = Partial<Record<keyof HoldingInput, string>>;

/** 斷網或證交所沒回應時的提示；按「計算」會再試一次 */
const LOAD_ERROR_MESSAGE = "行情載入失敗，請檢查網路後重試";

/**
 * 第一迭代：輸入一筆持股 → 看到盈虧。
 * 對應 docs/stories/001-single-holding-pnl.md 與 002-stock-picker.md
 * 路由入口在 src/app/index.tsx。
 */
export default function CalculateScreen() {
  const insets = useSafeAreaInsets();
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StockInfo | null>(null);
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ quote: Quote; result: PnlResult } | null>(null);

  useEffect(() => {
    let active = true;
    stockDirectory
      .getAll()
      .then((list) => {
        if (active) setStocks(list);
      })
      .catch(() => {
        if (active) setLoadError(LOAD_ERROR_MESSAGE);
      })
      .finally(() => {
        if (active) setStocksLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /** 清單上次沒載到（例如一開始斷網）時，按「計算」再載一次；失敗回 null */
  const ensureStocks = async (): Promise<StockInfo[] | null> => {
    if (stocks.length > 0) return stocks;
    setStocksLoading(true);
    try {
      const list = await stockDirectory.getAll();
      setStocks(list);
      return list;
    } catch {
      return null;
    } finally {
      setStocksLoading(false);
    }
  };

  const clearError = (key: keyof HoldingInput) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleQuery = (value: string) => {
    setQuery(value);
    setSelected(null);
    clearError("symbol");
  };

  const handleSelect = (stock: StockInfo) => {
    setSelected(stock);
    setQuery("");
    clearError("symbol");
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
  };

  /** 離開欄位就驗那一欄，錯誤緊貼欄位顯示 */
  const validateOne = (key: "buyPrice" | "shares") => () => {
    const value = key === "buyPrice" ? buyPrice : shares;
    if (value.trim() === "") return;
    const validation = validateHoldingInput({ symbol: "0000", buyPrice, shares });
    setErrors((prev) => ({ ...prev, [key]: validation.ok ? undefined : validation.errors[key] }));
  };

  /** 把選擇器的狀態解析成一檔股票；解析不了就回傳要顯示的錯誤 */
  const resolveSelectedStock = (list: StockInfo[]): { stock: StockInfo } | { error: string } => {
    if (selected) return { stock: selected };
    if (query.trim() === "") return { error: "請輸入代號或公司名稱，或從清單選擇" };
    const stock = resolveStock(query, list);
    if (stock) return { stock };
    if (searchStocks(query, list, 2).length > 1) return { error: "有多檔符合，請從清單選擇一檔" };
    return { error: `找不到這檔股票（${query.trim()}）` };
  };

  const calculate = async () => {
    if (loading) return;
    Keyboard.dismiss();
    setOutcome(null);
    setNotFound(null);
    setLoadError(null);

    const list = await ensureStocks();
    if (list === null) {
      setLoadError(LOAD_ERROR_MESSAGE);
      return;
    }
    const resolved = resolveSelectedStock(list);
    const symbol = "stock" in resolved ? resolved.stock.symbol : "";
    const validation = validateHoldingInput({ symbol, buyPrice, shares });
    const nextErrors: Errors = validation.ok ? {} : { ...validation.errors };
    if ("error" in resolved) nextErrors.symbol = resolved.error;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    if (!("stock" in resolved) || !validation.ok) return;

    setLoading(true);
    try {
      const quote = await priceSource.getQuote(resolved.stock.symbol);
      if (!quote) {
        setNotFound(`找不到這檔股票（${resolved.stock.symbol}）`);
        return;
      }
      setOutcome({ quote, result: calculatePnl(validation.holding, quote.price) });
    } catch (error) {
      if (!(error instanceof PriceLoadError)) throw error;
      setLoadError(LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "股票盈虧" }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading} accessibilityRole="header">
          你買的股票賺了還是虧了？
        </Text>

        <StockPicker
          stocks={stocks}
          query={query}
          selected={selected}
          loading={stocksLoading}
          error={errors.symbol}
          onChangeQuery={handleQuery}
          onSelect={handleSelect}
          onClear={handleClear}
        />
        <LabeledInput
          label="買入價"
          placeholder="每股價格"
          keyboardType="decimal-pad"
          returnKeyType="next"
          value={buyPrice}
          onChangeText={(v) => {
            setBuyPrice(v);
            clearError("buyPrice");
          }}
          onBlur={validateOne("buyPrice")}
          error={errors.buyPrice}
          testID="input-buy-price"
        />
        <LabeledInput
          label="數量"
          placeholder="股數"
          hint="以股為單位，1 張 = 1000 股"
          keyboardType="number-pad"
          returnKeyType="done"
          value={shares}
          onChangeText={(v) => {
            setShares(v);
            clearError("shares");
          }}
          onBlur={validateOne("shares")}
          onSubmitEditing={calculate}
          error={errors.shares}
          testID="input-shares"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="計算"
          accessibilityState={{ disabled: loading, busy: loading }}
          testID="button-calculate"
          onPress={calculate}
          disabled={loading}
          android_ripple={{ color: "rgba(255,255,255,0.25)" }}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.buttonText}>計算</Text>
          )}
        </Pressable>

        {loadError ? (
          <View
            style={styles.notFound}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="load-error"
          >
            <Text style={styles.notFoundText}>{loadError}</Text>
          </View>
        ) : null}

        {notFound ? (
          <View style={styles.notFound} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.notFoundText}>{notFound}</Text>
          </View>
        ) : null}

        {outcome ? <PnlCard quote={outcome.quote} result={outcome.result} /> : null}

        <Text style={styles.disclaimer}>資料僅供參考，不構成投資建議。</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  heading: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.foreground,
    marginBottom: space.lg,
    lineHeight: fontSize.xl * 1.4,
  },
  button: {
    minHeight: touchTarget,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.sm + 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
    marginBottom: space.md,
    overflow: "hidden",
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontFamily: fonts.semibold,
    color: colors.onAccent,
    fontSize: fontSize.lg,
  },
  notFound: {
    backgroundColor: colors.destructiveSurface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  notFoundText: { fontFamily: fonts.regular, color: colors.destructive, fontSize: fontSize.md },
  disclaimer: {
    marginTop: space.lg,
    fontFamily: fonts.regular,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
});
