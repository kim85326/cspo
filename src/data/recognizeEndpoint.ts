import Constants from "expo-constants";
import { Platform } from "react-native";

export const RECOGNIZE_PATH = "/recognize";

/**
 * 辨識 API（src/app/recognize+api.ts）的網址。
 * - 網頁版：同源相對路徑。
 * - Expo Go／開發版：dev server 的位址在 expoConfig.hostUri（例如 192.168.1.5:8081 或 tunnel 的 xxx.exp.direct），
 *   手機要用它組成完整網址才打得到電腦。
 * - 正式版沒有 hostUri，回相對路徑，由 app.json expo-router 的 origin 決定要打哪台伺服器。
 */
export function recognizeUrl(hostUri = Constants.expoConfig?.hostUri): string {
  if (Platform.OS === "web" || !hostUri) return RECOGNIZE_PATH;
  const host = hostUri.replace(/\/+$/, "");
  const scheme = /\.exp\.direct$/.test(host.replace(/:\d+$/, "")) ? "https" : "http";
  return `${scheme}://${host}${RECOGNIZE_PATH}`;
}
