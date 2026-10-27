import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
};

/**
 * 有標籤、提示與錯誤訊息的輸入框。
 * - label 同時當 accessibilityLabel，讓 Maestro 與螢幕閱讀器都能用中文找到它。
 * - 錯誤訊息緊貼欄位下方，並以 live region 播報。
 */
export function LabeledInput({ label, hint, error, ...inputProps }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, error ? styles.inputError : null]}
        {...inputProps}
      />
      {error ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: space.md },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginBottom: space.xs + 2,
  },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    backgroundColor: colors.card,
    color: colors.foreground,
  },
  inputError: { borderColor: colors.destructive, borderWidth: 1.5 },
  hint: {
    marginTop: space.xs + 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  error: {
    marginTop: space.xs + 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.destructive,
  },
});
