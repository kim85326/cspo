import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, fontSize, iconSize, pressedOpacity, radius, space, touchTarget } from "./theme";

type Variant = "primary" | "secondary" | "tonal" | "ghost" | "destructive";

type Props = {
  label: string;
  onPress: () => void;
  /**
   * - primary：金色實心，一頁最多一個主要動作
   * - secondary：深藍外框
   * - tonal：淺灰底，次要但常用（例如「快速試算」）
   * - ghost：純文字連結樣式，仍保有 48 的觸控高度
   * - destructive：紅色實心，只用在確認刪除
   */
  variant?: Variant;
  /** sm：放在標題列或卡片右上角；仍有 hitSlop 補到 48 */
  size?: "md" | "sm";
  icon?: IconName;
  disabled?: boolean;
  /** 預設等於 label */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const FOREGROUND: Record<Variant, string> = {
  primary: colors.onAccent,
  secondary: colors.primary,
  tonal: colors.primary,
  ghost: colors.secondary,
  destructive: colors.onPrimary,
};

/** 全 app 共用的按鈕。按下時降低透明度（不改尺寸，版面不跳）；disabled 時變淡且不能按 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: Props) {
  const color = FOREGROUND[variant];
  const small = size === "sm";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={small ? (touchTarget - SMALL_HEIGHT) / 2 : undefined}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.medium,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.inner}>
        {icon ? <Icon name={icon} size={small ? iconSize.sm : iconSize.md} color={color} /> : null}
        <Text style={[small ? styles.labelSmall : styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const SMALL_HEIGHT = 36;

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  medium: { minHeight: touchTarget, paddingHorizontal: space.lg },
  small: { minHeight: SMALL_HEIGHT, paddingHorizontal: space.md, borderRadius: radius.pill },
  inner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.md },
  labelSmall: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.card },
  tonal: { backgroundColor: colors.muted },
  ghost: { backgroundColor: "transparent", paddingHorizontal: space.sm },
  destructive: { backgroundColor: colors.destructive },
  pressed: { opacity: pressedOpacity },
  disabled: { opacity: 0.5 },
});
