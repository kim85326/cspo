import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  candleSource as defaultCandleSource,
  priceSource as defaultPriceSource,
  stockDirectory as defaultStockDirectory,
} from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import { addDcaRule, dcaRulesOf, dcaTransactionsOf, deleteDcaRule, runDcaCatchUp, updateDcaRule } from "@/data/dcaRules";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import type { StockDirectory } from "@/data/StockDirectory";
import { formatIsoDate, localIsoDate } from "@/domain/buyDate";
import {
  activeDcaRuleIds,
  dcaPurchase,
  DCA_MAX_DAY,
  DCA_MIN_DAY,
  FREE_DCA_RULE_LIMIT,
  parseDcaRuleForm,
  type DcaRuleFormErrors,
  type DcaRuleFormValues,
} from "@/domain/dca";
import type { DcaRule, Ledger, UserSettings } from "@/domain/ledgerTypes";
import { securityTypeOf } from "@/domain/security";
import { toHalfWidthNumber } from "@/domain/transactionForm";
import type { StockInfo } from "@/domain/types";
import { useDcaPlan } from "@/hooks/useDcaPlan";
import { useLedger } from "@/hooks/useLedger";
import { DateField } from "@/ui/DateField";
import { LabeledInput } from "@/ui/LabeledInput";
import { StockPicker } from "@/ui/StockPicker";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

type Deps = {
  /** 測試與畫面開發傳記憶體版；預設 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  stockDirectory?: StockDirectory;
  candleSource?: CandleSource;
  priceSource?: PriceSource;
  /** 現在時間；決定預設開始日期。測試固定用 */
  now?: () => Date;
};

/** src/app/dca/new.tsx */
export function NewDcaRuleScreen(deps: Deps) {
  return <DcaRuleForm {...deps} />;
}

/** src/app/dca/[id].tsx */
export function EditDcaRuleScreen(deps: Deps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DcaRuleForm {...deps} ruleId={typeof id === "string" ? id : ""} />;
}

type Props = Deps & { ruleId?: string };

/**
 * 新增／編輯／刪除一條定期定額規則（P2-02，docs/stories/024）。
 * - 欄位：證券、每期金額、每月扣款日（1–28）、開始日期、結束日期（選填）。
 * - 手續費沿用設定裡的費率與折扣（規則沒有自己的手續費設定），畫面上列出來讓使用者知道怎麼算。
 * - 存好後馬上補產生已到期的期數，再回到列表。
 * - 刪除規則：已自動記上的交易保留，只是之後不再自動產生。
 */
function DcaRuleForm({
  repository,
  stockDirectory = defaultStockDirectory,
  candleSource = defaultCandleSource,
  priceSource = defaultPriceSource,
  now = () => new Date(),
  ruleId,
}: Props) {
  const { ledger, repository: repo } = useLedger(repository);
  const { unlimited } = useDcaPlan();
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const isEdit = ruleId !== undefined;
  const title = isEdit ? "編輯定期定額" : "新增定期定額";

  useEffect(() => {
    let active = true;
    stockDirectory
      .getAll()
      .then((list) => {
        if (active) setStocks(list);
      })
      .catch(() => {})
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

  const original = isEdit ? (dcaRulesOf(ledger).find((r) => r.id === ruleId) ?? null) : null;
  const blockedByPlan = !isEdit && !unlimited && dcaRulesOf(ledger).length >= FREE_DCA_RULE_LIMIT;
  if ((isEdit && !original) || blockedByPlan) {
    return (
      <View style={[styles.flex, styles.content]}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.message} accessibilityRole="alert">
          {blockedByPlan
            ? `Free 方案可以設定 ${FREE_DCA_RULE_LIMIT} 條定期定額，升級 Pro 不限條數。`
            : "找不到這條定期定額，可能已經被刪除"}
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
      candleSource={candleSource}
      priceSource={priceSource}
      now={now}
      original={original}
      unlimited={unlimited}
      locked={original !== null && !activeDcaRuleIds(dcaRulesOf(ledger), unlimited).has(original.id)}
    />
  );
}

type BodyProps = {
  title: string;
  ledger: Ledger;
  repo: LedgerRepository;
  stocks: StockInfo[];
  stocksLoading: boolean;
  candleSource: CandleSource;
  priceSource: PriceSource;
  now: () => Date;
  /** 編輯中的規則；新增模式是 null */
  original: DcaRule | null;
  unlimited: boolean;
  /** Free 方案超過條數的規則：可以編輯、刪除，但不會自動產生 */
  locked: boolean;
};

function FormBody({
  title,
  ledger,
  repo,
  stocks,
  stocksLoading,
  candleSource,
  priceSource,
  now,
  original,
  unlimited,
  locked,
}: BodyProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StockInfo | null>(() => (original ? stockFromSymbol(original.symbol) : null));
  const [form, setForm] = useState<DcaRuleFormValues>(() => (original ? formFromRule(original) : emptyForm(now())));
  const [errors, setErrors] = useState<DcaRuleFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [quote, setQuote] = useState<number | null>(null);

  const selected = picked ? (stocks.find((s) => s.symbol === picked.symbol) ?? picked) : null;
  const generatedCount = original ? dcaTransactionsOf(ledger, original.id).length : 0;

  // 選好證券後抓最新收盤價，估算每期大約買幾股；抓不到就不顯示估算
  useEffect(() => {
    if (!selected) return;
    let active = true;
    priceSource
      .getQuote(selected.symbol)
      .then((q) => {
        if (active) setQuote(q?.price ?? null);
      })
      .catch(() => {
        if (active) setQuote(null);
      });
    return () => {
      active = false;
      setQuote(null);
    };
  }, [selected?.symbol, priceSource]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<DcaRuleFormValues>) => {
    setFormError(null);
    setForm((prev) => ({ ...prev, ...patch }));
    const keys = Object.keys(patch) as (keyof DcaRuleFormValues)[];
    if (keys.some((k) => errors[k])) setErrors((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, undefined])) }));
  };

  const save = async () => {
    if (saving) return;
    const parsed = parseDcaRuleForm({ ...form, symbol: selected?.symbol ?? "" });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const result = original ? await updateDcaRule(repo, original.id, parsed.value) : await addDcaRule(repo, parsed.value);
    if (!result.ok) {
      setSaving(false);
      setFormError(result.error.message);
      return;
    }
    // 存好就補產生已到期的期數；失敗（沒網路）也沒關係，下次開 App 會再補
    await runDcaCatchUp({ repository: repo, candleSource, unlimited, today: localIsoDate(now()) }).catch(() => {});
    setSaving(false);
    leave();
  };

  const remove = async () => {
    if (!original || saving) return;
    setSaving(true);
    const result = await deleteDcaRule(repo, original.id);
    setSaving(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    leave();
  };

  const amount = Number(form.amount.replace(/,/g, ""));
  const estimate =
    quote !== null && Number.isInteger(amount) && amount > 0 ? dcaPurchase(amount, quote, ledger.settings) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {locked ? (
          <Text style={styles.notice} testID="dca-locked">
            Free 方案只有最早建立的 {FREE_DCA_RULE_LIMIT} 條會自動記帳；這條會保留，但不會自動產生交易。
          </Text>
        ) : null}

        <StockPicker
          stocks={stocks}
          query={query}
          selected={selected}
          loading={stocksLoading}
          error={errors.symbol}
          onChangeQuery={(q) => {
            setQuery(q);
            setPicked(null);
            update({ symbol: "" });
          }}
          onSelect={(stock) => {
            setPicked(stock);
            setQuery("");
            update({ symbol: stock.symbol });
          }}
          onClear={() => {
            setPicked(null);
            setQuery("");
          }}
        />

        <LabeledInput
          label="每期金額（元）"
          placeholder="例如 5000"
          keyboardType="number-pad"
          value={form.amount}
          onChangeText={(v) => update({ amount: toHalfWidthNumber(v) })}
          error={errors.amount}
          testID="input-dca-amount"
        />
        <LabeledInput
          label="每月扣款日"
          placeholder={`${DCA_MIN_DAY}–${DCA_MAX_DAY}`}
          keyboardType="number-pad"
          value={form.dayOfMonth}
          onChangeText={(v) => update({ dayOfMonth: toHalfWidthNumber(v) })}
          hint="遇到假日順延到下一個交易日"
          error={errors.dayOfMonth}
          testID="input-dca-day"
        />
        <DateField
          label="開始日期"
          value={form.startDate}
          onChange={(startDate) => update({ startDate })}
          placeholder="選擇日期"
          hint="這天以後的扣款日才會記帳；選過去的日期會補上之前的期數"
          error={errors.startDate}
          testID="input-dca-start"
        />
        <DateField
          label="結束日期（選填）"
          value={form.endDate}
          onChange={(endDate) => update({ endDate })}
          placeholder="不限"
          error={errors.endDate}
          testID="input-dca-end"
          allowFuture
        />

        <View style={styles.infoBox} testID="dca-fee-info">
          <Text style={styles.infoTitle}>每期怎麼算</Text>
          <Text style={styles.infoText}>成交價用扣款那天的收盤價；股數無條件捨去，可以買零股。</Text>
          <Text style={styles.infoText}>{feeDescription(ledger.settings)}</Text>
          {estimate && selected ? (
            <Text style={styles.estimate} testID="dca-estimate">
              {estimate.shares > 0
                ? `以最新收盤價 ${quote} 元估算：每期約買 ${estimate.shares.toLocaleString("zh-TW")} 股，手續費 ${estimate.fee} 元`
                : `以最新收盤價 ${quote} 元估算：每期金額不夠買 1 股`}
            </Text>
          ) : null}
        </View>

        {original ? (
          <Text style={styles.infoText} testID="dca-generated-count">
            {generatedCount > 0
              ? `已自動記上 ${generatedCount} 筆。修改只影響之後的期數，已記上的交易不會變。`
              : "還沒有自動記上的交易。"}
          </Text>
        ) : null}

        {formError ? (
          <Text style={styles.formError} accessibilityRole="alert">
            {formError}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="儲存定期定額"
          accessibilityState={{ disabled: saving }}
          testID="button-save-dca"
          disabled={saving}
          onPress={save}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, saving && styles.disabled]}
        >
          <Text style={styles.buttonText}>{saving ? "儲存中…" : "儲存"}</Text>
        </Pressable>

        {original ? (
          confirmingDelete ? (
            <View style={styles.confirm} testID="dca-delete-confirm">
              <Text style={styles.confirmText}>
                確定要刪除 {selected?.name ?? original.symbol} 的定期定額嗎？之後不會再自動記帳
                {generatedCount > 0 ? `；已記上的 ${generatedCount} 筆交易會保留` : ""}。
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
                  accessibilityLabel="確定刪除定期定額"
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
              accessibilityLabel="刪除這條定期定額"
              testID="button-delete-dca"
              onPress={() => setConfirmingDelete(true)}
              style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
            >
              <Text style={styles.deleteLinkText}>刪除這條定期定額</Text>
            </Pressable>
          )
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/dca" as Href);
}

function emptyForm(now: Date): DcaRuleFormValues {
  return { symbol: "", amount: "", dayOfMonth: "", startDate: formatIsoDate(localIsoDate(now)), endDate: "" };
}

function formFromRule(rule: DcaRule): DcaRuleFormValues {
  return {
    symbol: rule.symbol,
    amount: String(rule.amount),
    dayOfMonth: String(rule.dayOfMonth),
    startDate: formatIsoDate(rule.startDate),
    endDate: rule.endDate ? formatIsoDate(rule.endDate) : "",
  };
}

function stockFromSymbol(symbol: string): StockInfo {
  return { symbol, name: symbol, type: securityTypeOf(symbol), market: "TWSE" };
}

/** 「手續費：費率 0.1425%、不打折，零股最低 1 元、整股最低 20 元」 */
export function feeDescription(settings: UserSettings): string {
  const rate = `${Math.round(settings.feeRate * 1_000_000) / 10_000}%`;
  const discount =
    settings.feeDiscount >= 1 ? "不打折" : `${Math.round(settings.feeDiscount * 1000) / 100} 折`;
  return `手續費：費率 ${rate}、${discount}，零股最低 ${settings.minFeeOddLot} 元、整股最低 ${settings.minFeeBoardLot} 元（沿用記帳本的手續費設定）。`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: space.md, width: "100%", maxWidth: 560, alignSelf: "center" },
  message: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.foreground, marginBottom: space.md },
  notice: {
    backgroundColor: colors.accentSurface,
    color: colors.foreground,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
  },
  infoBox: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    marginBottom: space.md,
    gap: space.xs,
  },
  infoTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.foreground },
  infoText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    lineHeight: fontSize.sm * 1.6,
    marginBottom: space.xs,
  },
  estimate: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.secondary },
  formError: {
    backgroundColor: colors.destructiveSurface,
    color: colors.destructive,
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
    marginTop: space.sm,
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
