// 只從各字重的子路徑 import：從套件根目錄 import 會把 14 個字重（含斜體）全打進 APK。
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans/500Medium";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans/700Bold";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { FeatureFlagsProvider } from "@/hooks/useFeatures";
import { ProStatusProvider } from "@/hooks/useProStatus";
import { DcaAutoRunner } from "@/ui/DcaAutoRunner";
import { DisclaimerGate } from "@/ui/DisclaimerGate";
import { SettingsHeaderButton } from "@/ui/SettingsHeaderButton";
import { colors, fonts } from "@/ui/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
        <Stack
          screenOptions={{
            headerTitleAlign: "center",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontFamily: fonts.semibold, color: colors.foreground },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "賺了嗎", headerRight: () => <SettingsHeaderButton /> }} />
          {/* 畫面載入前標題就先對，不閃出路由名稱 */}
          <Stack.Screen name="history" options={{ title: "資產走勢" }} />
        </Stack>
        {/* 定期定額：App 開啟時補產生到期的買入交易（Story 024） */}
        <DcaAutoRunner />
        <DisclaimerGate />
      </ProStatusProvider>
    </FeatureFlagsProvider>
  );
}
