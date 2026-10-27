import { Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { priceSource, stockDirectory } from "@/data";
import { compareHoldings, MAX_COMPARE_HOLDINGS, type ComparisonResult } from "@/domain/compare";
import { calculatePnl, validateHoldingInput } from "@/domain/pnl";
import { resolveStock, searchStocks } from "@/domain/stockSearch";
import type { Holding, PnlResult, Quote, StockInfo } from "@/domain/types";
import { ComparisonCard } from "@/ui/ComparisonCard";
import {
  emptyHoldingForm,
  HoldingForm,
  type HoldingFormErrors,
  type HoldingFormState,
} from "@/ui/HoldingForm";
import { PnlCard } from "@/ui/PnlCard";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

type Outcome =
  | { kind: "single"; quote: Quote; result: PnlResult }
  | { kind: "comparison"; comparison: ComparisonResult };

/**
 * 輸入一檔或多檔持股 → 看盈虧；兩檔以上就排名比較。
 * 對應 docs/stories/001-single-holding-pnl.md、002-stock-picker.md、003-compare-stocks.md
 * 路由入口在 src/app/index.tsx。
 */
export default function CalculateScreen() {
  const insets = useSafeAreaInsets();
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [forms, setForms] = useState<HoldingFormState[]>([emptyHoldingForm(1)]);
  const nextId = useRef(2);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let active = true;
    stockDirectory.getAll().then((list) => {
      if (active) setStocks(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const updateForm = (id: number, patch: Partial<HoldingFormState>) => {
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const addForm = () => {
    if (forms.length >= MAX_COMPARE_HOLDINGS) return;
    setForms((prev) => [...prev, emptyHoldingForm(nextId.current++)]);
    setOutcome(null);
  };

  const removeForm = (id: number) => {
    setForms((prev) => (prev.length > 1 ? prev.filter((f) => f.id !== id) : prev));
    setOutcome(null);
  };

  /** 離開欄位就驗那一欄，錯誤緊貼欄位顯示 */
  const validateOne = (form: HoldingFormState, key: "buyPrice" | "shares") => {
    const value = form[key];
    if (value.trim() === "") return;
    const validation = validateHoldingInput({
      symbol: "0000",
      buyPrice: form.buyPrice,
      shares: form.shares,
    });
    updateForm(form.id, {
      errors: { ...form.errors, [key]: validation.ok ? undefined : validation.errors[key] },
    });
  };

  /** 把選擇器的狀態解析成一檔股票；解析不了就回傳要顯示的錯誤 */
  const resolveFormStock = (form: HoldingFormState): { stock: StockInfo } | { error: string } => {
    if (form.selected) return { stock: form.selected };
    if (form.query.trim() === "") return { error: "請輸入代號或公司名稱，或從清單選擇" };
    const stock = resolveStock(form.query, stocks);
    if (stock) return { stock };
    if (searchStocks(form.query, stocks, 2).length > 1) {
      return { error: "有多檔符合，請從清單選擇一檔" };
    }
    return { error: `找不到這檔股票（${form.query.trim()}）` };
  };

  const calculate = async () => {
    if (loading) return;
    Keyboard.dismiss();
    setOutcome(null);
    setNotFound(null);

    // 先把每一檔都驗完，錯誤一次顯示在各自的欄位下
    const holdings: Holding[] = [];
    const nextErrors = new Map<number, HoldingFormErrors>();
    for (const form of forms) {
      const resolved = resolveFormStock(form);
      const symbol = "stock" in resolved ? resolved.stock.symbol : "";
      const validation = validateHoldingInput({
        symbol,
        buyPrice: form.buyPrice,
        shares: form.shares,
      });
      const errors: HoldingFormErrors = validation.ok ? {} : { ...validation.errors };
      if ("error" in resolved) errors.symbol = resolved.error;
      nextErrors.set(form.id, errors);
      if (validation.ok && "stock" in resolved) holdings.push(validation.holding);
    }

    setForms((prev) => prev.map((f) => ({ ...f, errors: nextErrors.get(f.id) ?? {} })));
    const hasError = [...nextErrors.values()].some((e) => Object.keys(e).length > 0);
    if (hasError || holdings.length !== forms.length) return;

    setLoading(true);
    try {
      const quotes = await Promise.all(holdings.map((h) => priceSource.getQuote(h.symbol)));
      const missing = holdings.filter((_, i) => quotes[i] === null).map((h) => h.symbol);
      if (missing.length > 0) {
        setNotFound(`找不到這檔股票（${missing.join("、")}）`);
        return;
      }
      const inputs = holdings.map((holding, i) => ({ holding, quote: quotes[i] as Quote }));
      if (inputs.length === 1) {
        const { holding, quote } = inputs[0];
        setOutcome({ kind: "single", quote, result: calculatePnl(holding, quote.price) });
      } else {
        setOutcome({ kind: "comparison", comparison: compareHoldings(inputs) });
      }
    } finally {
      setLoading(false);
    }
  };

  const canAdd = forms.length < MAX_COMPARE_HOLDINGS;
  const isComparing = forms.length > 1;

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
          {isComparing ? "哪一檔表現比較好？" : "你買的股票賺了還是虧了？"}
        </Text>

        {forms.map((form, index) => (
          <HoldingForm
            key={form.id}
            index={index}
            form={form}
            stocks={stocks}
            removable={forms.length > 1}
            isLast={index === forms.length - 1}
            onChange={(patch) => updateForm(form.id, patch)}
            onBlurField={(key) => validateOne(form, key)}
            onRemove={() => removeForm(form.id)}
            onSubmit={calculate}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新增一檔比較"
          accessibilityState={{ disabled: !canAdd }}
          testID="button-add-holding"
          onPress={addForm}
          disabled={!canAdd}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.buttonPressed,
            !canAdd && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.addButtonText}>
            {canAdd ? "＋ 新增一檔比較" : `最多比較 ${MAX_COMPARE_HOLDINGS} 檔`}
          </Text>
        </Pressable>

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
            <Text style={styles.buttonText}>{isComparing ? "計算並比較" : "計算"}</Text>
          )}
        </Pressable>

        {notFound ? (
          <View style={styles.notFound} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.notFoundText}>{notFound}</Text>
          </View>
        ) : null}

        {outcome?.kind === "single" ? (
          <PnlCard quote={outcome.quote} result={outcome.result} />
        ) : null}
        {outcome?.kind === "comparison" ? (
          <ComparisonCard comparison={outcome.comparison} />
        ) : null}

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
  addButton: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
    backgroundColor: colors.card,
  },
  addButtonText: { fontFamily: fonts.medium, color: colors.primary, fontSize: fontSize.md },
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
