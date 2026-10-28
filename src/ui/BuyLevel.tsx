import { StyleSheet, Text, View } from "react-native";
import { type BuyLevel, type BuyPosition, LEVEL_LABEL } from "@/domain/buyPosition";
import { colors, fonts, fontSize, radius } from "./theme";

/** 「高檔／中段／低檔」標籤（P2-09）。三種都用同一個顏色：只陳述位置，不暗示好壞 */
export function LevelBadge({ level }: { level: BuyLevel }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{LEVEL_LABEL[level]}</Text>
    </View>
  );
}

/** 0–100% 的刻度條：低檔（≤20%）、中段、高檔（≥80%）三段，標出這筆買入。三段都用中性色，不暗示好壞 */
export function PercentileBar({ position }: { position: Extract<BuyPosition, { kind: "ok" }> }) {
  return (
    <View style={styles.bar} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.barTrack}>
        <View style={[styles.barSegment, { flex: 20 }]} />
        <View style={[styles.barSegment, styles.barMiddle, { flex: 60 }]} />
        <View style={[styles.barSegment, { flex: 20 }]} />
        <View style={[styles.barMarker, { left: `${position.percent}%` }]} testID="percentile-marker" />
      </View>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel}>低檔</Text>
        <Text style={styles.barLabel}>中段</Text>
        <Text style={styles.barLabel}>高檔</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onPrimary },
  bar: { gap: 2, paddingTop: 6 },
  barTrack: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "visible", gap: 2 },
  barSegment: { backgroundColor: colors.muted, borderRadius: 4 },
  barMiddle: { backgroundColor: colors.border },
  barMarker: {
    position: "absolute",
    top: -5,
    width: 4,
    height: 18,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  barLabels: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.mutedForeground },
});
