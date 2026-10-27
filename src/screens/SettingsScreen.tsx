import { router, Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { DISCLAIMER_TEXT } from "@/ui/DisclaimerGate";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

/**
 * 設定頁。對應 docs/stories/013-disclaimer.md（常駐免責聲明）、
 * 020-pro-plan-lock.md（方案狀態與 Demo 開關，由功能開關 proPlan 控制，預設關閉）。
 * 之後首頁改成分頁導覽時，這頁就是「設定」分頁；Google 登入入口也會放這裡。
 * 路由入口在 src/app/settings.tsx。
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { pro, demoUnlocked, setDemoUnlocked } = useProStatus();
  const showPro = useFeatures().proPlan;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
    >
      <Stack.Screen options={{ title: "設定" }} />

      {showPro ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            方案
          </Text>
          <View style={styles.card}>
            <Text style={styles.planText} testID="current-plan">
              目前方案：{pro ? "Pro（Demo 解鎖）" : "Free"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看 Pro 方案"
              testID="button-open-pro"
              onPress={() => router.push("/pro")}
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            >
              <Text style={styles.outlineButtonText}>查看 Pro 方案</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          免責聲明
        </Text>
        <View style={styles.card} testID="settings-disclaimer">
          <Text style={styles.bodyText}>{DISCLAIMER_TEXT}</Text>
        </View>
      </View>

      {showPro ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            展示用
          </Text>
          <View style={[styles.card, styles.switchRow]}>
            <View style={styles.switchLabel}>
              <Text style={styles.bodyText}>Demo：解鎖所有 Pro 功能</Text>
              <Text style={styles.hint}>只為了展示，不會收費；關掉就恢復成 Free。</Text>
            </View>
            <Switch
              accessibilityLabel="Demo：解鎖所有 Pro 功能"
              testID="switch-pro-demo"
              value={demoUnlocked}
              onValueChange={(value) => void setDemoUnlocked(value)}
              trackColor={{ true: colors.secondary, false: colors.border }}
              thumbColor={colors.card}
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  section: { marginBottom: space.lg },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginBottom: space.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
  },
  bodyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.foreground,
    lineHeight: fontSize.md * 1.6,
  },
  planText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.foreground },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.mutedForeground },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  switchLabel: { flex: 1, gap: space.xs },
  outlineButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.primary },
  pressed: { opacity: 0.85 },
});
