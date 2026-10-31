import * as LocalAuthentication from "expo-local-authentication";
import { classifyAuthError, type AuthResult, type DeviceAuthLevel } from "@/domain/appLock";

/**
 * expo-local-authentication 的薄包裝（Story 035）。網頁版用 biometrics.web.ts（不支援）。
 * 驗證時允許改用裝置密碼（disableDeviceFallback: false）：沒登錄指紋、或指紋一直失敗時，可以輸入 PIN／圖形解鎖。
 */
export const biometricsSupported = true;

export async function deviceAuthLevel(): Promise<DeviceAuthLevel> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG || level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK)
      return "biometric";
    if (level === LocalAuthentication.SecurityLevel.SECRET) return "passcode";
    return "none";
  } catch {
    return "none";
  }
}

export async function authenticate(promptMessage: string): Promise<AuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      promptSubtitle: "賺了嗎",
      cancelLabel: "取消",
      fallbackLabel: "使用裝置密碼",
      disableDeviceFallback: false,
    });
    return result.success ? { ok: true } : { ok: false, reason: classifyAuthError(result.error) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
