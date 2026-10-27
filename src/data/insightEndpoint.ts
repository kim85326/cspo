import Constants from "expo-constants";
import { Platform } from "react-native";

/** backend/ 的預設 port（backend/.env 的 INSIGHT_PORT） */
export const DEFAULT_INSIGHT_PORT = 8787;

/**
 * AI 後端（backend/）的網址：AI 解讀（/insight）與截圖匯入的辨識（/recognize）共用。
 * 1. 有設 EXPO_PUBLIC_INSIGHT_API_URL 就用它：ngrok 的固定網址（https://xxxx.ngrok-free.app），
 *    給別人連、APK、tunnel 都靠這個；npm run backend:tunnel 啟動時會印出要設的值。
 * 2. 沒設時猜一個，省得在同一台電腦或同一個 Wi-Fi 開發還要設定：
 *    - 網頁版：同一台電腦的 http://<網頁的主機名>:8787
 *    - Expo Go 區網模式：dev server 的 IP（expoConfig.hostUri）換成 8787
 *    - tunnel（*.exp.direct，Expo Go 或網頁版）或 APK：猜不到，回 null，畫面提示要設網址
 * 細節見 docs/architecture.md 第 7 節「AI 解讀後端」。
 */
export function insightBaseUrl(
  configured = process.env.EXPO_PUBLIC_INSIGHT_API_URL,
  hostUri = Constants.expoConfig?.hostUri,
  platform: string = Platform.OS,
  webHostname = typeof window !== "undefined" ? window.location?.hostname : undefined,
): string | null {
  if (configured && configured.trim() !== "") return configured.trim().replace(/\/+$/, "");
  const host =
    platform === "web" ? webHostname : hostUri?.replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!host || host.endsWith(".exp.direct")) return null;
  return `http://${host}:${DEFAULT_INSIGHT_PORT}`;
}
