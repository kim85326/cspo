import { Redirect, router, Stack } from "expo-router";
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
import { holdingRecognizer as defaultRecognizer, stockDirectory as defaultStockDirectory } from "@/data";
import type { HoldingRecognizer } from "@/data/HoldingRecognizer";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { StockDirectory } from "@/data/StockDirectory";
import type { ExtractionResult, ReviewFlags } from "@/domain/holdingExtract";
import {
  addExtractionToRows,
  checkImportRows,
  toImportTransactions,
  type ImportRow,
  type ImportRowCheck,
} from "@/domain/importTransactions";
import { toHalfWidthNumber } from "@/domain/transactionForm";
import type { StockInfo } from "@/domain/types";
import { useFeatures } from "@/hooks/useFeatures";
import { useLedger } from "@/hooks/useLedger";
import { useScreenshotImport } from "@/hooks/useScreenshotImport";
import { useHaptics } from "@/ui/haptics";
import { DateField } from "@/ui/DateField";
import { REVIEW_BADGE } from "@/ui/HoldingForm";
import { ImportSourceSheet } from "@/ui/ImportSourceSheet";
import { LabeledInput } from "@/ui/LabeledInput";
import { StockPicker } from "@/ui/StockPicker";
import { cardSurface, colors, fonts, fontSize, pressedOpacity, radius, space, touchTarget } from "@/ui/theme";

export const PRIVACY_NOTE = "截圖只用來辨識，辨識完就丟掉，不會存在手機或電腦上。";

type Props = {
  /** 測試傳記憶體版；app 裡用 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  stockDirectory?: StockDirectory;
  recognizer?: HoldingRecognizer;
  /** 現在時間；決定建倉日期的預設值與「不可晚於今天」。測試固定用 */
  now?: () => Date;
};

/**
 * 從券商截圖匯入期初持股（P2-06，docs/stories/015）。路由入口在 src/app/import.tsx。
 * 選圖、辨識沿用 Story 005（hooks/useScreenshotImport、ui/ImportSourceSheet），套用沿用 domain/applyExtraction；
 * 核對完按「匯入」才一次寫進記帳本（每檔一筆買入，見 domain/importTransactions），中途離開不寫任何資料。
 * 由功能開關 screenshotImport 控制（useFeatures），關閉時導回首頁。
 */
export default function ImportScreen({
  repository,
  stockDirectory = defaultStockDirectory,
  recognizer = defaultRecognizer,
  now = () => new Date(),
}: Props) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const features = useFeatures();
  const { ledger, repository: repo } = useLedger(repository);
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const nextId = useRef(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** 股票清單（載不到就是空的）；辨識結果要等它到了才對得到股票 */
  const stocksReady = useRef<Promise<StockInfo[]> | null>(null);

  useEffect(() => {
    let active = true;
    const ready = stockDirectory.getAll().catch(() => {
      // 清單載不到：辨識出來的股票都對不到，每列會要求從清單選，匯入按鈕不能按
      return [] as StockInfo[];
    });
    stocksReady.current = ready;
    void ready.then((list) => {
      if (!active) return;
      setStocks(list);
      setStocksLoading(false);
    });
    return () => {
      active = false;
    };
  }, [stockDirectory]);

  /** 最新的列：辨識結果是非同步套用的，要拿當下的列，不能用舊 render 的 */
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  /** 辨識完成時清單可能還沒到（第一次接證交所要等一下），先等清單再套用，免得每一檔都對不到 */
  const applyRecognized = useCallback(
    (result: ExtractionResult) => {
      void (stocksReady.current ?? Promise.resolve([])).then((list) => {
        const applied = addExtractionToRows(rowsRef.current, result, list, () => nextId.current++, now());
        rowsRef.current = applied.forms;
        setRows(applied.forms);
        setWarnings(applied.warnings);
        setSaveError(null);
      });
    },
    [now],
  );
  const screenshotImport = useScreenshotImport(applyRecognized, recognizer);

  if (!features.screenshotImport) return <Redirect href="/" />;

  const updateRow = (id: number, patch: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaveError(null);
  };
  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSaveError(null);
  };

  const openSheet = () => {
    Keyboard.dismiss();
    screenshotImport.dismissError();
    setWarnings([]);
    setSheetOpen(true);
  };

  const check = ledger ? checkImportRows(rows, ledger, now()) : null;
  const canImport = !!check?.canImport && !saving && !screenshotImport.recognizing;

  const save = async () => {
    if (!canImport) return;
    setSaving(true);
    setSaveError(null);
    const result = await repo.addTransactions(toImportTransactions(rows, now()));
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error.message);
      return;
    }
    haptics.success();
    router.dismissTo("/");
  };

  const hasRows = rows.length > 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "從截圖匯入" }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.heading} accessibilityRole="header">
            從券商截圖匯入持股
          </Text>
          <Text style={styles.bodyText}>
            選券商 app「庫存」頁面的截圖，會讀出每一檔的股票、股數與平均成本。你核對完按「匯入」，每一檔會記成一筆買入交易。
          </Text>
          <Text style={styles.hint} testID="import-privacy">
            {PRIVACY_NOTE}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasRows ? "再加一張截圖" : "選擇截圖"}
          accessibilityState={{ disabled: screenshotImport.recognizing, busy: screenshotImport.recognizing }}
          testID="button-import-screenshot"
          onPress={openSheet}
          disabled={screenshotImport.recognizing}
          style={({ pressed }) => [
            hasRows ? styles.outlineButton : styles.primaryButton,
            pressed && styles.pressed,
            screenshotImport.recognizing && styles.disabled,
          ]}
        >
          <Text style={hasRows ? styles.outlineButtonText : styles.primaryButtonText}>
            {hasRows ? "再加一張截圖" : "選擇截圖"}
          </Text>
        </Pressable>

        {screenshotImport.recognizing ? (
          <View style={styles.status} testID="import-loading" accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>辨識中…</Text>
          </View>
        ) : null}

        {screenshotImport.error ? (
          <View style={styles.errorBox} testID="import-error" accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{screenshotImport.error}</Text>
            <View style={styles.errorActions}>
              <TextButton label="重試" accessibilityLabel="重試辨識" testID="button-import-retry" onPress={screenshotImport.retry} />
              <TextButton
                label="關閉"
                accessibilityLabel="關閉錯誤訊息"
                testID="button-import-dismiss"
                onPress={screenshotImport.dismissError}
              />
            </View>
          </View>
        ) : null}

        {warnings.length > 0 ? (
          <View style={styles.warningBox} testID="import-warnings" accessibilityLiveRegion="polite">
            {warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                {warning}
              </Text>
            ))}
          </View>
        ) : null}

        {rows.map((row, index) => (
          <ImportRowCard
            key={row.id}
            index={index}
            row={row}
            check={check?.rows.get(row.id)}
            stocks={stocks}
            stocksLoading={stocksLoading}
            onChange={(patch) => updateRow(row.id, patch)}
            onRemove={() => removeRow(row.id)}
          />
        ))}

        {hasRows ? (
          <View style={styles.footer}>
            <Text style={styles.hint}>
              會新增 {rows.length} 筆買入交易。手續費記 0，因為券商的平均成本已經含手續費。
            </Text>
            {saveError ? (
              <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="import-save-error">
                <Text style={styles.errorText}>{saveError}</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`匯入 ${rows.length} 筆交易`}
              accessibilityState={{ disabled: !canImport, busy: saving }}
              testID="button-import-save"
              onPress={save}
              disabled={!canImport}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, !canImport && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>匯入 {rows.length} 筆交易</Text>
              )}
            </Pressable>
            {!check?.canImport ? <Text style={styles.hint}>紅字的欄位都改好，才能匯入</Text> : null}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消匯入"
          testID="button-import-leave"
          onPress={leave}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>取消，不匯入</Text>
        </Pressable>
      </ScrollView>

      <ImportSourceSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(source) => {
          setSheetOpen(false);
          void screenshotImport.importFrom(source);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function ImportRowCard({
  index,
  row,
  check,
  stocks,
  stocksLoading,
  onChange,
  onRemove,
}: {
  index: number;
  row: ImportRow;
  check: ImportRowCheck | undefined;
  stocks: StockInfo[];
  stocksLoading: boolean;
  onChange: (patch: Partial<ImportRow>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const errors = check?.errors ?? {};
  const review: ReviewFlags = row.review ?? {};
  const badge = (key: keyof ReviewFlags) => (review[key] ? REVIEW_BADGE : undefined);
  const clearReview = (key: keyof ReviewFlags): Partial<ImportRow> =>
    review[key] ? { review: { ...review, [key]: false } } : {};

  return (
    <View style={styles.card} testID={`import-row-${n}`} accessibilityLabel={`第 ${n} 檔`}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>第 {n} 檔</Text>
        <TextButton label="刪除" accessibilityLabel={`刪除第 ${n} 檔`} testID={`button-remove-${n}`} onPress={onRemove} destructive />
      </View>
      <StockPicker
        stocks={stocks}
        query={row.query}
        selected={row.selected}
        loading={stocksLoading}
        error={errors.stock}
        badge={badge("stock")}
        testID={`input-stock-${n}`}
        onChangeQuery={(query) => onChange({ query, selected: null })}
        onSelect={(stock) => onChange({ selected: stock, query: "", ...clearReview("stock") })}
        onClear={() => onChange({ selected: null, query: "", ...clearReview("stock") })}
      />
      {check?.heldShares ? (
        <Text style={styles.heldWarning} testID={`import-held-${n}`}>
          記帳本裡已經有這檔 {check.heldShares.toLocaleString("en-US")} 股，匯入會再加一筆買入。如果截圖的股數已經包含這些，請刪掉這一檔。
        </Text>
      ) : null}
      <LabeledInput
        label="平均成本"
        placeholder="每股成本"
        keyboardType="decimal-pad"
        value={row.buyPrice}
        onChangeText={(buyPrice) => onChange({ buyPrice: toHalfWidthNumber(buyPrice), ...clearReview("buyPrice") })}
        error={errors.buyPrice}
        badge={badge("buyPrice")}
        testID={`input-buy-price-${n}`}
      />
      <LabeledInput
        label="股數"
        placeholder="1 張 = 1000 股"
        keyboardType="number-pad"
        value={row.shares}
        onChangeText={(shares) => onChange({ shares: toHalfWidthNumber(shares), ...clearReview("shares") })}
        error={errors.shares}
        badge={badge("shares")}
        testID={`input-shares-${n}`}
      />
      <DateField
        label="建倉日期"
        placeholder="點一下選日期"
        hint="預設今天；知道第一次買的日期就改，持有天數與年化報酬率會比較準"
        value={row.buyDate ?? ""}
        onChange={(buyDate) => onChange({ buyDate })}
        error={errors.buyDate}
        testID={`input-buy-date-${n}`}
      />
    </View>
  );
}

function TextButton({
  label,
  accessibilityLabel,
  testID,
  onPress,
  destructive = false,
}: {
  label: string;
  accessibilityLabel: string;
  testID: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      hitSlop={space.sm}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
    >
      <Text style={[styles.textButtonText, destructive && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.md },
  card: {
    ...cardSurface,
    padding: space.md,
    gap: space.xs,
  },
  heading: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.foreground },
  bodyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.foreground,
    lineHeight: fontSize.md * 1.6,
  },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  status: { flexDirection: "row", alignItems: "center", gap: space.sm },
  statusText: { fontFamily: fonts.medium, color: colors.primary, fontSize: fontSize.md },
  errorBox: { backgroundColor: colors.destructiveSurface, borderRadius: radius.md, padding: space.md },
  errorText: { fontFamily: fonts.regular, color: colors.destructive, fontSize: fontSize.md },
  errorActions: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  warningBox: { backgroundColor: colors.accentSurface, borderRadius: radius.md, padding: space.md, gap: space.xs },
  warningText: { fontFamily: fonts.regular, color: colors.foreground, fontSize: fontSize.sm },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm },
  rowTitle: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.foreground },
  heldWarning: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.foreground,
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.md,
  },
  footer: { gap: space.sm },
  primaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onAccent },
  outlineButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.primary },
  textButton: { minHeight: touchTarget - space.md, justifyContent: "center" },
  textButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.primary },
  destructiveText: { color: colors.destructive },
  linkButton: { alignSelf: "center", minHeight: touchTarget, justifyContent: "center", paddingHorizontal: space.md },
  linkText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  pressed: { opacity: pressedOpacity },
  disabled: { opacity: 0.6 },
});
