import { useEffect, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon, type IconName } from "./Icon";
import {
  colors,
  contentMaxWidth,
  fonts,
  fontSize,
  iconSize,
  pressedOpacity,
  radius,
  shadow,
  space,
  touchTarget,
  type,
} from "./theme";

/**
 * 版面積木：卡片、區塊標題、提示條、空狀態、骨架畫面。
 * 每一頁都用這幾個，圓角、留白、陰影、字級才會一致。
 */

/** 白底卡片：圓角 16、細邊框 + 淡陰影 */
export function Card({
  children,
  style,
  ...rest
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  accessible?: boolean;
}) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

/** 區塊標題：左邊標題，右邊可放一個動作（例如「看全部」） */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

type Tone = "warning" | "error" | "info" | "success";

const TONE: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
  warning: { bg: colors.accentSurface, fg: colors.accent, icon: "alert" },
  error: { bg: colors.destructiveSurface, fg: colors.destructive, icon: "alert" },
  info: { bg: colors.secondarySurface, fg: colors.secondary, icon: "info" },
  success: { bg: colors.secondarySurface, fg: colors.secondary, icon: "check" },
};

/** 提示條：缺價、載入失敗、存檔結果。圖示 + 文字，不只靠顏色 */
export function Notice({
  tone,
  title,
  message,
  action,
  testID,
  alert = false,
}: {
  tone: Tone;
  title?: string;
  message: string;
  action?: { label: string; accessibilityLabel?: string; onPress: () => void };
  testID?: string;
  /** true：用 accessibilityRole="alert" 播報（錯誤、存檔結果） */
  alert?: boolean;
}) {
  const t = TONE[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: t.bg }]}
      testID={testID}
      accessibilityRole={alert ? "alert" : undefined}
      accessibilityLiveRegion={alert ? "polite" : undefined}
    >
      <View style={styles.noticeIcon}>
        <Icon name={t.icon} size={iconSize.md} color={t.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: t.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{message}</Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          hitSlop={space.sm}
          onPress={action.onPress}
          style={({ pressed }) => [styles.noticeAction, pressed && styles.pressed]}
        >
          <Text style={[styles.noticeActionText, { color: t.fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 空狀態：圖示、標題、說明、（選填）動作。用在沒有交易、沒有持股、找不到資料 */
export function EmptyState({
  icon,
  title,
  message,
  children,
  testID,
}: {
  icon: IconName;
  title: string;
  message?: string;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.empty} testID={testID}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={colors.secondary} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  );
}

/**
 * 骨架畫面的一塊。資料還沒到時先佔住版面，內容出來不會跳。
 * 有開「減少動態效果」就不閃。
 */
export function SkeletonBlock({
  width = "100%",
  height = 16,
  style,
  tone = "light",
}: {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** dark：放在深藍主視覺卡上 */
  tone?: "light" | "dark";
}) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, opacity, backgroundColor: tone === "dark" ? colors.brandBorder : colors.skeleton },
        style,
      ]}
    />
  );
}

/** 整張卡片的骨架：標題 + 幾行。accessibilityLabel 讓螢幕閱讀器知道在載入 */
export function SkeletonCard({ lines = 3, label = "載入中" }: { lines?: number; label?: string }) {
  return (
    <Card accessible accessibilityLabel={label}>
      <SkeletonBlock width="40%" height={14} />
      <SkeletonBlock width="60%" height={28} style={styles.skeletonGap} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} width={i % 2 ? "85%" : "100%"} height={12} style={styles.skeletonGap} />
      ))}
    </Card>
  );
}

function usePulse() {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    // 測試環境不跑動畫（避免計時器殘留）
    if (process.env.JEST_WORKER_ID !== undefined) return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);
  return opacity;
}

/** 卡片裡「標籤 ……… 數值」的一列；數值等寬、靠右 */
export function KeyValueRow({
  label,
  value,
  valueColor = colors.cardForeground,
  first = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  /** 第一列不畫上框線 */
  first?: boolean;
}) {
  return (
    <View style={[styles.kvRow, first && styles.kvRowFirst]} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export const surfaceStyles = StyleSheet.create({
  /** 一頁的 ScrollView contentContainerStyle */
  screenContent: {
    padding: space.md,
    gap: space.md,
    width: "100%",
    maxWidth: contentMaxWidth,
    alignSelf: "center",
  },
  screen: { flex: 1, backgroundColor: colors.background },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
    ...shadow.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget - space.sm,
    marginTop: space.xs,
  },
  sectionTitle: { ...type.title, color: colors.foreground },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    paddingLeft: space.md,
    paddingRight: space.sm,
    paddingVertical: space.sm + 2,
  },
  noticeIcon: { alignSelf: "flex-start", paddingTop: 2 },
  noticeBody: { flex: 1, gap: 2 },
  noticeTitle: { ...type.label, fontFamily: fonts.semibold },
  noticeText: { fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 20, color: colors.foreground },
  noticeAction: { minHeight: touchTarget - space.sm, justifyContent: "center", paddingHorizontal: space.sm },
  noticeActionText: { fontFamily: fonts.semibold, fontSize: fontSize.sm },
  pressed: { opacity: pressedOpacity },
  empty: { alignItems: "center", paddingVertical: space.xl, paddingHorizontal: space.md, gap: space.sm },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  emptyTitle: { ...type.title, color: colors.foreground, textAlign: "center" },
  emptyMessage: {
    ...type.body,
    fontSize: fontSize.sm,
    lineHeight: 22,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  emptyActions: { alignSelf: "stretch", gap: space.sm, marginTop: space.sm },
  skeleton: { borderRadius: radius.sm },
  skeletonGap: { marginTop: space.sm },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
    minHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  kvRowFirst: { borderTopWidth: 0 },
  kvLabel: { ...type.label, fontFamily: fonts.regular, color: colors.mutedForeground },
  kvValue: { ...type.numericSm, textAlign: "right", flexShrink: 1 },
});
