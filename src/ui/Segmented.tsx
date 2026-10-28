import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, fontSize, pressedOpacity, radius, shadow, space } from "./theme";

type Props<T extends string> = {
  /** 整組的無障礙名稱，例如「排序方式」 */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** 分段切換（持股分頁、排序、核心／衛星）。樣式同 PriceHistoryCard 裡的那組 */
export function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.segment, selected && styles.segmentOn, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: 2,
  },
  // 44：iOS 最小觸控高度（外框 2 + 內格 40 + 2）
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - 2,
    paddingHorizontal: space.xs,
  },
  segmentOn: { backgroundColor: colors.card, ...shadow.sm },
  segmentText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.mutedForeground },
  segmentTextOn: { color: colors.foreground, fontFamily: fonts.semibold },
  pressed: { opacity: pressedOpacity },
});
