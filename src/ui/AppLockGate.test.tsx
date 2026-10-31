import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { DEVICE_PREFS_KEY, resetDevicePrefsForTest, updateDevicePrefs } from "@/data/devicePrefs";
import type { AuthResult, DeviceAuthLevel } from "@/domain/appLock";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import { AppLockGate } from "./AppLockGate";

jest.mock("@/native/biometrics", () => ({
  biometricsSupported: true,
  deviceAuthLevel: jest.fn(),
  authenticate: jest.fn(),
}));

let appStateListeners: ((state: AppStateStatus) => void)[] = [];
let clock = 0;
let level: jest.Mock<Promise<DeviceAuthLevel>, []>;
let auth: jest.Mock<Promise<AuthResult>, [string]>;

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDevicePrefsForTest();
  appStateListeners = [];
  clock = 1_000_000;
  level = jest.fn(async () => "biometric" as DeviceAuthLevel);
  auth = jest.fn(async (_prompt: string) => ({ ok: true }) as AuthResult);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderGate(biometricLock = true) {
  await render(
    <StaticFeatureFlags flags={{ biometricLock }}>
      <AppLockGate deviceAuthLevel={level} authenticate={auth} now={() => clock} />
    </StaticFeatureFlags>,
  );
}

async function sendAppState(state: AppStateStatus) {
  await act(async () => appStateListeners.forEach((listener) => listener(state)));
}

describe("打開 app 時要驗證（對應 docs/stories/035）", () => {
  test("功能開關關閉：就算設定開著也不鎖", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    await renderGate(false);
    expect(screen.queryByTestId("app-lock")).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });

  test("設定沒開（預設）：讀完設定就不擋", async () => {
    await renderGate();
    await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    expect(auth).not.toHaveBeenCalled();
  });

  test("設定開著：啟動時鎖住並自動跳出驗證，成功就解開", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    let resolve: (r: AuthResult) => void = () => {};
    auth.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await renderGate();
    expect(await screen.findByText("賺了嗎已上鎖")).toBeTruthy();
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));
    await act(async () => resolve({ ok: true }));
    await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
  });

  test("驗證失敗：留在鎖定畫面顯示原因，按「解鎖」重試", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    auth.mockResolvedValueOnce({ ok: false, reason: "failed" });
    await renderGate();
    expect(await screen.findByText("驗證沒有成功，請再試一次。")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("button-unlock"));
    await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    expect(auth).toHaveBeenCalledTimes(2);
  });

  test("嘗試太多次被系統鎖住：說明要稍候", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    auth.mockResolvedValueOnce({ ok: false, reason: "lockout" });
    await renderGate();
    expect(await screen.findByText(/嘗試太多次/)).toBeTruthy();
  });

  test("手機的螢幕鎖後來被拿掉：說明無法驗證，可以繼續使用", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    level.mockResolvedValue("none");
    await renderGate();
    expect(await screen.findByText(/沒有設定指紋、臉部或螢幕鎖/)).toBeTruthy();
    expect(auth).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("button-lock-continue"));
    await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
  });

  test("切到背景超過 1 分鐘再回來：重新上鎖；未滿 1 分鐘不用", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    await renderGate();
    await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    expect(auth).toHaveBeenCalledTimes(1);

    await sendAppState("background");
    clock += 59_000;
    await sendAppState("active");
    expect(screen.queryByTestId("app-lock")).toBeNull();
    expect(auth).toHaveBeenCalledTimes(1);

    auth.mockImplementationOnce(() => new Promise(() => {}));
    await sendAppState("background");
    clock += 60_000;
    await sendAppState("active");
    expect(await screen.findByText("賺了嗎已上鎖")).toBeTruthy();
    expect(auth).toHaveBeenCalledTimes(2);
  });

  test("在設定頁剛打開開關：不會立刻鎖住", async () => {
    await renderGate();
    await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    await act(async () => {
      await updateDevicePrefs({ biometricLock: true });
    });
    expect(screen.queryByTestId("app-lock")).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });
});
