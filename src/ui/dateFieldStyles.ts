import { StyleSheet } from "react-native";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

/** DateField 手機版與網頁版共用的介面與樣式（放在這裡，網頁版才不會 import 到自己） */
export type DateFieldProps = {
  label: string;
  /** 顯示用格式 "2026/10/05"；空字串代表沒選 */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  testID?: string;
};

export const dateFieldStyles = StyleSheet.create({
  wrapper: { marginBottom: space.md },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginBottom: space.xs + 2,
  },
  field: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  fieldError: { borderColor: colors.destructive, borderWidth: 1.5 },
  valueButton: { flex: 1, minHeight: touchTarget, justifyContent: "center", paddingHorizontal: space.md },
  value: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.foreground },
  placeholder: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: colors.mutedForeground },
  clear: { paddingHorizontal: space.md, minHeight: touchTarget, justifyContent: "center" },
  clearText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.primary },
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
