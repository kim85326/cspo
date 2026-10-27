import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { features } from "@/config/features";
import { holdingStore, PriceLoadError, priceSource, stockDirectory } from "@/data";
import { compareHoldings, MAX_COMPARE_HOLDINGS, type ComparisonResult } from "@/domain/compare";
import { applyExtraction, type ExtractionResult } from "@/domain/holdingExtract";
import { calculatePnl, validateHoldingInput } from "@/domain/pnl";
import { resolveStock, searchStocks } from "@/domain/stockSearch";
import type { Holding, PnlResult, Quote, SavedHolding, StockInfo } from "@/domain/types";
import { usePersistedHoldings } from "@/hooks/usePersistedHoldings";
import { useScreenshotImport } from "@/hooks/useScreenshotImport";
import { ComparisonCard } from "@/ui/ComparisonCard";
import {
  emptyHoldingForm,
  HoldingForm,
  type HoldingFormErrors,
  type HoldingFormState,
} from "@/ui/HoldingForm";
import { ImportSourceSheet } from "@/ui/ImportSourceSheet";
import { PnlCard } from "@/ui/PnlCard";
import { PriceHistoryCard } from "@/ui/PriceHistoryCard";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

type Outcome =
  | { kind: "single"; holding: Holding; quote: Quote; result: PnlResult }
  | { kind: "comparison"; comparison: ComparisonResult };

/** 斷網或證交所沒回應時的提示；按「計算」會再試一次 */
const LOAD_ERROR_MESSAGE = "行情載入失敗，請檢查網路後重試";

/**
 * 輸入一檔或多檔持股 → 看盈虧；兩檔以上就排名比較。按「計算」成功後把輸入存在手機，重開帶回。
 * 對應 docs/stories/001-single-holding-pnl.md、002-stock-picker.md、003-compare-stocks.md、004-remember-holdings.md、
 * 005-import-from-screenshot.md（從截圖匯入：按鈕在這裡，選圖與辨識在 hooks/useScreenshotImport，套用在 domain/applyExtraction；
 *   目前由 src/config/features.ts 的 screenshotImport 開關控制，預設關閉）、
 * 016-candle-chart.md（單檔結果下方的日 K 線圖與買入點，見 ui/PriceHistoryCard）
 * 現價來自 src/data 的 priceSource（app 裡是證交所收盤價，測試是假價）；載入失敗顯示「行情載入失敗」。
 * 路由入口在 src/app/index.tsx。
 */
export default function CalculateScreen() {
  const insets = useSafeAreaInsets();
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [forms, setForms] = useState<HoldingFormState[]>([emptyHoldingForm(1)]);
  const nextId = useRef(2);
  const [loading, setLoading] = useState(false);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  /**
   * 啟動時把上次存的持股帶回欄位（有幾筆就開幾檔，最多 MAX_COMPARE_HOLDINGS）。
   * 股票清單與手機資料各自非同步到達，誰後到誰呼叫 restoreSaved；兩邊都到齊才填，而且只填一次。
   */
  const stocksRef = useRef<StockInfo[]>([]);
  const savedRef = useRef<SavedHolding[] | null>(null);
  const restoredRef = useRef(false);
  const restoreSaved = useCallback(() => {
    const items = savedRef.current;
    if (restoredRef.current || !items || stocksRef.current.length === 0) return;
    restoredRef.current = true;
    if (items.length === 0) return;
    const restored = items.slice(0, MAX_COMPARE_HOLDINGS).map((item) => {
      const stock = stocksRef.current.find((s) => s.symbol === item.symbol) ?? null;
      const form = emptyHoldingForm(nextId.current++);
      return {
        ...form,
        selected: stock,
        query: stock ? "" : item.symbol,
        buyPrice: item.buyPrice,
        shares: item.shares,
        buyDate: item.buyDate ?? "",
      };
    });
    setForms(restored);
  }, []);

  const { saved, persist, clearSaved } = usePersistedHoldings(holdingStore, {
    onLoaded: (items) => {
      savedRef.current = items;
      restoreSaved();
    },
  });

  useEffect(() => {
    let active = true;
    stockDirectory
      .getAll()
      .then((list) => {
        if (!active) return;
        setStocks(list);
        stocksRef.current = list;
        restoreSaved();
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
  }, [restoreSaved]);

  /** 清單上次沒載到（例如一開始斷網）時，按「計算」再載一次；失敗回 null */
  const ensureStocks = async (): Promise<StockInfo[] | null> => {
    if (stocks.length > 0) return stocks;
    setStocksLoading(true);
    try {
      const list = await stockDirectory.getAll();
      setStocks(list);
      stocksRef.current = list;
      restoreSaved();
      return list;
    } catch {
      return null;
    } finally {
      setStocksLoading(false);
    }
  };

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

  /** 把截圖辨識結果套進欄位：空白筆被覆蓋、已填的保留、最多 MAX_COMPARE_HOLDINGS 檔 */
  const applyRecognized = useCallback(
    (result: ExtractionResult) => {
      const applied = applyExtraction(
        forms,
        result,
        stocks,
        () => nextId.current++,
        (id) => emptyHoldingForm(id),
      );
      setForms(applied.forms);
      setImportWarnings(applied.warnings);
      setOutcome(null);
      setNotFound(null);
    },
    [forms, stocks],
  );
  const screenshotImport = useScreenshotImport(applyRecognized);

  const openImportSheet = () => {
    Keyboard.dismiss();
    screenshotImport.dismissError();
    setImportWarnings([]);
    setImportSheetOpen(true);
  };

  /** 清掉手機裡存的資料，欄位與結果一起清空，回到只有一檔的初始狀態 */
  const handleClearSaved = async () => {
    setForms([emptyHoldingForm(nextId.current++)]);
    setNotFound(null);
    setOutcome(null);
    setImportWarnings([]);
    await clearSaved();
  };

  /** 離開欄位就驗那一欄，錯誤緊貼欄位顯示 */
  const validateOne = (form: HoldingFormState, key: "buyPrice" | "shares" | "buyDate") => {
    const value = form[key] ?? "";
    if (value.trim() === "") return;
    const validation = validateHoldingInput({
      symbol: "0000",
      buyPrice: form.buyPrice,
      shares: form.shares,
      buyDate: form.buyDate,
    });
    updateForm(form.id, {
      errors: { ...form.errors, [key]: validation.ok ? undefined : validation.errors[key] },
    });
  };

  /** 把選擇器的狀態解析成一檔股票；解析不了就回傳要顯示的錯誤 */
  const resolveFormStock = (
    form: HoldingFormState,
    list: StockInfo[],
  ): { stock: StockInfo } | { error: string } => {
    if (form.selected) return { stock: form.selected };
    if (form.query.trim() === "") return { error: "請輸入代號或公司名稱，或從清單選擇" };
    const stock = resolveStock(form.query, list);
    if (stock) return { stock };
    if (searchStocks(form.query, list, 2).length > 1) {
      return { error: "有多檔符合，請從清單選擇一檔" };
    }
    return { error: `找不到這檔股票（${form.query.trim()}）` };
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

    // 先把每一檔都驗完，錯誤一次顯示在各自的欄位下
    const holdings: Holding[] = [];
    const toSave: SavedHolding[] = [];
    const nextErrors = new Map<number, HoldingFormErrors>();
    for (const form of forms) {
      const resolved = resolveFormStock(form, list);
      const symbol = "stock" in resolved ? resolved.stock.symbol : "";
      const validation = validateHoldingInput({
        symbol,
        buyPrice: form.buyPrice,
        shares: form.shares,
        buyDate: form.buyDate,
      });
      const errors: HoldingFormErrors = validation.ok ? {} : { ...validation.errors };
      if ("error" in resolved) errors.symbol = resolved.error;
      nextErrors.set(form.id, errors);
      if (validation.ok && "stock" in resolved) {
        holdings.push(validation.holding);
        const buyDate = form.buyDate?.trim();
        toSave.push({
          symbol,
          buyPrice: form.buyPrice,
          shares: form.shares,
          ...(buyDate ? { buyDate } : {}),
        });
      }
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
        setOutcome({ kind: "single", holding, quote, result: calculatePnl(holding, quote.price) });
      } else {
        setOutcome({ kind: "comparison", comparison: compareHoldings(inputs) });
      }
      await persist(toSave);
    } catch (error) {
      if (!(error instanceof PriceLoadError)) throw error;
      setLoadError(LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  const canAdd = forms.length < MAX_COMPARE_HOLDINGS;
  /** 功能開關：截圖匯入開發中，預設關閉（見 src/config/features.ts） */
  const showScreenshotImport = features.screenshotImport;
  const isComparing = forms.length > 1;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "賺了嗎" }} />
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
            stocksLoading={stocksLoading}
            removable={forms.length > 1}
            isLast={index === forms.length - 1}
            onChange={(patch) => updateForm(form.id, patch)}
            onBlurField={(key) => validateOne(form, key)}
            onRemove={() => removeForm(form.id)}
            onSubmit={calculate}
          />
        ))}

        <View style={styles.secondaryRow}>
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
          {showScreenshotImport ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="從截圖匯入"
              accessibilityState={{ disabled: screenshotImport.recognizing, busy: screenshotImport.recognizing }}
              testID="button-import-screenshot"
              onPress={openImportSheet}
              disabled={screenshotImport.recognizing}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.buttonPressed,
                screenshotImport.recognizing && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.addButtonText}>從截圖匯入</Text>
            </Pressable>
          ) : null}
        </View>

        {showScreenshotImport && screenshotImport.recognizing ? (
          <View style={styles.importStatus} testID="import-loading" accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.importStatusText}>辨識中…</Text>
          </View>
        ) : null}

        {showScreenshotImport && screenshotImport.error ? (
          <View style={styles.notFound} testID="import-error" accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.notFoundText}>{screenshotImport.error}</Text>
            <View style={styles.importErrorActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="重試辨識"
                testID="button-import-retry"
                onPress={screenshotImport.retry}
                hitSlop={space.sm}
                style={({ pressed }) => [styles.importAction, pressed && styles.buttonPressed]}
              >
                <Text style={styles.importActionText}>重試</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="關閉錯誤訊息"
                testID="button-import-dismiss"
                onPress={screenshotImport.dismissError}
                hitSlop={space.sm}
                style={({ pressed }) => [styles.importAction, pressed && styles.buttonPressed]}
              >
                <Text style={styles.importActionText}>關閉</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showScreenshotImport && importWarnings.length > 0 ? (
          <View style={styles.importWarnings} testID="import-warnings" accessibilityLiveRegion="polite">
            {importWarnings.map((warning) => (
              <Text key={warning} style={styles.importWarningText}>
                {warning}
              </Text>
            ))}
          </View>
        ) : null}

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

        {outcome?.kind === "single" ? (
          <>
            <PnlCard quote={outcome.quote} result={outcome.result} />
            <PriceHistoryCard
              symbol={outcome.quote.symbol}
              name={outcome.quote.name}
              costPrice={outcome.holding.buyPrice}
              buyDate={outcome.holding.buyDate}
            />
          </>
        ) : null}
        {outcome?.kind === "comparison" ? (
          <ComparisonCard comparison={outcome.comparison} />
        ) : null}

        {saved.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清除已儲存的資料"
            testID="button-clear-saved"
            onPress={handleClearSaved}
            hitSlop={space.sm}
            style={({ pressed }) => [styles.clearSaved, pressed && styles.buttonPressed]}
          >
            <Text style={styles.clearSavedText}>清除已儲存的資料</Text>
          </Pressable>
        ) : null}

        <Text style={styles.disclaimer}>資料僅供參考，不構成投資建議。</Text>
      </ScrollView>

      <ImportSourceSheet
        visible={showScreenshotImport && importSheetOpen}
        onClose={() => setImportSheetOpen(false)}
        onPick={(source) => {
          setImportSheetOpen(false);
          void screenshotImport.importFrom(source);
        }}
      />
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
  secondaryRow: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  addButton: {
    flex: 1,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    backgroundColor: colors.card,
  },
  addButtonText: {
    fontFamily: fonts.medium,
    color: colors.primary,
    fontSize: fontSize.md,
    textAlign: "center",
  },
  importStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    marginBottom: space.sm,
  },
  importStatusText: { fontFamily: fonts.medium, color: colors.primary, fontSize: fontSize.md },
  importErrorActions: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  importAction: { minHeight: touchTarget - space.md, justifyContent: "center" },
  importActionText: {
    fontFamily: fonts.semibold,
    color: colors.destructive,
    fontSize: fontSize.md,
    textDecorationLine: "underline",
  },
  importWarnings: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.xs,
  },
  importWarningText: { fontFamily: fonts.regular, color: colors.accent, fontSize: fontSize.sm },
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
  clearSaved: {
    alignSelf: "center",
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  clearSavedText: {
    fontFamily: fonts.medium,
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    textDecorationLine: "underline",
  },
  disclaimer: {
    marginTop: space.lg,
    fontFamily: fonts.regular,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
});
