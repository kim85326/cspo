import { router, Tabs } from "expo-router";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHaptics } from "@/ui/haptics";
import { Icon, type IconName } from "@/ui/Icon";
import { colors, fonts, fontSize, iconSize, space } from "@/ui/theme";

const TAB_BAR_HEIGHT = 64;

/**
 * 底部分頁：總覽／持股／新增／設定（mvp-implementation-guide 的 (tabs) 結構）。
 * 「新增」不是一頁：按下去 push 交易畫面（蓋在分頁上，存檔後 router.back() 回到原本的分頁）。
 * 分頁標題（header）用 title，分頁列的字用 tabBarLabel，兩者分開。
 */
export default function TabsLayout() {
  // 圖示 24 + 文字 + 上下留白；底部再加安全區（Home 指示條）。預設高度在網頁版會切到文字
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  return (
    <Tabs
      // 切換分頁（含按「新增」）時輕微震一下（Story 036，功能開關 haptics）
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        headerTitleAlign: "center",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.foreground },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.secondary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: fontSize.xs },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: space.xs + 2,
          paddingBottom: insets.bottom + space.xs + 2,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "賺了嗎", tabBarLabel: "總覽", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen
        name="holdings"
        options={{ title: "持股明細", tabBarLabel: "持股", tabBarIcon: tabIcon("pieChart") }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: "新增交易",
          tabBarLabel: "新增",
          tabBarAccessibilityLabel: "新增交易",
          tabBarButtonTestID: "tab-add-transaction",
          tabBarIcon: () => (
            <View style={styles.addIcon}>
              <Icon name="plus" size={iconSize.md} color={colors.onBrand} strokeWidth={2.5} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/transaction/new");
          },
        }}
      />
      <Tabs.Screen name="settings" options={{ title: "設定", tabBarLabel: "設定", tabBarIcon: tabIcon("settings") }} />
    </Tabs>
  );
}

function tabIcon(name: IconName) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={iconSize.lg} color={color} />;
  }
  return TabIcon;
}

const styles = StyleSheet.create({
  // 「新增」用品牌深藍圓底，跟其他三個分頁區分：它是動作，不是一頁
  addIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
