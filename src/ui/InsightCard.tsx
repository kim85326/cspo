import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Insight } from "@/data/InsightProvider";
import type { InsightInput } from "@/domain/insightInput";
import { useInsight } from "@/hooks/useInsight";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

/**
 * AI 解讀（Story 031）：結果卡下方的「AI 解讀」按鈕 → 解讀中 → 解讀卡；失敗顯示原因與「重試」。
 * 由功能開關 aiInsight 控制（src/config/features.ts，可遠端切換），開關在 CalculateScreen 判斷。
 */
export function InsightSection({ input }: { input: InsightInput }) {
  const { state, request } = useInsight(input);

  if (state.status === "done") return <InsightCard insight={state.insight} />;

  const loading = state.status === "loading";
  return (
    <View style={styles.section}>
      {state.status === "error" ? (
        <View style={styles.error} testID="insight-error" accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{state.message}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.status === "error" ? "重試 AI 解讀" : "AI 解讀"}
        accessibilityState={{ disabled: loading, busy: loading }}
        testID="button-ai-insight"
        onPress={() => void request()}
        disabled={loading}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, loading && styles.disabled]}
      >
        {loading ? (
          <View style={styles.loadingRow} testID="insight-loading">
            <ActivityIndicator color={colors.secondary} />
            <Text style={styles.buttonText}>AI 解讀中…</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>{state.status === "error" ? "重試 AI 解讀" : "AI 解讀"}</Text>
        )}
      </Pressable>
    </View>
  );
}

/** 解讀卡：一句話總結、2～4 點觀察、風險提醒、固定免責聲明 */
export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <View style={styles.card} testID="insight-card" accessibilityLabel="AI 解讀結果">
      <Text style={styles.title} accessibilityRole="header">
        AI 解讀
      </Text>
      <Text style={styles.summary}>{insight.summary}</Text>
      <View style={styles.list}>
        {insight.observations.map((text) => (
          <View key={text} style={styles.item}>
            <Text style={styles.bullet} accessibilityElementsHidden importantForAccessibility="no">
              •
            </Text>
            <Text style={styles.itemText}>{text}</Text>
          </View>
        ))}
      </View>
      {insight.riskNote ? <Text style={styles.riskNote}>{insight.riskNote}</Text> : null}
      {insight.filtered ? (
        <Text style={styles.filtered} testID="insight-filtered">
          部分內容不符合「只描述數據」的規則，已移除。
        </Text>
      ) : null}
      <Text style={styles.disclaimer}>{insight.disclaimer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.md },
  button: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    backgroundColor: colors.card,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  buttonText: { fontFamily: fonts.semibold, color: colors.secondary, fontSize: fontSize.md },
  error: {
    backgroundColor: colors.destructiveSurface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  errorText: { fontFamily: fonts.regular, color: colors.destructive, fontSize: fontSize.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  title: { fontFamily: fonts.semibold, color: colors.secondary, fontSize: fontSize.sm },
  summary: {
    fontFamily: fonts.semibold,
    color: colors.cardForeground,
    fontSize: fontSize.lg,
    lineHeight: fontSize.lg * 1.5,
  },
  list: { gap: space.xs },
  item: { flexDirection: "row", gap: space.sm },
  bullet: { fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: fontSize.md, lineHeight: fontSize.md * 1.5 },
  itemText: {
    flex: 1,
    fontFamily: fonts.regular,
    color: colors.cardForeground,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
  },
  riskNote: {
    fontFamily: fonts.regular,
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
  },
  filtered: { fontFamily: fonts.regular, color: colors.accent, fontSize: fontSize.xs },
  disclaimer: {
    fontFamily: fonts.medium,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
});
