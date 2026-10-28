import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stockDirectory as defaultStockDirectory } from "@/data";
import type { LedgerRepository, SaveFailedError } from "@/data/ledgerRepository";
import type { StockDirectory } from "@/data/StockDirectory";
import { participatingShares } from "@/domain/autoDividends";
import { formatIsoDate, localIsoDate, parseBuyDate } from "@/domain/buyDate";
import {
  applyDividendForm,
  confirmDividend,
  DIVIDEND_TYPE_LABEL,
  emptyDividendForm,
  formFromDividend,
  parseDividendForm,
  type DividendFormErrors,
  type DividendFormValues,
} from "@/domain/dividendForm";
import type { Dividend, DividendType, Ledger } from "@/domain/ledgerTypes";
import type { LedgerError } from "@/domain/ledgerValidation";
import { securityTypeOf } from "@/domain/security";
import { toHalfWidthNumber } from "@/domain/transactionForm";
import type { StockInfo } from "@/domain/types";
import { useLedger } from "@/hooks/useLedger";
import { DateField } from "@/ui/DateField";
import { LabeledInput } from "@/ui/LabeledInput";
import { Segmented } from "@/ui/Segmented";
import { StockPicker } from "@/ui/StockPicker";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, EmptyState, Notice, SkeletonCard, surfaceStyles } from "@/ui/Surface";
import {
  colors,
  contentMaxWidth,
  fonts,
  fontSize,
  iconSize,
  pressedOpacity,
  radius,
  space,
  touchTarget,
  type,
} from "@/ui/theme";

/**
 * 新增／編輯／刪除一筆股利（M-03、P2-03，docs/stories/012）。
 * 路由入口：src/app/dividend/new.tsx（可帶 ?symbol=2330）、src/app/dividend/[id].tsx；入口在單一持股頁。
 *
 * - 現金股利填實際入帳金額；股票股利填配發股數。
 * - 存檔與刪除都經過 ledgerRepository（從頭重播；刪掉配股會讓之後賣超就拒絕）。
 * - 自動帶入的紀錄：證券、類型、除權息日固定不能改（改了會跟除權息資料對不上）；
 *   改金額或按「確認入帳」後不再自動更新；刪掉後不會再自動建立。
 */

type Deps = {
  /** 測試與畫面開發傳記憶體版；預設 src/data 的 ledgerRepository */
  repository?: LedgerRepository;
  stockDirectory?: StockDirectory;
  /** 現在時間；決定預設日期。測試固定用 */
  now?: () => Date;
};

/** src/app/dividend/new.tsx */
export function NewDividendScreen(deps: Deps) {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  return <DividendForm {...deps} initialSymbol={typeof symbol === "string" ? symbol : undefined} />;
}

/** src/app/dividend/[id].tsx */
export function EditDividendScreen(deps: Deps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DividendForm {...deps} dividendId={typeof id === "string" ? id : ""} />;
}

type Props = Deps & {
  /** 有值是編輯模式 */
  dividendId?: string;
  /** 新增模式預選的證券代號 */
  initialSymbol?: string;
};

/** 等記帳本讀完、找到要編輯的那筆，再把表單畫出來（表單的初始值只在掛上時決定一次） */
function DividendForm({
  repository,
  stockDirectory = defaultStockDirectory,
  now = () => new Date(),
  dividendId,
  initialSymbol,
}: Props) {
  const { ledger, repository: repo } = useLedger(repository);
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const isEdit = dividendId !== undefined;
  const title = isEdit ? "編輯股利" : "記錄股利";

  useEffect(() => {
    let active = true;
    stockDirectory
      .getAll()
      .then((list) => {
        if (active) setStocks(list);
      })
      .catch(() => {
        // 清單載不到（離線且沒快取）：用代號頂著
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
      <View style={[surfaceStyles.screen, styles.content]}>
        <Stack.Screen options={{ title }} />
        <SkeletonCard lines={4} />
      </View>
    );
  }

  const original = isEdit ? (ledger.dividends.find((d) => d.id === dividendId) ?? null) : null;
  if (isEdit && !original) {
    return (
      <View style={[surfaceStyles.screen, styles.content]}>
        <Stack.Screen options={{ title }} />
        <Card>
          <View accessibilityRole="alert">
            <EmptyState icon="alert" title={"找不到這筆股利，可能已經被刪除"}>
              <Button label="回上一頁" variant="secondary" onPress={leave} />
            </EmptyState>
          </View>
        </Card>
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
  original: Dividend | null;
  initialSymbol?: string;
};

function FormBody({ title, ledger, repo, stocks, stocksLoading, now, original, initialSymbol }: BodyProps) {
  const insets = useSafeAreaInsets();
  const isAuto = original?.source === "auto";

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StockInfo | null>(() => {
    const symbol = original?.symbol ?? initialSymbol?.trim().toUpperCase();
    return symbol ? stockFromSymbol(symbol) : null;
  });
  const [form, setForm] = useState<DividendFormValues>(() =>
    original ? formFromDividend(original) : emptyDividendForm(localIsoDate(now())),
  );
  const [errors, setErrors] = useState<DividendFormErrors & { symbol?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 清單到了就換成清單裡的，才有名稱
  const selected = picked ? (stocks.find((s) => s.symbol === picked.symbol) ?? picked) : null;
  /** 從持股頁進來、或編輯時，證券固定，不顯示選擇器 */
  const symbolFixed = original !== null || Boolean(initialSymbol);

  const update = (patch: Partial<DividendFormValues>) => {
    setFormError(null);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const clearError = (key: keyof typeof errors) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const showSaveError = (error: LedgerError | SaveFailedError) => {
    if (
      error.code === "invalid" &&
      (error.field === "exDate" || error.field === "cashAmount" || error.field === "stockShares")
    ) {
      setErrors({ [error.field === "exDate" ? "exDate" : "amount"]: error.message });
    } else if (error.code === "stockDividendWithoutShares" && (error.dividendId === original?.id || !original)) {
      setErrors({ exDate: error.message });
    } else {
      setFormError(error.message);
    }
  };

  const save = async () => {
    if (saving) return;
    setFormError(null);
    const parsed = parseDividendForm(form, now());
    const symbolError = selected ? undefined : "請選擇股票";
    if (!parsed.ok || symbolError) {
      setErrors({ ...(parsed.ok ? {} : parsed.errors), symbol: symbolError });
      return;
    }
    setErrors({});
    const symbol = (selected as StockInfo).symbol;
    setSaving(true);
    const result = original
      ? await repo.updateDividend({ ...applyDividendForm(original, parsed.value), symbol })
      : await repo.addDividend({ ...parsed.value, symbol, status: "received", source: "manual" });
    setSaving(false);
    if (!result.ok) {
      showSaveError(result.error);
      return;
    }
    leave();
  };

  const confirm = async () => {
    if (!original || saving) return;
    setSaving(true);
    const result = await repo.updateDividend(confirmDividend(original));
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    leave();
  };

  const remove = async () => {
    if (!original || saving) return;
    setSaving(true);
    const result = await repo.deleteDividend(original.id);
    setSaving(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    leave();
  };

  const heldHint = selected ? heldBeforeExDate(ledger, selected.symbol, form.exDate, now()) : null;
  const isCash = form.type === "cash";

  return (
    <KeyboardAvoidingView style={surfaceStyles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {original && isAuto ? <AutoNotice dividend={original} /> : null}

        <Card style={styles.formCard}>
          {symbolFixed && selected ? (
            <View style={styles.fixedField}>
              <Text style={styles.label}>證券</Text>
              <Text style={styles.fixedValue} testID="dividend-symbol">
                {selected.name === selected.symbol ? selected.symbol : `${selected.name}（${selected.symbol}）`}
              </Text>
            </View>
          ) : (
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
              onSelect={(stock) => {
                setPicked(stock);
                setQuery("");
                clearError("symbol");
              }}
              onClear={() => {
                setPicked(null);
                setQuery("");
              }}
            />
          )}

          <Text style={styles.label}>類型</Text>
          {isAuto ? (
            <Text style={[styles.fixedValue, styles.fixedSpacing]}>{DIVIDEND_TYPE_LABEL[form.type]}</Text>
          ) : (
            <View style={styles.fixedSpacing}>
              <Segmented<DividendType>
                label="股利類型"
                options={[
                  { value: "cash", label: DIVIDEND_TYPE_LABEL.cash },
                  { value: "stock", label: DIVIDEND_TYPE_LABEL.stock },
                ]}
                value={form.type}
                onChange={(type) => {
                  update({ type });
                  clearError("amount");
                }}
              />
            </View>
          )}

          {isAuto ? (
            <View style={styles.fixedField}>
              <Text style={styles.label}>除權息日</Text>
              <Text style={styles.fixedValue}>{form.exDate}</Text>
              {heldHint ? <Text style={styles.hint}>{heldHint}</Text> : null}
            </View>
          ) : (
            <DateField
              label="除權息日"
              value={form.exDate}
              onChange={(exDate) => {
                update({ exDate });
                clearError("exDate");
              }}
              placeholder="選擇日期"
              hint={heldHint ?? undefined}
              error={errors.exDate}
              testID="input-ex-date"
            />
          )}

          <LabeledInput
            label={isCash ? "實際入帳金額" : "配發股數"}
            placeholder={isCash ? "元" : "股"}
            keyboardType={isCash ? "decimal-pad" : "number-pad"}
            value={form.amount}
            onChangeText={(amount) => {
              update({ amount: toHalfWidthNumber(amount) });
              clearError("amount");
            }}
            hint={isCash ? "填存摺上實際入帳的金額（已扣匯費、二代健保補充保費）" : "1 張 = 1000 股"}
            error={errors.amount}
            testID="input-dividend-amount"
          />

          <LabeledInput
            label="備註"
            placeholder="選填"
            value={form.note}
            onChangeText={(note) => update({ note })}
            testID="input-dividend-note"
          />
        </Card>

        {formError ? (
          <View style={styles.formError}>
            <Notice tone="error" alert message={formError} />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label="儲存" icon="check" testID="button-save" disabled={saving} onPress={save} />
          {original?.status === "estimated" ? (
            <Button
              label="確認已入帳"
              variant="secondary"
              testID="button-confirm-received"
              disabled={saving}
              onPress={confirm}
            />
          ) : null}
        </View>

        {original ? (
          confirmingDelete ? (
            <View style={styles.confirm} testID="delete-confirm">
              <Text style={styles.confirmText}>
                確定要刪除 {formatIsoDate(original.exDate)} {selected?.name ?? original.symbol} 的
                {DIVIDEND_TYPE_LABEL[original.type]}嗎？
                {isAuto ? "刪除後，自動帶入不會再建立這一筆。" : "刪除後無法復原。"}
              </Text>
              <View style={styles.confirmRow}>
                <Button
                  label="取消"
                  accessibilityLabel="取消刪除"
                  variant="secondary"
                  onPress={() => setConfirmingDelete(false)}
                  style={styles.flex}
                />
                <Button
                  label="確定刪除"
                  accessibilityLabel="確定刪除"
                  variant="destructive"
                  disabled={saving}
                  onPress={remove}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="刪除這筆股利"
              testID="button-delete"
              onPress={() => {
                setFormError(null);
                setConfirmingDelete(true);
              }}
              style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
            >
              <Icon name="trash" size={iconSize.sm} color={colors.destructive} />
              <Text style={styles.deleteLinkText}>刪除這筆股利</Text>
            </Pressable>
          )
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 自動帶入的紀錄：說明來源與狀態 */
function AutoNotice({ dividend }: { dividend: Dividend }) {
  const estimated = dividend.status === "estimated";
  const payDate = dividend.payDate ? formatIsoDate(dividend.payDate) : null;
  const status = estimated
    ? payDate
      ? `預估即將入帳，發放日 ${payDate} 後自動轉為已入帳。預估的股利還不算進總報酬。`
      : "預估即將入帳，資料來源還沒有發放日，入帳後請按「確認已入帳」。預估的股利還不算進總報酬。"
    : `已入帳${payDate ? `（發放日 ${payDate}）` : ""}。`;
  return (
    <View style={[styles.notice, estimated && styles.noticeEstimated]} testID="auto-notice">
      <View style={styles.noticeHead}>
        <Icon name={estimated ? "calendar" : "coins"} size={iconSize.sm} color={colors.secondary} />
        <Text style={styles.noticeTitle}>{estimated ? "預估即將入帳" : "自動帶入"}</Text>
      </View>
      <Text style={styles.noticeText}>
        依除權息資料自動算出：除權息日前一天的持股 × 每股股利。{status}
        {dividend.userModified
          ? "你改過這筆，之後不會再自動更新。"
          : "金額不對（例如被扣了二代健保補充保費）可以直接修改，改過就不會再自動更新。"}
      </Text>
    </View>
  );
}

/** 除權息日前一天的持股，提醒使用者這次參與配發的股數 */
function heldBeforeExDate(ledger: Ledger, symbol: string, exDate: string, today: Date): string | null {
  const parsed = parseBuyDate(exDate, today);
  if (!parsed.ok || !parsed.iso) return null;
  const shares = participatingShares(ledger, symbol, parsed.iso);
  return shares > 0 ? `除權息日前一天持有 ${shares.toLocaleString("en-US")} 股` : "除權息日前一天沒有持股";
}

/** 存檔或刪除後回上一頁；從外部連結直接打開（沒有上一頁）就回首頁 */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** 清單還沒到或載不到時的替身：名稱先用代號 */
function stockFromSymbol(symbol: string): StockInfo {
  return { symbol, name: symbol, type: securityTypeOf(symbol), market: "TWSE" };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: space.md, width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" },
  message: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.foreground, marginBottom: space.md },
  label: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground, marginBottom: space.xs + 2 },
  fixedField: { marginBottom: space.md },
  fixedValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  fixedSpacing: { marginBottom: space.md },
  hint: { marginTop: space.xs, fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
  notice: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    backgroundColor: colors.secondarySurface,
    gap: space.xs,
  },
  noticeEstimated: { backgroundColor: colors.accentSurface },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  noticeTitle: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.foreground },
  noticeText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20, color: colors.foreground },
  pressed: { opacity: pressedOpacity },
  disabled: { opacity: 0.5 },
  formCard: { gap: 0, paddingBottom: space.xs, marginBottom: space.md },
  actions: { gap: space.sm },
  deleteLink: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  deleteLinkText: { fontFamily: fonts.medium, fontSize: fontSize.md, color: colors.destructive },
  confirm: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveSurface,
  },
  confirmText: { ...type.body, color: colors.foreground, marginBottom: space.md },
  confirmRow: { flexDirection: "row", gap: space.sm },
  formError: { marginBottom: space.md },
});
