/**
 * 功能開關（feature toggle）。開發中、還不能給測試同學用的功能放這裡，預設關閉。
 *
 * 開法：在專案根目錄的 `.env.local`（已被 git 忽略）加一行，然後在手機上整個 reload app：
 *   EXPO_PUBLIC_FEATURE_SCREENSHOT_IMPORT=1
 * EAS 打包（APK）沒有設這個變數，所以一律關閉。
 *
 * EXPO_PUBLIC_ 變數會在打包時被 Expo CLI 直接換成字串，所以必須整個寫死 `process.env.EXPO_PUBLIC_…`，
 * 不能用變數或解構拿。
 *
 * 用「物件屬性」而不是常數匯出：畫面在 render 時才讀，測試可以直接改值（見 CalculateScreen.test.tsx）。
 */
export const features = {
  /** Story 005：從券商截圖匯入持股。APK 版連不到辨識服務，上線方式見 docs/research/screenshot-import.md */
  screenshotImport: process.env.EXPO_PUBLIC_FEATURE_SCREENSHOT_IMPORT === "1",
  /**
   * Story 017：算完盈虧後的「AI 解讀」按鈕。要搭配電腦上的 backend/（npm run backend），
   * 設定與連線方式見 docs/architecture.md 第 7 節「AI 解讀後端」。
   */
  aiInsight: process.env.EXPO_PUBLIC_FEATURE_AI_INSIGHT === "1",
};
