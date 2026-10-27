import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { chartColors, colors, fonts, fontSize, pnlColors, radius, space, touchTarget } from "./theme";

type Props = { onClose: () => void };

/**
 * 「怎麼看這張圖」：第一次看到走勢圖時自動打開，按「知道了」收起、之後不再自動跳出；
 * 標題列的「怎麼看？」可以再打開。每一項都有圖示＋文字，不靠顏色單獨傳達。
 */
export function ChartGuide({ onClose }: Props) {
  return (
    <View style={styles.box} testID="chart-guide" accessibilityLabel="怎麼看這張圖">
      <Text style={styles.title} accessibilityRole="header">
        怎麼看這張圖
      </Text>
      <Item swatch={<View style={[styles.dash, { borderColor: chartColors.cost }]} />}>
        金色虛線是你的<Text style={styles.strong}>成本</Text>（買入價）。線上方淡紅色：股價高於成本，現在是賺的；下方淡綠色：低於成本，是賠的。
      </Item>
      <Item swatch={<View style={[styles.dot, { backgroundColor: chartColors.buy }]} />}>
        藍色圓點是你<Text style={styles.strong}>買入的那天</Text>和價格。
      </Item>
      <Item swatch={<View style={[styles.line, { backgroundColor: chartColors.line }]} />}>
        <Text style={styles.strong}>折線</Text>只連每天的收盤價，適合先看大方向。
      </Item>
      <Item
        swatch={
          <View style={styles.candles}>
            <View style={[styles.candle, { backgroundColor: pnlColors.up }]} />
            <View style={[styles.candle, styles.candleLow, { backgroundColor: pnlColors.down }]} />
          </View>
        }
      >
        切到 <Text style={styles.strong}>K 棒</Text>：一根代表一天。<Text style={{ color: pnlColors.up }}>紅 K</Text>
        是收盤比開盤高（當天漲），<Text style={{ color: pnlColors.down }}>綠 K</Text>
        是收盤比開盤低（當天跌）；上下的細線是當天最高、最低價。
      </Item>
      <Item
        swatch={
          <View style={styles.cross}>
            <View style={styles.crossLine} />
            <View style={styles.crossDot} />
          </View>
        }
      >
        點一下或按住拖曳，看那一天的開盤、最高、最低、收盤和漲跌。</Item>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="知道了，收起說明"
        onPress={onClose}
        style={({ pressed }) => [styles.ok, pressed && styles.pressed]}
      >
        <Text style={styles.okText}>知道了</Text>
      </Pressable>
    </View>
  );
}

function Item({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.item}>
      <View style={styles.swatch} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {swatch}
      </View>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.sm,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.foreground },
  item: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  swatch: { width: 24, height: 20, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 21, color: colors.foreground },
  strong: { fontFamily: fonts.semibold },
  dash: { width: 22, borderTopWidth: 2, borderStyle: "dashed" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { width: 22, height: 2, borderRadius: 1 },
  candles: { flexDirection: "row", gap: 3, alignItems: "flex-end" },
  candle: { width: 6, height: 14, borderRadius: 1 },
  candleLow: { height: 10 },
  cross: { width: 14, height: 20, alignItems: "center", justifyContent: "center" },
  crossLine: { position: "absolute", width: 1, height: 20, backgroundColor: chartColors.crosshair },
  crossDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: chartColors.line,
    backgroundColor: colors.card,
  },
  ok: {
    alignSelf: "flex-end",
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  okText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onPrimary },
  pressed: { opacity: 0.7 },
});
