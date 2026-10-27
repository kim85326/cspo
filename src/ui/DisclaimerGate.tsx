import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDisclaimerConsent } from "@/hooks/useDisclaimerConsent";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

/** product-spec M-10 的原文。首次開啟與設定頁共用同一段，改字只改這裡。 */
export const DISCLAIMER_TEXT =
  "本 App 僅供記帳與計算參考，不構成任何投資建議。計算結果可能與券商對帳單有些微差異，請以券商資料為準。";

/**
 * 首次開啟的免責聲明（Story 013）。放在根 layout，蓋在所有畫面上面。
 * 一定要按「我已了解並同意」才會關：點背景、Android 返回鍵都不會關掉。
 * 同意後記在手機，之後不再出現；設定頁隨時可以再看。
 */
export function DisclaimerGate() {
  const { needsConsent, accept } = useDisclaimerConsent();
  return (
    <Modal visible={needsConsent} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal testID="disclaimer-modal">
          <Text style={styles.title} accessibilityRole="header">
            使用前請先閱讀
          </Text>
          <ScrollView style={styles.body}>
            <Text style={styles.text}>{DISCLAIMER_TEXT}</Text>
            <Text style={styles.hint}>之後可以在「設定」再看一次。</Text>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="我已了解並同意"
            testID="button-accept-disclaimer"
            onPress={() => void accept()}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>我已了解並同意</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.45)",
    justifyContent: "center",
    padding: space.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.foreground,
    marginBottom: space.sm,
  },
  body: { flexGrow: 0, marginBottom: space.lg },
  text: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.foreground,
    lineHeight: fontSize.md * 1.6,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: space.sm,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onPrimary },
  pressed: { opacity: 0.85 },
});
