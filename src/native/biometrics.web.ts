import type { AuthResult, DeviceAuthLevel } from "@/domain/appLock";

/** 網頁版不支援「打開 app 時要驗證」（Story 035）：設定頁不顯示開關，解鎖畫面也不會出現 */
export const biometricsSupported = false;

export async function deviceAuthLevel(): Promise<DeviceAuthLevel> {
  return "none";
}

export async function authenticate(_promptMessage: string): Promise<AuthResult> {
  return { ok: true };
}
