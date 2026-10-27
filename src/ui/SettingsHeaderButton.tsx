import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, fontSize, space, touchTarget } from "./theme";

/** 首頁右上角的「設定」入口（Story 013）。首頁改成分頁導覽後，改由「設定」分頁取代。 */
export function SettingsHeaderButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="設定"
      testID="button-open-settings"
      hitSlop={space.sm}
      onPress={() => router.push("/settings")}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.text}>設定</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: space.sm },
  pressed: { opacity: 0.6 },
  text: { fontFamily: fonts.medium, fontSize: fontSize.md, color: colors.primary },
});
