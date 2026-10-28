import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stockDirectory as defaultStockDirectory } from "@/data";
import type { LedgerRepository, SaveFailedError } from "@/data/ledgerRepository";
import type { StockDirectory } from "@/data/StockDirectory";
import { formatIsoDate, localIsoDate } from "@/domain/buyDate";
import { defaultTaxRate } from "@/domain/fees";
import type { Ledger, TradeSide, Transaction } from "@/domain/ledgerTypes";
import type { LedgerError } from "@/domain/ledgerValidation";
import { replaySymbol } from "@/domain/position";
import { securityTypeOf } from "@/domain/security";
import {
  autoCosts,
  estimatedTotal,
  parseTransactionForm,
  toHalfWidthNumber,
  type TransactionFormErrors,
  type TransactionFormValues,
} from "@/domain/transactionForm";
import type { StockInfo } from "@/domain/types";
import { useLedger } from "@/hooks/useLedger";
import { DateField } from "@/ui/DateField";
import { LabeledInput } from "@/ui/LabeledInput";
import { StockPicker } from "@/ui/StockPicker";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

/**
 * 新增／編輯／刪除一筆交易（M-02，docs/stories/009）。
 * 路由入口：src/app/transaction/new.tsx（可帶 ?symbol=2330）、src/app/transaction/[id].tsx。
 *
 * - 手續費與證交稅依規格 3.2 即時帶入；使用者改過的欄位之後不再自動覆蓋，旁邊出現「重新計算」。
 * - 存檔與刪除都經過 ledgerRepository（從頭重播，賣超或連帶讓別筆賣超就拒絕，訊息說出是哪一筆）。
 * - 「儲存並繼續新增」留在表單，保留證券，其他欄位回到預設。
 */

const SIDE_LABEL: Record<TradeSide, string> = { buy: "買入", sell: "賣出" };
export const DATE_UNKNOWN_HINT = "舊版資料沒有買入日期，這裡暫用轉入當天，請改成實際的交易日期";

type Deps = {
  /** 測試與畫面開發傳記憶體版；預設 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  stockDirectory?: StockDirectory;
  /** 現在時間；決定預設日期。測試固定用 */
  now?: () => Date;
};

/** src/app/transaction/new.tsx */
export function NewTransactionScreen(deps: Deps) {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  return <TransactionForm {...deps} initialSymbol={typeof symbol === "string" ? symbol : undefined} />;
}

/** src/app/transaction/[id].tsx */
export function EditTransactionScreen(deps: Deps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionForm {...deps} transactionId={typeof id === "string" ? id : ""} />;
}

type FormState = TransactionFormValues & {
  /** 使用者手動改過手續費／證交稅：之後改價格、股數不再自動覆蓋 */
  feeOverridden: boolean;
  taxOverridden: boolean;
};

type Props = Deps & {
  /** 有值是編輯模式 */
  transactionId?: string;
  /** 新增模式預選的證券代號 */
  initialSymbol?: string;
};

/** 等記帳本讀完、找到要編輯的那筆，再把表單畫出來（表單的初始值只在掛上時決定一次） */
function TransactionForm({
  repository,
  stockDirectory = defaultStockDirectory,
  now = () => new Date(),
  transactionId,
  initialSymbol,
}: Props) {
  const { ledger, repository: repo } = useLedger(repository);
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const isEdit = transactionId !== undefined;
  const title = isEdit ? "編輯交易" : "新增交易";

  useEffect(() => {
    let active = true;
    stockDirectory
      .getAll()
      .then((list) => {
        if (active) setStocks(list);
      })
      .catch(() => {
        // 清單載不到（離線且沒快取）：編輯模式用代號頂著，新增模式在選擇器裡顯示找不到
      })
      .finally(() => {
        if (active) setStocksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stockDirectory]);

  if (!ledger) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.primary} accessibilityLabel="載入中" />
      </View>
    );
  }

  const original = isEdit ? (ledger.transactions.find((t) => t.id === transactionId) ?? null) : null;
  if (isEdit && !original) {
    return (
      <View style={[styles.flex, styles.content]}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.message} accessibilityRole="alert">
          找不到這筆交易，可能已經被刪除
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="回上一頁"
          onPress={leave}
          style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
        >
          <Text style={styles.outlineButtonText}>回上一頁</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FormBody
      title={title}
      ledger={ledger}
      repo={repo}
      stocks={stocks}
      stocksLoading={stocksLoading}
      now={now}
      original={original}
      initialSymbol={initialSymbol}
    />
  );
}

type BodyProps = {
  title: string;
  ledger: Ledger;
  repo: LedgerRepository;
  stocks: StockInfo[];
  stocksLoading: boolean;
  now: () => Date;
  /** 編輯中的那筆；新增模式是 null */
  original: Transaction | null;
  initialSymbol?: string;
};

function FormBody({ title, ledger, repo, stocks, stocksLoading, now, original, initialSymbol }: BodyProps) {
  const insets = useSafeAreaInsets();
  const isEdit = original !== null;
  const settings = ledger.settings;

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StockInfo | null>(() =>
    original ? stockFromSymbol(original.symbol) : null,
  );
  const [form, setForm] = useState<FormState>(() => (original ? formFromTransaction(original) : emptyForm(now())));
  const [errors, setErrors] = useState<TransactionFormErrors & { symbol?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** ?symbol= 要等股票清單載完才知道是哪一檔；套用一次後清掉 */
  const [pendingSymbol, setPendingSymbol] = useState(() => initialSymbol?.trim().toUpperCase() || null);

  if (pendingSymbol && !stocksLoading) {
    setPendingSymbol(null);
    const stock = stocks.find((s) => s.symbol === pendingSymbol);
    if (stock) setPicked(stock);
    else setQuery(pendingSymbol);
  }

  // 清單比記帳本晚到（或載不到）時，用代號頂著；清單到了就換成清單裡的，才有名稱與正確類型
  const selected = picked ? (stocks.find((s) => s.symbol === picked.symbol) ?? picked) : null;

  /** 改欄位；價格、股數、買賣、證券變了就重算沒被手動改過的手續費與稅 */
  const update = (patch: Partial<FormState>, stock: StockInfo | null = selected) => {
    setSavedMessage(null);
    setFormError(null);
    setForm((prev) => withAutoCosts({ ...prev, ...patch }, stock, settings));
  };

  const clearError = (key: keyof typeof errors) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const selectStock = (stock: StockInfo) => {
    setPicked(stock);
    setQuery("");
    clearError("symbol");
    update({}, stock);
  };

  const recalculate = () => update({ feeOverridden: false, taxOverridden: false });

  const save = async (continueAdding: boolean) => {
    if (saving) return;
    setSavedMessage(null);
    setFormError(null);
    const parsed = parseTransactionForm(form, now());
    const symbolError = selected ? undefined : "請選擇股票";
    if (!parsed.ok || symbolError) {
      setErrors({ ...(parsed.ok ? {} : parsed.errors), symbol: symbolError });
      return;
    }
    setErrors({});
    const stock = selected as StockInfo;
    const v = parsed.value;
    const fields = {
      symbol: stock.symbol,
      side: v.side,
      tradeDate: v.tradeDate,
      price: v.price,
      shares: v.shares,
      fee: v.fee,
      tax: v.tax,
      feeOverridden: form.feeOverridden || form.taxOverridden,
      note: v.note,
    };

    setSaving(true);
    const result = original
      ? await repo.updateTransaction(withoutUnknownDate({ ...original, ...fields }, original))
      : await repo.addTransaction({ ...fields, source: "manual" });
    setSaving(false);

    if (!result.ok) {
      showSaveError(result.error, original?.id);
      return;
    }
    if (continueAdding) {
      setForm(emptyForm(now()));
      setSavedMessage(`已儲存：${SIDE_LABEL[v.side]} ${stock.name} ${formatShares(v.shares)} 股，可以繼續輸入下一筆`);
      return;
    }
    leave();
  };

  /**
   * 存檔被拒：這一筆自己的問題標在欄位上（賣超標在股數）；
   * 連帶讓別筆賣超、存檔失敗等顯示在按鈕上方，訊息裡會說是哪一筆。
   */
  const showSaveError = (error: LedgerError | SaveFailedError, ownId?: string) => {
    if (error.code === "invalid" && isFormField(error.field)) {
      setErrors({ [error.field]: error.message });
    } else if (error.code === "oversell" && isOwnTransaction(error.transactionId, ownId)) {
      setErrors({ shares: error.message });
    } else {
      setFormError(error.message);
    }
  };

  /** 被拒時記帳本沒變：新增的那筆還不在裡面，所以「不在記帳本裡」的就是正在輸入的這筆 */
  const isOwnTransaction = (id: string, ownId?: string) =>
    id === ownId || !repo.getSnapshot()?.transactions.some((t) => t.id === id);

  const remove = async () => {
    if (!original || saving) return;
    setSaving(true);
    const result = await repo.deleteTransaction(original.id);
    setSaving(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    leave();
  };

  const total = estimatedTotal(form);
  const holding = !isEdit && selected ? currentHolding(ledger, selected.symbol) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <StockPicker
          stocks={stocks}
          query={query}
          selected={selected}
          loading={stocksLoading}
          error={errors.symbol}
          onChangeQuery={(q) => {
            setQuery(q);
            setPicked(null);
            clearError("symbol");
          }}
          onSelect={selectStock}
          onClear={() => {
            setPicked(null);
            setQuery("");
          }}
        />
        {original?.source === "dca" ? (
          <Text style={styles.holding} testID="dca-source-hint">
            這筆是定期定額自動記上的，可以改成券商實際成交的價格與股數；刪除後不會再自動補回。
          </Text>
        ) : null}
        {holding ? (
          <Text style={styles.holding} testID="current-holding">
            {holding}
          </Text>
        ) : null}

        <Text style={styles.label}>買或賣</Text>
        <View style={styles.sideRow} accessibilityRole="radiogroup">
          {(["buy", "sell"] as const).map((side) => {
            const active = form.side === side;
            return (
              <Pressable
                key={side}
                accessibilityRole="radio"
                accessibilityLabel={SIDE_LABEL[side]}
                accessibilityState={{ checked: active }}
                testID={`side-${side}`}
                onPress={() => update({ side })}
                style={({ pressed }) => [styles.sideButton, active && styles.sideButtonActive, pressed && styles.pressed]}
              >
                <Text style={[styles.sideText, active && styles.sideTextActive]}>{SIDE_LABEL[side]}</Text>
              </Pressable>
            );
          })}
        </View>

        <DateField
          label="交易日期"
          value={form.tradeDate}
          onChange={(tradeDate) => {
            update({ tradeDate });
            clearError("tradeDate");
          }}
          placeholder="選擇日期"
          hint={original?.tradeDateUnknown && form.tradeDate === formatIsoDate(original.tradeDate) ? DATE_UNKNOWN_HINT : undefined}
          error={errors.tradeDate}
          testID="input-trade-date"
        />
        <LabeledInput
          label="成交價"
          placeholder="每股價格"
          keyboardType="decimal-pad"
          value={form.price}
          onChangeText={(price) => {
            update({ price: toHalfWidthNumber(price) });
            clearError("price");
          }}
          error={errors.price}
          testID="input-price"
        />
        <LabeledInput
          label="股數"
          placeholder="1 張 = 1000 股"
          keyboardType="number-pad"
          value={form.shares}
          onChangeText={(shares) => {
            update({ shares: toHalfWidthNumber(shares) });
            clearError("shares");
          }}
          error={errors.shares}
          testID="input-shares"
        />

        <View style={styles.costRow}>
          <View style={styles.costField}>
            <LabeledInput
              label="手續費"
              keyboardType="number-pad"
              value={form.fee}
              onChangeText={(fee) => {
                update({ fee: toHalfWidthNumber(fee), feeOverridden: true });
                clearError("fee");
              }}
              hint={form.feeOverridden ? "已手動修改" : "自動計算"}
              error={errors.fee}
              testID="input-fee"
            />
          </View>
          {form.side === "sell" ? (
            <View style={styles.costField}>
              <LabeledInput
                label="證交稅"
                keyboardType="number-pad"
                value={form.tax}
                onChangeText={(tax) => {
                  update({ tax: toHalfWidthNumber(tax), taxOverridden: true });
                  clearError("tax");
                }}
                hint={form.taxOverridden ? "已手動修改" : "自動計算"}
                error={errors.tax}
                testID="input-tax"
              />
            </View>
          ) : null}
        </View>
        {form.feeOverridden || (form.side === "sell" && form.taxOverridden) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新計算手續費與證交稅"
            testID="button-recalculate"
            onPress={recalculate}
            hitSlop={8}
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>重新計算</Text>
          </Pressable>
        ) : null}

        <View style={styles.totalRow} testID="estimated-total">
          <Text style={styles.totalLabel}>{form.side === "buy" ? "預估付出總金額" : "預估拿回總金額"}</Text>
          <Text style={styles.totalValue}>{total === null ? "—" : `${formatMoney(total)} 元`}</Text>
        </View>

        <LabeledInput
          label="備註"
          placeholder="選填"
          value={form.note}
          onChangeText={(note) => update({ note })}
          testID="input-note"
        />

        {formError ? (
          <Text style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}
        {savedMessage ? (
          <Text style={styles.saved} accessibilityLiveRegion="polite" testID="saved-message">
            {savedMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="儲存"
          accessibilityState={{ disabled: saving }}
          testID="button-save"
          disabled={saving}
          onPress={() => save(false)}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, saving && styles.disabled]}
        >
          <Text style={styles.buttonText}>儲存</Text>
        </Pressable>
        {!isEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="儲存並繼續新增"
            accessibilityState={{ disabled: saving }}
            testID="button-save-continue"
            disabled={saving}
            onPress={() => save(true)}
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed, saving && styles.disabled]}
          >
            <Text style={styles.outlineButtonText}>儲存並繼續新增</Text>
          </Pressable>
        ) : null}

        {original ? (
          confirmingDelete ? (
            <View style={styles.confirm} testID="delete-confirm">
              <Text style={styles.confirmText}>
                確定要刪除 {formatIsoDate(original.tradeDate)} {SIDE_LABEL[original.side]} {selected?.name ?? original.symbol}{" "}
                {formatShares(original.shares)} 股這筆交易嗎？刪除後無法復原。
              </Text>
              <View style={styles.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="取消刪除"
                  onPress={() => setConfirmingDelete(false)}
                  style={({ pressed }) => [styles.confirmButton, styles.confirmCancel, pressed && styles.pressed]}
                >
                  <Text style={styles.outlineButtonText}>取消</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="確定刪除"
                  accessibilityState={{ disabled: saving }}
                  disabled={saving}
                  onPress={remove}
                  style={({ pressed }) => [styles.confirmButton, styles.confirmDelete, pressed && styles.pressed]}
                >
                  <Text style={styles.deleteButtonText}>確定刪除</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="刪除這筆交易"
              testID="button-delete"
              onPress={() => {
                setFormError(null);
                setConfirmingDelete(true);
              }}
              style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
            >
              <Text style={styles.deleteLinkText}>刪除這筆交易</Text>
            </Pressable>
          )
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 存檔或刪除後回上一頁；從外部連結直接打開（沒有上一頁）就回首頁 */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function emptyForm(today: Date): FormState {
  return {
    side: "buy",
    tradeDate: formatIsoDate(localIsoDate(today)),
    price: "",
    shares: "",
    fee: "",
    tax: "",
    note: "",
    feeOverridden: false,
    taxOverridden: false,
  };
}

function formFromTransaction(t: Transaction): FormState {
  return {
    side: t.side,
    tradeDate: formatIsoDate(t.tradeDate),
    price: String(t.price),
    shares: String(t.shares),
    fee: String(t.fee),
    tax: String(t.tax),
    note: t.note ?? "",
    // 存檔時只記一個 feeOverridden，讀回來就當兩個都改過，不會偷偷改掉使用者的數字
    feeOverridden: t.feeOverridden,
    taxOverridden: t.feeOverridden,
  };
}

/** 沒被手動改過的手續費／稅依目前欄位重算；價格或股數不完整時不動 */
function withAutoCosts(form: FormState, stock: StockInfo | null, settings: Ledger["settings"]): FormState {
  const type = stock?.type ?? "stock";
  const costs = autoCosts(form.side, form.price, form.shares, settings, defaultTaxRate(type));
  const next = { ...form };
  if (costs) {
    if (!form.feeOverridden) next.fee = costs.fee;
    if (!form.taxOverridden) next.tax = costs.tax;
  }
  return next;
}

/** 使用者改了日期，就不再是「日期不明」的舊資料 */
function withoutUnknownDate(next: Transaction, original: Transaction): Transaction {
  if (!original.tradeDateUnknown || next.tradeDate === original.tradeDate) return next;
  const { tradeDateUnknown: _drop, ...rest } = next;
  return rest;
}

/** 清單還沒到或載不到時的替身：名稱先用代號，類型依代號判斷 */
function stockFromSymbol(symbol: string): StockInfo {
  return { symbol, name: symbol, type: securityTypeOf(symbol), market: "TWSE" };
}

/** 新增時顯示目前持股，賣出前知道還有多少可以賣 */
function currentHolding(ledger: Ledger, symbol: string): string | null {
  const { state } = replaySymbol(symbol, ledger.transactions, ledger.dividends);
  if (state.shares <= 0) return null;
  const avg = state.costBasis / state.shares;
  return `目前持有 ${formatShares(state.shares)} 股・平均成本 ${avg.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isFormField(field: string): field is keyof TransactionFormErrors {
  return ["tradeDate", "price", "shares", "fee", "tax"].includes(field);
}

function formatShares(n: number): string {
  return n.toLocaleString("en-US");
}

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: space.md, width: "100%", maxWidth: 560, alignSelf: "center" },
  message: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.foreground, marginBottom: space.md },
  holding: {
    marginTop: -space.sm,
    marginBottom: space.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground, marginBottom: space.xs + 2 },
  sideRow: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  sideButton: {
    flex: 1,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  sideButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sideText: { fontFamily: fonts.medium, fontSize: fontSize.md, color: colors.foreground },
  sideTextActive: { color: colors.onPrimary },
  costRow: { flexDirection: "row", gap: space.sm },
  costField: { flex: 1 },
  linkButton: { alignSelf: "flex-start", minHeight: touchTarget, justifyContent: "center", marginTop: -space.sm },
  linkText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.secondary, textDecorationLine: "underline" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    marginBottom: space.md,
  },
  totalLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  totalValue: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.foreground, fontVariant: ["tabular-nums"] },
  formError: {
    backgroundColor: colors.destructiveSurface,
    color: colors.destructive,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
  },
  saved: {
    backgroundColor: colors.secondarySurface,
    color: colors.secondary,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
  },
  button: {
    minHeight: touchTarget,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.sm + 4,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  buttonText: { fontFamily: fonts.semibold, color: colors.onAccent, fontSize: fontSize.lg },
  outlineButton: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    marginBottom: space.sm,
  },
  outlineButtonText: { fontFamily: fonts.medium, color: colors.primary, fontSize: fontSize.md },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  deleteLink: { alignSelf: "center", minHeight: touchTarget, justifyContent: "center", marginTop: space.md },
  deleteLinkText: { fontFamily: fonts.medium, fontSize: fontSize.md, color: colors.destructive },
  confirm: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveSurface,
  },
  confirmText: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.foreground, marginBottom: space.md },
  confirmRow: { flexDirection: "row", gap: space.sm },
  confirmButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancel: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card },
  confirmDelete: { backgroundColor: colors.destructive },
  deleteButtonText: { fontFamily: fonts.semibold, color: colors.onPrimary, fontSize: fontSize.md },
});
