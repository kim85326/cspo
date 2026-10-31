import { authFailureMessage, classifyAuthError, lockUnavailableMessage, RELOCK_AFTER_MS, shouldRelock } from "./appLock";

describe("從背景回來要不要重新驗證（Story 035）", () => {
  test("沒切到背景過：不用", () => {
    expect(shouldRelock(null, 10_000_000)).toBe(false);
  });

  test("未滿 1 分鐘不用，滿 1 分鐘（含剛好）要", () => {
    expect(RELOCK_AFTER_MS).toBe(60_000);
    expect(shouldRelock(1_000, 1_000 + 59_999)).toBe(false);
    expect(shouldRelock(1_000, 1_000 + 60_000)).toBe(true);
    expect(shouldRelock(1_000, 1_000 + 3_600_000)).toBe(true);
  });
});

describe("驗證錯誤碼歸類", () => {
  test.each([
    ["user_cancel", "cancelled"],
    ["system_cancel", "cancelled"],
    ["app_cancel", "cancelled"],
    ["user_fallback", "cancelled"],
    ["lockout", "lockout"],
    ["not_enrolled", "notAvailable"],
    ["not_available", "notAvailable"],
    ["passcode_not_set", "notAvailable"],
    ["authentication_failed", "failed"],
    ["timeout", "failed"],
    ["something_new", "failed"],
  ])("%s → %s", (code, reason) => {
    expect(classifyAuthError(code)).toBe(reason);
  });

  test("每種原因都有說明", () => {
    for (const reason of ["cancelled", "lockout", "notAvailable", "failed"] as const) {
      expect(authFailureMessage(reason).length).toBeGreaterThan(0);
    }
  });
});

test("手機沒有任何螢幕鎖：不能開啟，說明原因", () => {
  expect(lockUnavailableMessage("none")).toContain("螢幕鎖");
  expect(lockUnavailableMessage("passcode")).toBeNull();
  expect(lockUnavailableMessage("biometric")).toBeNull();
});
