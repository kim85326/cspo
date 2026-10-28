import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import type { RawVersionSources } from "@/domain/versionInfo";

/**
 * 讀出版本資訊的原始值（Story 032），整理成文字交給 src/domain/versionInfo.ts。
 *
 * - expo-application：安裝檔的版本名稱與 versionCode（= 下載頁的 build N）。網頁版回 null。
 * - expo-updates：內建版本還是 OTA、OTA 時間、update ID、runtime version、channel。
 *   Expo Go 與 dev 模式下這些大多是 null；網頁版是 stub（isEmbeddedLaunch 永遠 false）。
 * - EXPO_PUBLIC_OTA_MESSAGE：`npm run ota -- "說明"` 發佈時寫進 bundle（scripts/ota-update.mjs）。
 *   EXPO_PUBLIC_ 變數必須整個寫死 `process.env.EXPO_PUBLIC_…` 才會被換成字串。
 */
export function readVersionSources(): RawVersionSources {
  return {
    platform: Platform.OS,
    isDev: __DEV__,
    executionEnvironment: Constants.executionEnvironment ?? null,
    configVersion: Constants.expoConfig?.version ?? null,
    nativeAppVersion: Application.nativeApplicationVersion,
    nativeBuildVersion: Application.nativeBuildVersion,
    updatesEnabled: Updates.isEnabled,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    updateId: Updates.updateId,
    updateCreatedAt: Updates.createdAt,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    otaMessage: process.env.EXPO_PUBLIC_OTA_MESSAGE ?? null,
  };
}
