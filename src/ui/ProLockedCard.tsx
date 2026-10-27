import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PRO_FEATURES, type ProFeature, type ProFeatureId } from "@/domain/plan";
import { useProStatus } from "@/hooks/useProStatus";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

export function proFeature(id: ProFeatureId): ProFeature {
  const feature = PRO_FEATURES.find((f) => f.id === id);
  if (!feature) throw new Error(`未知的 Pro 功能：${id}`);
  return feature;
}

/** 「Pro」小標籤 */
export function ProBadge({ unlocked = false }: { unlocked?: boolean }) {
  return (
    <View style={[styles.badge, unlocked && styles.badgeUnlocked]}>
      <Text style={[styles.badgeText, unlocked && styles.badgeTextUnlocked]}>
        {unlocked ? "Pro 已解鎖" : "🔒 Pro"}
      </Text>
    </View>
  );
}

type CardProps = {
  feature: ProFeatureId;
  /** 是否顯示「升級 Pro」按鈕（介紹頁本身已有一顆大按鈕，就不用每張都放） */
  showUpgrade?: boolean;
  /** 已解鎖時改顯示「Pro 已解鎖」（只用在介紹頁的功能預覽） */
  unlocked?: boolean;
};

/**
 * 被鎖住的 Pro 功能：顯示功能名稱、說明與示意預覽，而不是直接隱藏（product-spec P2-08）。
 * 預覽是灰色的假圖，不放真的數字，避免使用者誤以為那是自己的結果。
 */
export function ProLockedCard({ feature: id, showUpgrade = true, unlocked = false }: CardProps) {
  const feature = proFeature(id);
  return (
    <View
      style={styles.card}
      testID={`pro-feature-${id}`}
      accessibilityLabel={unlocked ? `${feature.title}，已解鎖` : `${feature.title}，Pro 功能，尚未解鎖`}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{feature.title}</Text>
        <ProBadge unlocked={unlocked} />
      </View>
      <Text style={styles.description}>{feature.description}</Text>
      {unlocked ? null : (
        <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.previewBar, { width: "70%" }]} />
          <View style={[styles.previewBar, { width: "45%" }]} />
          <View style={[styles.previewBar, { width: "85%" }]} />
          <Text style={styles.previewLock}>升級 Pro 後顯示</Text>
        </View>
      )}
      {showUpgrade && !unlocked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`升級 Pro，解鎖${feature.title}`}
          testID={`button-upgrade-${id}`}
          onPress={() => router.push("/pro")}
          style={({ pressed }) => [styles.upgrade, pressed && styles.pressed]}
        >
          <Text style={styles.upgradeText}>升級 Pro</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * 包住 Pro 功能：是 Pro 就顯示內容，不是就顯示鎖定卡片。
 * 之後做 T11、T16 等功能時這樣用：<ProGate feature="annualizedReturn"><XirrCard … /></ProGate>
 */
export function ProGate({ feature, children }: { feature: ProFeatureId; children: ReactNode }) {
  const { pro } = useProStatus();
  return pro ? <>{children}</> : <ProLockedCard feature={feature} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.foreground },
  description: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    lineHeight: fontSize.sm * 1.5,
  },
  badge: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeUnlocked: { backgroundColor: colors.secondarySurface },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSize.xs, color: colors.accent },
  badgeTextUnlocked: { color: colors.secondary },
  preview: {
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
    padding: space.md,
    gap: space.sm,
  },
  previewBar: { height: space.sm, borderRadius: space.xs, backgroundColor: colors.border },
  previewLock: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: space.xs,
  },
  upgrade: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onAccent },
  pressed: { opacity: 0.85 },
});
