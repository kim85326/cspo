import { createElement } from "react";
import { Pressable, Text, View } from "react-native";
import { localIsoDate } from "@/domain/buyDate";
import { dateFieldStyles as styles, type DateFieldProps } from "./dateFieldStyles";
import { colors, fonts, fontSize, space } from "./theme";

/**
 * 網頁版的日期欄位：用瀏覽器內建的 <input type="date">（datetimepicker 套件不支援網頁）。
 * 對外介面與手機版 DateField 相同，值一樣是 "2026/10/05"。
 */
export function DateField({ label, value, onChange, hint, error, testID }: DateFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        {createElement("input", {
          type: "date",
          "aria-label": label,
          "data-testid": testID,
          value: value.replace(/\//g, "-"),
          max: localIsoDate(new Date()),
          onChange: (event: { target: { value: string } }) => onChange(event.target.value.replace(/-/g, "/")),
          style: {
            flex: 1,
            minHeight: 44,
            border: 0,
            outline: "none",
            background: "transparent",
            paddingLeft: space.md,
            paddingRight: space.md,
            fontFamily: fonts.regular,
            fontSize: fontSize.lg,
            color: value ? colors.foreground : colors.mutedForeground,
          },
        })}
        {value ? (
          <Pressable onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel={`清除${label}`} style={styles.clear}>
            <Text style={styles.clearText}>清除</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}
