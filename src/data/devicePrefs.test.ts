import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_DEVICE_PREFS,
  DEVICE_PREFS_KEY,
  getDevicePrefsSnapshot,
  getLaunchDevicePrefsSnapshot,
  loadDevicePrefs,
  parseDevicePrefs,
  resetDevicePrefsForTest,
  subscribeDevicePrefs,
  updateDevicePrefs,
} from "./devicePrefs";

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDevicePrefsForTest();
});

describe("手機端開關（對應 docs/stories/034、035）", () => {
  test("預設全部關閉", async () => {
    expect(DEFAULT_DEVICE_PREFS).toEqual({
      closeSummary: false,
      dividendReminder: false,
      dcaReminder: false,
      biometricLock: false,
    });
    expect(await loadDevicePrefs()).toEqual(DEFAULT_DEVICE_PREFS);
  });

  test("格式不對：只用認得的 true／false，其他當預設", () => {
    expect(parseDevicePrefs({ closeSummary: true, dcaReminder: "1", extra: true })).toEqual({
      ...DEFAULT_DEVICE_PREFS,
      closeSummary: true,
    });
    expect(parseDevicePrefs("on")).toEqual(DEFAULT_DEVICE_PREFS);
  });

  test("壞掉的 JSON：當預設", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, "{oops");
    expect(await loadDevicePrefs()).toEqual(DEFAULT_DEVICE_PREFS);
  });

  test("改了會存回手機、通知訂閱的人；啟動時的值不跟著變", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ biometricLock: false }));
    const listener = jest.fn();
    subscribeDevicePrefs(listener);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getDevicePrefsSnapshot()).toEqual(DEFAULT_DEVICE_PREFS);

    await updateDevicePrefs({ biometricLock: true, dcaReminder: true });
    expect(getDevicePrefsSnapshot()).toMatchObject({ biometricLock: true, dcaReminder: true });
    expect(getLaunchDevicePrefsSnapshot()).toEqual(DEFAULT_DEVICE_PREFS);
    expect(listener).toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(DEVICE_PREFS_KEY))!)).toMatchObject({ biometricLock: true });
  });

  test("還沒有人訂閱就先改：啟動時的值是改之前讀到的", async () => {
    await updateDevicePrefs({ closeSummary: true });
    expect(getLaunchDevicePrefsSnapshot()).toEqual(DEFAULT_DEVICE_PREFS);
    expect(getDevicePrefsSnapshot()).toMatchObject({ closeSummary: true });
  });
});
