import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { candleSource as defaultCandleSource, ledgerRepository as defaultRepository } from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import { runDcaCatchUp } from "@/data/dcaRules";
import type { LedgerRepository } from "@/data/ledgerRepository";
import { localIsoDate } from "@/domain/buyDate";
import { useDcaPlan } from "@/hooks/useDcaPlan";
import { colors, fonts, fontSize, radius, shadow, space, touchTarget } from "./theme";

/** 提示條自動消失的時間 */
export const DCA_NOTICE_MS = 8000;

type Props = {
  repository?: LedgerRepository;
  candleSource?: CandleSource;
};

/**
 * App 開啟時跑一次定期定額補帳（P2-02，docs/stories/024），放在根 layout。
 * 有新產生的交易就在畫面底部顯示提示條，點了到定期定額頁；沒有就什麼都不顯示。
 * 抓不到收盤價或存檔失敗都安靜跳過，下次開啟再補。
 */
export function DcaAutoRunner({ repository = defaultRepository, candleSource = defaultCandleSource }: Props) {
  const insets = useSafeAreaInsets();
  const { unlimited, loaded } = useDcaPlan();
  const ran = useRef(false);
  const mounted = useRef(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 只跑一次。跑的途中方案狀態變了（例如遠端功能開關剛抓到）也不取消，結果照樣顯示
  useEffect(() => {
    if (!loaded || ran.current) return;
    ran.current = true;
    runDcaCatchUp({ repository, candleSource, unlimited, today: localIsoDate(new Date()) })
      .then((report) => {
        if (mounted.current && report.created.length > 0) setCount(report.created.length);
      })
      .catch(() => {});
  }, [loaded, unlimited, repository, candleSource]);

  useEffect(() => {
    if (count === 0) return;
    const timer = setTimeout(() => setCount(0), DCA_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [count]);

  if (count === 0) return null;
  return (
    <View style={[styles.wrapper, { bottom: space.md + insets.bottom }]} pointerEvents="box-none">
      <View style={styles.notice} accessibilityRole="alert" testID="dca-notice">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`定期定額已自動記上 ${count} 筆買入，查看定期定額`}
          onPress={() => {
            setCount(0);
            router.push("/dca");
          }}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        >
          <Text style={styles.text}>定期定額已自動記上 {count} 筆買入</Text>
          <Text style={styles.link}>查看</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="關閉定期定額提示"
          onPress={() => setCount(0)}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", left: space.md, right: space.md, alignItems: "center" },
  notice: {
    width: "100%",
    maxWidth: 480,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  body: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: space.md,
    gap: space.sm,
  },
  text: { flexShrink: 1, fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.onPrimary },
  link: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.accentSurface },
  close: { width: touchTarget, height: touchTarget, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: fontSize.md, color: colors.onPrimary },
  pressed: { opacity: 0.85 },
});
