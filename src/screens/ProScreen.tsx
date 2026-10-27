import { Redirect, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PRO_FEATURES } from "@/domain/plan";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { ProLockedCard } from "@/ui/ProLockedCard";
import { colors, fonts, fontSize, radius, space, touchTarget } from "@/ui/theme";

/**
 * Pro 方案介紹頁（docs/stories/020-pro-plan-lock.md）。Tech Day 只做畫面，不串金流：
 * 「升級 Pro」只顯示「Pro 方案即將推出」，不進入任何付款流程。
 * 由功能開關 proPlan 控制（useFeatures），關閉時導回首頁。路由入口在 src/app/pro.tsx。
 */
export default function ProScreen() {
  const insets = useSafeAreaInsets();
  const features = useFeatures();
  const { pro } = useProStatus();
  const [comingSoon, setComingSoon] = useState(false);

  if (!features.proPlan) return <Redirect href="/" />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
    >
      <Stack.Screen options={{ title: "Pro 方案" }} />

      <Text style={styles.heading} accessibilityRole="header">
        賺了嗎 Pro
      </Text>
      <Text style={styles.lead}>把時間、股利與定期定額都算進去，看清楚自己選股到底值不值得。</Text>

      <View style={styles.table} testID="plan-table" accessibilityLabel="Free 與 Pro 方案比較">
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cellFeature, styles.headText]}>功能</Text>
          <Text style={[styles.cell, styles.headText]}>Free</Text>
          <Text style={[styles.cell, styles.headText]}>Pro</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.cellFeature}>記帳、盈虧計算等基本功能</Text>
          <Text style={styles.cell}>✓</Text>
          <Text style={styles.cell}>✓</Text>
        </View>
        {PRO_FEATURES.map((feature) => (
          <View key={feature.id} style={styles.row}>
            <Text style={styles.cellFeature}>{feature.title}</Text>
            <Text style={[styles.cell, styles.cellMuted]}>{feature.free}</Text>
            <Text style={[styles.cell, styles.cellPro]}>{feature.pro}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        功能預覽
      </Text>
      {PRO_FEATURES.map((feature) => (
        <ProLockedCard key={feature.id} feature={feature.id} showUpgrade={false} unlocked={pro} />
      ))}

      {pro ? (
        <View style={styles.notice} testID="pro-unlocked" accessibilityLiveRegion="polite">
          <Text style={styles.noticeTitle}>已解鎖所有 Pro 功能</Text>
          <Text style={styles.noticeText}>目前是用設定頁的 Demo 開關解鎖，不會收費。</Text>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="升級 Pro"
            testID="button-upgrade-pro"
            onPress={() => setComingSoon(true)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>升級 Pro</Text>
          </Pressable>
          {comingSoon ? (
            <View
              style={styles.notice}
              testID="pro-coming-soon"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.noticeTitle}>Pro 方案即將推出</Text>
              <Text style={styles.noticeText}>目前還不能付費升級，也不會向你收取任何費用。</Text>
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.footnote}>之後如果不再是 Pro，已經記錄的資料都會保留，只是 Pro 功能會鎖住。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  heading: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.foreground,
    marginBottom: space.xs,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.mutedForeground,
    lineHeight: fontSize.md * 1.5,
    marginBottom: space.lg,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: space.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  headRow: { borderTopWidth: 0, backgroundColor: colors.muted },
  headText: { fontFamily: fonts.semibold, color: colors.foreground },
  cellFeature: { flex: 2, fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.foreground },
  cell: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, textAlign: "center", color: colors.foreground },
  cellMuted: { color: colors.mutedForeground },
  cellPro: { fontFamily: fonts.semibold, color: colors.secondary },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.foreground,
    marginBottom: space.sm,
  },
  button: {
    minHeight: touchTarget,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.md,
    marginBottom: space.md,
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onAccent },
  pressed: { opacity: 0.85 },
  notice: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
    marginBottom: space.md,
    gap: space.xs,
  },
  noticeTitle: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.accent },
  noticeText: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.foreground },
  footnote: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: space.sm,
  },
});
