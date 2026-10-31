/**
 * 打開 app 時要驗證（Story 035）：什麼時候要上鎖、驗證結果怎麼跟使用者說。
 * 呼叫 expo-local-authentication 的部分在 src/native/biometrics.ts，畫面在 src/ui/AppLockGate.tsx。
 */

/** 切到背景超過這麼久再回來就要重新驗證 */
export const RELOCK_AFTER_MS = 60 * 1000;

/**
 * 從背景回到前景時要不要上鎖。backgroundAt 是切到背景的時間（ms），沒切過是 null。
 * 剛好 1 分鐘也要驗證。
 */
export function shouldRelock(backgroundAt: number | null, now: number, after: number = RELOCK_AFTER_MS): boolean {
  if (backgroundAt === null) return false;
  return now - backgroundAt >= after;
}

/**
 * 手機能用什麼方式驗證：
 * - biometric：有登錄指紋或臉部（也一定有螢幕鎖，驗證失敗可以改輸入裝置密碼）
 * - passcode：沒有登錄生物辨識，但有設定 PIN／圖形／密碼
 * - none：什麼都沒設定，無法驗證
 */
export type DeviceAuthLevel = "biometric" | "passcode" | "none";

/** 驗證失敗的原因（從 expo-local-authentication 的錯誤碼歸類） */
export type AuthFailure = "cancelled" | "lockout" | "notAvailable" | "failed";

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

/** expo-local-authentication 的錯誤碼 → 畫面要說的原因 */
export function classifyAuthError(error: string): AuthFailure {
  switch (error) {
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
    case "user_fallback":
      return "cancelled";
    case "lockout":
      return "lockout";
    case "not_enrolled":
    case "not_available":
    case "passcode_not_set":
      return "notAvailable";
    default:
      return "failed";
  }
}

/** 解鎖畫面上的說明 */
export function authFailureMessage(reason: AuthFailure): string {
  switch (reason) {
    case "cancelled":
      return "已取消驗證。按「解鎖」再試一次。";
    case "lockout":
      return "嘗試太多次，暫時被鎖住了。請稍候再試，或先用手機的螢幕鎖解開一次。";
    case "notAvailable":
      return "這支手機目前沒有設定指紋、臉部或螢幕鎖，無法驗證。";
    case "failed":
      return "驗證沒有成功，請再試一次。";
  }
}

/** 設定頁打開開關前的檢查：手機什麼都沒設定就不讓打開，說明原因 */
export function lockUnavailableMessage(level: DeviceAuthLevel): string | null {
  return level === "none"
    ? "這支手機還沒有設定螢幕鎖（PIN、圖形或密碼）或指紋、臉部，所以無法開啟。請先到手機的系統設定加上螢幕鎖。"
    : null;
}
