import { Redirect, Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PRO_FEATURES } from "@/domain/plan";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { ProLockedCard } from "@/ui/ProLockedCard";
import { Card, Notice, SectionHeader, surfaceStyles } from "@/ui/Surface";
import { colors, fonts, fontSize, iconSize, radius, space, type } from "@/ui/theme";

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
      style={surfaceStyles.screen}
      contentContainerStyle={[surfaceStyles.screenContent, { paddingBottom: space.xl + insets.bottom }]}
    >
      <Stack.Screen options={{ title: "Pro 方案" }} />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="crown" size={iconSize.lg} color={colors.gold} />
        </View>
        <Text style={styles.heading} accessibilityRole="header">
          賺了嗎 Pro
        </Text>
        <Text style={styles.lead}>把時間、股利與定期定額都算進去，看清楚自己選股到底值不值得。</Text>
      </View>

      <Card style={styles.table} testID="plan-table" accessibilityLabel="Free 與 Pro 方案比較">
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cellFeature, styles.headText]}>功能</Text>
          <Text style={[styles.cell, styles.headText]}>Free</Text>
          <Text style={[styles.cell, styles.headText, styles.headPro]}>Pro</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.cellFeature}>記帳、盈虧計算等基本功能</Text>
          <View style={styles.cellIcon} accessible accessibilityLabel="Free 有">
            <Icon name="check" size={iconSize.md} color={colors.mutedForeground} />
          </View>
          <View style={styles.cellIcon} accessible accessibilityLabel="Pro 有">
            <Icon name="check" size={iconSize.md} color={colors.secondary} />
          </View>
        </View>
        {PRO_FEATURES.map((feature) => (
          <View key={feature.id} style={styles.row}>
            <Text style={styles.cellFeature}>{feature.title}</Text>
            <Text style={[styles.cell, styles.cellMuted]}>{feature.free}</Text>
            <Text style={[styles.cell, styles.cellPro]}>{feature.pro}</Text>
          </View>
        ))}
      </Card>

      <SectionHeader title="功能預覽" />
      {PRO_FEATURES.map((feature) => (
        <ProLockedCard key={feature.id} feature={feature.id} showUpgrade={false} unlocked={pro} />
      ))}

      {pro ? (
        <View testID="pro-unlocked" accessibilityLiveRegion="polite">
          <Notice tone="success" title="已解鎖所有 Pro 功能" message="目前是用設定頁的 Demo 開關解鎖，不會收費。" />
        </View>
      ) : (
        <>
          <Button label="升級 Pro" icon="crown" testID="button-upgrade-pro" onPress={() => setComingSoon(true)} />
          {comingSoon ? (
            <View testID="pro-coming-soon">
              <Notice
                tone="info"
                alert
                title="Pro 方案即將推出"
                message="目前還不能付費升級，也不會向你收取任何費用。"
              />
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.footnote}>之後如果不再是 Pro，已經記錄的資料都會保留，只是 Pro 功能會鎖住。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  heading: { ...type.headline, color: colors.onBrand },
  lead: { ...type.body, color: colors.onBrandMuted },
  table: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  headRow: { borderTopWidth: 0, backgroundColor: colors.background },
  headText: { fontFamily: fonts.semibold, color: colors.foreground },
  headPro: { color: colors.secondary },
  cellFeature: { flex: 2, fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.foreground },
  cell: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, textAlign: "center", color: colors.foreground },
  cellIcon: { flex: 1, alignItems: "center" },
  cellMuted: { color: colors.mutedForeground },
  cellPro: { fontFamily: fonts.semibold, color: colors.secondary },
  footnote: { ...type.caption, color: colors.mutedForeground, textAlign: "center" },
});
