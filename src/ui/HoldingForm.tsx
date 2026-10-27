import { Pressable, StyleSheet, Text, View } from "react-native";
import type { HoldingDraft, ReviewFlags } from "@/domain/holdingExtract";
import type { HoldingInput } from "@/domain/pnl";
import type { StockInfo } from "@/domain/types";
import { LabeledInput } from "./LabeledInput";
import { StockPicker } from "./StockPicker";
import { colors, fonts, fontSize, radius, space } from "./theme";

export type HoldingFormErrors = Partial<Record<keyof HoldingInput, string>>;

/**
 * 一檔股票的輸入狀態（畫面層用，驗證通過後才變成 domain 的 Holding）。
 * 欄位本體是 domain 的 HoldingDraft（截圖匯入會直接產生它），這裡多了 errors。
 * review：截圖匯入後信心低的欄位，標籤旁顯示「請確認」；使用者一改就消掉。
 */
export type HoldingFormState = HoldingDraft & {
  errors: HoldingFormErrors;
};

export const REVIEW_BADGE = "請確認";

type Props = {
  index: number;
  form: HoldingFormState;
  stocks: StockInfo[];
  /** 只有一檔時不能移除 */
  removable: boolean;
  isLast: boolean;
  onChange: (patch: Partial<HoldingFormState>) => void;
  onBlurField: (key: "buyPrice" | "shares") => void;
  onRemove: () => void;
  onSubmit: () => void;
};

export function emptyHoldingForm(id: number): HoldingFormState {
  return { id, query: "", selected: null, buyPrice: "", shares: "", errors: {} };
}

/**
 * 一檔股票的輸入區塊：股票選擇器 + 買入價 + 數量。
 * 多檔比較時每檔一個區塊，標題「第 N 檔」，右上角可移除。
 * 欄位 label 與單檔時相同（Maestro 與既有測試依賴中文 label），用 testID 區分第幾檔。
 */
export function HoldingForm({
  index,
  form,
  stocks,
  removable,
  isLast,
  onChange,
  onBlurField,
  onRemove,
  onSubmit,
}: Props) {
  const n = index + 1;
  const clearError = (key: keyof HoldingInput) => {
    if (form.errors[key]) onChange({ errors: { ...form.errors, [key]: undefined } });
  };
  const review: ReviewFlags = form.review ?? {};
  const badge = (key: keyof ReviewFlags) => (review[key] ? REVIEW_BADGE : undefined);
  const clearReview = (key: keyof ReviewFlags): Partial<HoldingFormState> =>
    review[key] ? { review: { ...review, [key]: false } } : {};

  return (
    <View style={styles.card} testID={`holding-form-${n}`} accessibilityLabel={`第 ${n} 檔`}>
      <View style={styles.header}>
        <Text style={styles.title}>第 {n} 檔</Text>
        {removable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`移除第 ${n} 檔`}
            testID={`button-remove-${n}`}
            onPress={onRemove}
            hitSlop={8}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
          >
            <Text style={styles.removeText}>移除</Text>
          </Pressable>
        ) : null}
      </View>

      <StockPicker
        stocks={stocks}
        query={form.query}
        selected={form.selected}
        error={form.errors.symbol}
        badge={badge("stock")}
        testID={`input-stock-${n}`}
        onChangeQuery={(query) =>
          onChange({ query, selected: null, errors: { ...form.errors, symbol: undefined } })
        }
        onSelect={(stock) =>
          onChange({
            selected: stock,
            query: "",
            errors: { ...form.errors, symbol: undefined },
            ...clearReview("stock"),
          })
        }
        onClear={() => onChange({ selected: null, query: "", ...clearReview("stock") })}
      />
      <LabeledInput
        label="買入價"
        placeholder="每股價格"
        keyboardType="decimal-pad"
        returnKeyType="next"
        value={form.buyPrice}
        onChangeText={(buyPrice) => {
          onChange({ buyPrice, ...clearReview("buyPrice") });
          clearError("buyPrice");
        }}
        onBlur={() => onBlurField("buyPrice")}
        error={form.errors.buyPrice}
        badge={badge("buyPrice")}
        testID={`input-buy-price-${n}`}
      />
      <LabeledInput
        label="數量"
        placeholder="股數"
        hint="以股為單位，1 張 = 1000 股"
        keyboardType="number-pad"
        returnKeyType={isLast ? "done" : "next"}
        value={form.shares}
        onChangeText={(shares) => {
          onChange({ shares, ...clearReview("shares") });
          clearError("shares");
        }}
        onBlur={() => onBlurField("shares")}
        onSubmitEditing={isLast ? onSubmit : undefined}
        error={form.errors.shares}
        badge={badge("shares")}
        testID={`input-shares-${n}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    paddingBottom: 0,
    marginBottom: space.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.sm + 4,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.foreground,
  },
  remove: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  removeText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.destructive },
  pressed: { opacity: 0.6 },
});
