import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from "@expo-google-fonts/ibm-plex-sans";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
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

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleAlign: "center",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontFamily: fonts.semibold, color: colors.foreground },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}
