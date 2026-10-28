import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { formatIsoDate, localIsoDate, parseBuyDate } from "@/domain/buyDate";
import { dateFieldStyles, type DateFieldProps } from "./dateFieldStyles";

/**
 * 點一下跳出系統日曆的日期欄位（手機版）。網頁版見 DateField.web.tsx。
 * - Android：系統的日期對話框；iOS：欄位下方展開內嵌日曆，選好就收起。
 * - 最晚只能選到今天；選好的值用 "2026/10/05" 回傳，跟手打時的格式一樣，驗證沿用 parseBuyDate。
 * - 有值時右邊有「清除」，因為這個欄位是選填。
 */
export function DateField({ label, value, onChange, placeholder, hint, error, testID, allowFuture }: DateFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const today = new Date();
  const current = toDate(value) ?? today;

  const pick = (date: Date) => onChange(formatIsoDate(localIsoDate(date)));

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        maximumDate: allowFuture ? undefined : today,
        onValueChange: (_event, date) => pick(date),
      });
    } else {
      setIosOpen((shown) => !shown);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: value || "未選擇" }}
          accessibilityHint={hint}
          testID={testID}
          style={styles.valueButton}
        >
          <Text style={value ? styles.value : styles.placeholder}>{value || placeholder}</Text>
        </Pressable>
        {value ? (
          <Pressable
            onPress={() => {
              setIosOpen(false);
              onChange("");
            }}
            accessibilityRole="button"
            accessibilityLabel={`清除${label}`}
            hitSlop={8}
            style={styles.clear}
          >
            <Text style={styles.clearText}>清除</Text>
          </Pressable>
        ) : null}
      </View>
      {iosOpen ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          maximumDate={allowFuture ? undefined : today}
          locale="zh-TW"
          onValueChange={(_event, date) => {
            setIosOpen(false);
            pick(date);
          }}
          onDismiss={() => setIosOpen(false)}
          testID={testID ? `${testID}-picker` : undefined}
        />
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** "2026/10/05" → 本地時區的 Date；空白或格式不對回 null */
function toDate(value: string): Date | null {
  const parsed = parseBuyDate(value);
  if (!parsed.ok || !parsed.iso) return null;
  const [y, m, d] = parsed.iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const styles = dateFieldStyles;
