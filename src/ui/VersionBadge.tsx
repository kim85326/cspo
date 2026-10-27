import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { readVersionSources } from "@/data/appVersionSource";
import { describeVersion, type RawVersionSources } from "@/domain/versionInfo";
import { colors, fonts, fontSize, radius, space, touchTarget } from "./theme";

type Props = {
  /** 測試用：直接給原始值；不給就讀這台手機的實際值 */
  sources?: RawVersionSources;
};

type CopyState = "idle" | "copied" | "failed";

/**
 * 畫面最底部的版本資訊（Story 018）：一行小字，點一下展開完整資訊與「複製版本資訊」按鈕。
 * 文字整理在 src/domain/versionInfo.ts，原始值來自 src/data/appVersionSource.ts。
 * 自成一塊，首頁換成總覽頁時整個搬過去即可。
 */
export function VersionBadge({ sources }: Props) {
  const info = useMemo(() => describeVersion(sources ?? readVersionSources()), [sources]);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copy = async () => {
    try {
      // 網頁版沒有剪貼簿權限時會回 false
      setCopyState((await Clipboard.setStringAsync(info.copyText)) ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <View style={styles.container} testID="version-badge">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="版本資訊"
        accessibilityHint={expanded ? "收合版本詳細資訊" : "展開版本詳細資訊"}
        accessibilityState={{ expanded }}
        testID="button-version-badge"
        onPress={() => {
          setExpanded((v) => !v);
          setCopyState("idle");
        }}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.summaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.summary}>
          {info.summary} {expanded ? "▴" : "▾"}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.details} testID="version-details">
          {info.details.map((d) => (
            <View key={d.label} style={styles.row}>
              <Text style={styles.label}>{d.label}</Text>
              {/* 複製不能用時（例如網頁版擋剪貼簿），還可以長按選取文字 */}
              <Text style={styles.value} selectable>
                {d.value}
              </Text>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="複製版本資訊"
            testID="button-copy-version"
            onPress={copy}
            style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
          >
            <Text style={styles.copyButtonText}>複製版本資訊</Text>
          </Pressable>
          {copyState !== "idle" ? (
            <Text style={styles.copyResult} accessibilityLiveRegion="polite" testID="copy-version-result">
              {copyState === "copied" ? "已複製，可以貼進 bug 回報" : "複製失敗，請長按上面的文字選取"}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: space.xs, alignItems: "center" },
  summaryButton: { minHeight: touchTarget - space.md, justifyContent: "center", paddingHorizontal: space.sm },
  summary: {
    fontFamily: fonts.regular,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
  pressed: { opacity: 0.6 },
  details: {
    alignSelf: "stretch",
    marginTop: space.xs,
    padding: space.md,
    gap: space.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  row: { flexDirection: "row", gap: space.sm },
  label: {
    width: 112,
    fontFamily: fonts.medium,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
  },
  value: { flex: 1, fontFamily: fonts.regular, color: colors.foreground, fontSize: fontSize.xs },
  copyButton: {
    minHeight: touchTarget,
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  copyButtonText: { fontFamily: fonts.medium, color: colors.primary, fontSize: fontSize.sm },
  copyResult: {
    fontFamily: fonts.regular,
    color: colors.mutedForeground,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
});
