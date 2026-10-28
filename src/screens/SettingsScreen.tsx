import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { DISCLAIMER_TEXT } from "@/ui/DisclaimerGate";
import { Icon, type IconName } from "@/ui/Icon";
import { Card, surfaceStyles } from "@/ui/Surface";
import { colors, fonts, iconSize, pressedOpacity, radius, space, touchTarget, type } from "@/ui/theme";
import { VersionBadge } from "@/ui/VersionBadge";

/**
 * 設定頁（「設定」分頁，標題在 src/app/(tabs)/_layout.tsx）。對應 docs/stories/013-disclaimer.md（常駐免責聲明）、
 * 020-pro-plan-lock.md（方案狀態與 Demo 開關，由功能開關 proPlan 控制，預設關閉）。
 * Google 登入入口之後也會放這裡。
 */
export default function SettingsScreen() {
  const { pro, demoUnlocked, setDemoUnlocked } = useProStatus();
  const showPro = useFeatures().proPlan;

  return (
    <ScrollView style={surfaceStyles.screen} contentContainerStyle={[surfaceStyles.screenContent, styles.content]}>
      {showPro ? (
        <Section title="方案">
          <Card style={styles.listCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看 Pro 方案"
              testID="button-open-pro"
              onPress={() => router.push("/pro")}
              style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
            >
              <RowIcon name="crown" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} testID="current-plan">
                  目前方案：{pro ? "Pro（Demo 解鎖）" : "Free"}
                </Text>
                <Text style={styles.rowSub}>查看 Pro 方案</Text>
              </View>
              <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
            </Pressable>
          </Card>
        </Section>
      ) : null}

      <Section title="自動記帳">
        <Card style={styles.listCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="定期定額設定"
            testID="button-open-dca"
            onPress={() => router.push("/dca")}
            style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
          >
            <RowIcon name="calendar" />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>定期定額</Text>
              <Text style={styles.rowSub}>每月扣款日自動記上一筆定期定額買入。</Text>
            </View>
            <Icon name="chevronRight" size={iconSize.sm} color={colors.mutedForeground} />
          </Pressable>
        </Card>
      </Section>

      <Section title="免責聲明">
        <Card testID="settings-disclaimer" style={styles.disclaimer}>
          <RowIcon name="shield" />
          <Text style={styles.bodyText}>{DISCLAIMER_TEXT}</Text>
        </Card>
      </Section>

      {showPro ? (
        <Section title="展示用">
          <Card style={styles.listCard}>
            <View style={styles.listRow}>
              <RowIcon name="lock" />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Demo：解鎖所有 Pro 功能</Text>
                <Text style={styles.rowSub}>只為了展示，不會收費；關掉就恢復成 Free。</Text>
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
          </Card>
        </Section>
      ) : null}

      <VersionBadge />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowIcon({ name }: { name: IconName }) {
  return (
    <View style={styles.rowIcon}>
      <Icon name={name} size={iconSize.md} color={colors.secondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.mutedForeground, marginLeft: space.xs },
  listCard: { padding: 0, gap: 0 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm + space.xs,
    minHeight: touchTarget + space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md - 2,
    backgroundColor: colors.secondarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...type.bodyStrong, color: colors.foreground },
  rowSub: { ...type.label, fontFamily: fonts.regular, color: colors.mutedForeground },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: space.sm + space.xs },
  bodyText: { ...type.body, flex: 1, color: colors.foreground, lineHeight: 26 },
  pressed: { opacity: pressedOpacity },
});
