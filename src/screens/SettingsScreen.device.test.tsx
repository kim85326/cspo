import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Features } from "@/config/features";
import { DEVICE_PREFS_KEY, resetDevicePrefsForTest } from "@/data/devicePrefs";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import { ProStatusProvider } from "@/hooks/useProStatus";
import * as biometrics from "@/native/biometrics";
import * as notifications from "@/native/notifications";
import SettingsScreen from "./SettingsScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

jest.mock("@/native/notifications", () => ({
  notificationsSupported: true,
  getNotificationPermission: jest.fn(),
  requestNotificationPermission: jest.fn(),
  openNotificationSettings: jest.fn(async () => {}),
}));

jest.mock("@/native/biometrics", () => ({
  biometricsSupported: true,
  deviceAuthLevel: jest.fn(),
  authenticate: jest.fn(),
}));

const mockedNotifications = notifications as jest.Mocked<typeof notifications>;
const mockedBiometrics = biometrics as jest.Mocked<typeof biometrics>;

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

let features: Partial<Features> = {};

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDevicePrefsForTest();
  jest.clearAllMocks();
  features = { proPlan: false, notifications: true, biometricLock: true };
  mockedNotifications.getNotificationPermission.mockResolvedValue("undetermined");
  mockedNotifications.requestNotificationPermission.mockResolvedValue("granted");
  mockedBiometrics.deviceAuthLevel.mockResolvedValue("biometric");
  mockedBiometrics.authenticate.mockResolvedValue({ ok: true });
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <StaticFeatureFlags flags={features}>
        <ProStatusProvider>
          <SettingsScreen />
        </ProStatusProvider>
      </StaticFeatureFlags>
    </SafeAreaProvider>,
  );
}

async function storedPrefs() {
  return JSON.parse((await AsyncStorage.getItem(DEVICE_PREFS_KEY)) ?? "{}");
}

/** 等手機裡的設定讀完（開關變成可以按） */
async function switchReady(testID: string) {
  await waitFor(() => expect(screen.getByTestId(testID).props.disabled).toBe(false));
  return screen.getByTestId(testID);
}

describe("設定頁：通知（對應 docs/stories/034）", () => {
  test("功能開關關閉：沒有通知區塊", async () => {
    features.notifications = false;
    await renderScreen();
    expect(screen.queryByText("通知")).toBeNull();
    expect(screen.queryByLabelText("收盤損益")).toBeNull();
  });

  test("三個開關預設關閉，各自有說明", async () => {
    await renderScreen();
    for (const id of ["switch-notify-closeSummary", "switch-notify-dividendReminder", "switch-notify-dcaReminder"]) {
      expect((await switchReady(id)).props.value).toBe(false);
    }
    expect(screen.getByText(/19:00 提醒你打開看/)).toBeTruthy();
    expect(screen.getByText("持有的股票除息日前一天早上 9 點提醒。")).toBeTruthy();
    // 只是打開設定頁不會跳權限詢問
    expect(mockedNotifications.requestNotificationPermission).not.toHaveBeenCalled();
  });

  test("第一次打開：才跟系統要權限；允許後開關打開並存起來，其他開關不受影響", async () => {
    await renderScreen();
    await fireEvent(await switchReady("switch-notify-closeSummary"), "valueChange", true);
    expect(mockedNotifications.requestNotificationPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("switch-notify-closeSummary").props.value).toBe(true));
    expect(screen.getByTestId("switch-notify-dcaReminder").props.value).toBe(false);
    expect(await storedPrefs()).toMatchObject({ closeSummary: true, dcaReminder: false });
  });

  test("被拒絕：開關維持關閉，顯示「前往系統設定」", async () => {
    mockedNotifications.requestNotificationPermission.mockResolvedValue("blocked");
    await renderScreen();
    await fireEvent(await switchReady("switch-notify-dividendReminder"), "valueChange", true);
    expect(await screen.findByTestId("notification-permission-denied")).toBeTruthy();
    expect(screen.getByTestId("switch-notify-dividendReminder").props.value).toBe(false);
    expect((await storedPrefs()).dividendReminder).toBeUndefined();

    await fireEvent.press(screen.getByLabelText("前往系統設定"));
    expect(mockedNotifications.openNotificationSettings).toHaveBeenCalled();
  });

  test("開著但權限後來在系統設定被關掉：顯示提示，開關顯示關閉", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ dcaReminder: true }));
    mockedNotifications.getNotificationPermission.mockResolvedValue("blocked");
    await renderScreen();
    expect(await screen.findByTestId("notification-permission-denied")).toBeTruthy();
    expect(screen.getByTestId("switch-notify-dcaReminder").props.value).toBe(false);
  });

  test("關掉：不用問權限，直接存", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ dcaReminder: true }));
    mockedNotifications.getNotificationPermission.mockResolvedValue("granted");
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId("switch-notify-dcaReminder").props.value).toBe(true));
    await fireEvent(screen.getByTestId("switch-notify-dcaReminder"), "valueChange", false);
    await waitFor(() => expect(screen.getByTestId("switch-notify-dcaReminder").props.value).toBe(false));
    expect(mockedNotifications.requestNotificationPermission).not.toHaveBeenCalled();
    expect((await storedPrefs()).dcaReminder).toBe(false);
  });
});

describe("設定頁：打開 app 時要驗證（對應 docs/stories/035）", () => {
  test("功能開關關閉：沒有這個開關", async () => {
    features.biometricLock = false;
    await renderScreen();
    expect(screen.queryByLabelText("打開 app 時要驗證")).toBeNull();
  });

  test("預設關閉；打開時先驗證一次，成功才打開並存起來", async () => {
    await renderScreen();
    const toggle = await switchReady("switch-app-lock");
    expect(toggle.props.value).toBe(false);
    await fireEvent(toggle, "valueChange", true);
    expect(mockedBiometrics.authenticate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("switch-app-lock").props.value).toBe(true));
    expect((await storedPrefs()).biometricLock).toBe(true);
  });

  test("手機沒有設定任何螢幕鎖：不能打開，說明原因", async () => {
    mockedBiometrics.deviceAuthLevel.mockResolvedValue("none");
    await renderScreen();
    await fireEvent(await switchReady("switch-app-lock"), "valueChange", true);
    expect(await screen.findByText(/還沒有設定螢幕鎖/)).toBeTruthy();
    expect(mockedBiometrics.authenticate).not.toHaveBeenCalled();
    expect(screen.getByTestId("switch-app-lock").props.value).toBe(false);
  });

  test("只有裝置密碼、沒有指紋也可以打開", async () => {
    mockedBiometrics.deviceAuthLevel.mockResolvedValue("passcode");
    await renderScreen();
    await fireEvent(await switchReady("switch-app-lock"), "valueChange", true);
    await waitFor(() => expect(screen.getByTestId("switch-app-lock").props.value).toBe(true));
  });

  test("驗證被取消：維持關閉，提示可以再試", async () => {
    mockedBiometrics.authenticate.mockResolvedValue({ ok: false, reason: "cancelled" });
    await renderScreen();
    await fireEvent(await switchReady("switch-app-lock"), "valueChange", true);
    expect(await screen.findByText(/已取消驗證/)).toBeTruthy();
    expect(screen.getByTestId("switch-app-lock").props.value).toBe(false);
  });

  test("關掉不用驗證", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: true }));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId("switch-app-lock").props.value).toBe(true));
    await fireEvent(screen.getByTestId("switch-app-lock"), "valueChange", false);
    await waitFor(() => expect(screen.getByTestId("switch-app-lock").props.value).toBe(false));
    expect(mockedBiometrics.authenticate).not.toHaveBeenCalled();
  });
});
