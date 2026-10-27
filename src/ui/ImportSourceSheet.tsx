import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ImportSource } from "@/hooks/useScreenshotImport";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

type Props = {
  visible: boolean;
  onPick: (source: ImportSource) => void;
  onClose: () => void;
};

/**
 * 「從截圖匯入」的底部選單：從相簿選、拍照、取消。
 * 用 RN 內建 Modal，不加原生套件，Expo Go 直接能跑。
 */
export function ImportSourceSheet({ visible, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="關閉選單" onPress={onClose} />
      <View
        style={[styles.sheet, { paddingBottom: space.md + insets.bottom }]}
        accessibilityViewIsModal
        testID="import-source-sheet"
      >
        <Text style={styles.title} accessibilityRole="header">
          從截圖匯入持股
        </Text>
        <Text style={styles.hint}>選一張券商 app 的持股畫面，會自動辨識股票、成本價與數量。</Text>
        <SheetButton label="從相簿選" testID="button-import-library" onPress={() => onPick("library")} />
        <SheetButton label="拍照" testID="button-import-camera" onPress={() => onPick("camera")} />
        <SheetButton label="取消" testID="button-import-cancel" onPress={onClose} secondary />
      </View>
    </Modal>
  );
}

function SheetButton({
  label,
  testID,
  onPress,
  secondary = false,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2, 6, 23, 0.45)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.lg,
    color: colors.foreground,
    marginBottom: space.xs,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginBottom: space.md,
    lineHeight: fontSize.sm * 1.5,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  buttonSecondary: { backgroundColor: colors.muted },
  buttonText: { fontFamily: fonts.semibold, fontSize: fontSize.md, color: colors.onPrimary },
  buttonTextSecondary: { color: colors.foreground },
  pressed: { opacity: 0.85 },
});
