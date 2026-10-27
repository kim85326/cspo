import {
  buildLabelOf,
  describeVersion,
  formatFullTime,
  formatShortTime,
  type RawVersionSources,
} from "./versionInfo";

// 時間用當地時間建構，測試結果不受機器時區影響
const OTA_TIME = new Date(2026, 9, 27, 16, 5);

/** 安裝 build 4 APK、跑內建 JS 的原始值；各情境只改需要的欄位 */
const APK_EMBEDDED: RawVersionSources = {
  platform: "android",
  isDev: false,
  executionEnvironment: "standalone",
  configVersion: "1.0.0",
  nativeAppVersion: "1.0.0",
  nativeBuildVersion: "4",
  updatesEnabled: true,
  isEmbeddedLaunch: true,
  updateId: "0f8e1c2a-1111-2222-3333-444455556666",
  updateCreatedAt: new Date(2026, 9, 27, 9, 0),
  runtimeVersion: "a1b2c3d4e5",
  channel: "preview",
  otaMessage: null,
};

const APK_OTA: RawVersionSources = {
  ...APK_EMBEDDED,
  isEmbeddedLaunch: false,
  updateId: "9c3f7b1e-aaaa-bbbb-cccc-ddddeeeeffff",
  updateCreatedAt: OTA_TIME,
  otaMessage: "修正比較卡排序",
};

const EXPO_GO: RawVersionSources = {
  platform: "ios",
  isDev: true,
  executionEnvironment: "storeClient",
  configVersion: "1.0.0",
  // Expo Go 自己的版本，不能拿來當 app 版本
  nativeAppVersion: "58.0.2",
  nativeBuildVersion: "312",
  updatesEnabled: false,
  isEmbeddedLaunch: false,
  updateId: null,
  updateCreatedAt: null,
  runtimeVersion: null,
  channel: null,
  otaMessage: null,
};

const WEB_DEV: RawVersionSources = {
  ...EXPO_GO,
  platform: "web",
  executionEnvironment: "bare",
  nativeAppVersion: null,
  nativeBuildVersion: null,
  // expo-updates 的網頁版 stub：isEnabled 是 true、isEmbeddedLaunch 是 false
  updatesEnabled: true,
};

const detail = (raw: RawVersionSources, label: string) =>
  describeVersion(raw).details.find((d) => d.label === label)?.value;

describe("describeVersion（對應 docs/stories/018）", () => {
  test("APK 內建版本：顯示 app 版本與 build N，沒有 OTA", () => {
    const info = describeVersion(APK_EMBEDDED);
    expect(info.runtime).toBe("apk");
    expect(info.summary).toBe("v1.0.0 · build 4");
    expect(detail(APK_EMBEDDED, "程式來源")).toBe("APK 內建版本");
    expect(detail(APK_EMBEDDED, "APK build")).toBe("build 4（versionCode 4）");
    expect(detail(APK_EMBEDDED, "OTA 時間")).toBeUndefined();
    expect(detail(APK_EMBEDDED, "Channel")).toBe("preview");
  });

  test("APK + OTA：一行小字帶 OTA 時間，詳細資訊有說明與完整 update ID", () => {
    const info = describeVersion(APK_OTA);
    expect(info.summary).toBe("v1.0.0 · build 4 · OTA 10/27 16:05");
    expect(detail(APK_OTA, "程式來源")).toBe("OTA 更新");
    expect(detail(APK_OTA, "OTA 時間")).toBe("2026/10/27 16:05");
    expect(detail(APK_OTA, "OTA 說明")).toBe("修正比較卡排序");
    expect(detail(APK_OTA, "Update ID")).toBe("9c3f7b1e-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(detail(APK_OTA, "Runtime version")).toBe("a1b2c3d4e5");
  });

  test("OTA 沒帶說明（例如不是用 npm run ota 發的）：改顯示 update ID 前 8 碼", () => {
    expect(detail({ ...APK_OTA, otaMessage: null }, "OTA 說明")).toBe("更新 9c3f7b1e");
    expect(detail({ ...APK_OTA, otaMessage: "  " }, "OTA 說明")).toBe("更新 9c3f7b1e");
  });

  test("OTA 帶來的 app.json 版本比安裝檔新時，以安裝檔為準", () => {
    expect(describeVersion({ ...APK_OTA, configVersion: "1.1.0" }).summary).toMatch(/^v1\.0\.0 · /);
  });

  test("Expo Go：標示開發版，不顯示 Expo Go 自己的版本與 build", () => {
    const info = describeVersion(EXPO_GO);
    expect(info.runtime).toBe("expo-go");
    expect(info.summary).toBe("開發版（Expo Go） · v1.0.0");
    expect(detail(EXPO_GO, "執行環境")).toBe("Expo Go（開發版）");
    expect(detail(EXPO_GO, "程式來源")).toBe("開發伺服器（dev server）");
    expect(detail(EXPO_GO, "APK build")).toBeUndefined();
    expect(detail(EXPO_GO, "Update ID")).toBeUndefined();
  });

  test("網頁版 dev server：標示開發版，不會誤判成 OTA", () => {
    const info = describeVersion(WEB_DEV);
    expect(info.runtime).toBe("web");
    expect(info.summary).toBe("開發版（網頁版） · v1.0.0");
    expect(info.summary).not.toContain("OTA");
  });

  test("網頁版正式部署（非 dev）：標示網頁版", () => {
    expect(describeVersion({ ...WEB_DEV, isDev: false }).summary).toBe("網頁版 · v1.0.0");
  });

  test("舊版 APK（build 1～3 的 versionCode 都是 1）：顯示 build 1～3", () => {
    const legacy = { ...APK_OTA, nativeBuildVersion: "1" };
    expect(describeVersion(legacy).summary).toBe("v1.0.0 · build 1～3 · OTA 10/27 16:05");
  });

  test("拿不到 versionCode 與版本名稱：顯示未知，不會壞掉", () => {
    const unknown = { ...APK_EMBEDDED, nativeBuildVersion: null, nativeAppVersion: null, configVersion: null };
    expect(describeVersion(unknown).summary).toBe("v未知 · build 未知");
  });

  test("複製的文字：第一行是摘要，後面每行一個欄位", () => {
    const lines = describeVersion(APK_OTA).copyText.split("\n");
    expect(lines[0]).toBe("賺了嗎 v1.0.0 · build 4 · OTA 10/27 16:05");
    expect(lines).toContain("OTA 說明：修正比較卡排序");
    expect(lines).toContain("Update ID：9c3f7b1e-aaaa-bbbb-cccc-ddddeeeeffff");
  });
});

describe("buildLabelOf", () => {
  test("versionCode 4 以上就是 build N", () => {
    expect(buildLabelOf("4")).toBe("build 4");
    expect(buildLabelOf("12")).toBe("build 12");
  });

  test("1～3 是舊規則、空值或亂碼是未知", () => {
    expect(buildLabelOf("1")).toBe("build 1～3");
    expect(buildLabelOf(null)).toBe("build 未知");
    expect(buildLabelOf("abc")).toBe("build 未知");
  });
});

describe("時間格式", () => {
  test("補零", () => {
    const t = new Date(2026, 0, 5, 7, 3);
    expect(formatShortTime(t)).toBe("01/05 07:03");
    expect(formatFullTime(t)).toBe("2026/01/05 07:03");
  });
});
