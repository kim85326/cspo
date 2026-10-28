// 只從各字重的子路徑 import：從套件根目錄 import 會把 14 個字重（含斜體）全打進 APK。
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans/500Medium";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans/700Bold";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useAutoDividendSync } from "@/hooks/useAutoDividendSync";
import { FeatureFlagsProvider } from "@/hooks/useFeatures";
import { ProStatusProvider } from "@/hooks/useProStatus";
import { DcaAutoRunner } from "@/ui/DcaAutoRunner";
import { DisclaimerGate } from "@/ui/DisclaimerGate";
import { colors, fonts, fontSize } from "@/ui/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // 股利自動帶入：App 開啟時跑一次，背景執行（Story 012）
  useAutoDividendSync();
  // 設計系統指定 IBM Plex Sans；中文字由系統字型回退。字型載好前停在 splash，避免字體跳動。
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  // FeatureFlagsProvider：功能開關，啟動與回到前景時抓遠端（Story 026）；
  // ProStatusProvider：Pro 狀態全 app 共用（Story 020）；DisclaimerGate：首次開啟的免責聲明（Story 013）
  return (
    <FeatureFlagsProvider>
      <ProStatusProvider>
        <StatusBar style="dark" />
        {/* 分頁（總覽／持股／設定）在 (tabs)；其他頁蓋在分頁上，有返回鍵。標題先在這裡給，載入中不會閃出路由名稱 */}
        <Stack
          screenOptions={{
            headerTitleAlign: "center",
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.foreground },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "賺了嗎" }} />
          <Stack.Screen name="holdings/[symbol]" options={{ title: "持股" }} />
          <Stack.Screen name="transaction/new" options={{ title: "新增交易" }} />
          <Stack.Screen name="transaction/[id]" options={{ title: "編輯交易" }} />
          <Stack.Screen name="calculate" options={{ title: "快速試算" }} />
          <Stack.Screen name="pro" options={{ title: "Pro 方案" }} />
          <Stack.Screen name="history" options={{ title: "資產走勢" }} />
          <Stack.Screen name="import" options={{ title: "從截圖匯入" }} />
          <Stack.Screen name="versus" options={{ title: "個股 vs ETF 對決" }} />
          <Stack.Screen name="dividend/new" options={{ title: "記錄股利" }} />
          <Stack.Screen name="dividend/[id]" options={{ title: "編輯股利" }} />
          <Stack.Screen name="dca/index" options={{ title: "定期定額" }} />
          <Stack.Screen name="dca/new" options={{ title: "新增定期定額" }} />
          <Stack.Screen name="dca/[id]" options={{ title: "編輯定期定額" }} />
        </Stack>
        {/* 定期定額：App 開啟時補產生到期的買入交易（Story 024） */}
        <DcaAutoRunner />
        <DisclaimerGate />
      </ProStatusProvider>
    </FeatureFlagsProvider>
  );
}
