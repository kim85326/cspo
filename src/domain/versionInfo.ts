/**
 * App 底部的版本資訊（Story 032）：把各來源的原始值整理成要顯示的文字。
 * 純函式，不碰 expo 模組；原始值由 src/data/appVersionSource.ts 讀出來。
 *
 * 版本號規則見 docs/architecture.md 第 7 節「版本號規則」：
 * - APK 的 Android versionCode 就是下載頁的「build N」（eas.json preview profile 開了 autoIncrement）。
 * - build 1～3 打包時還沒有這個規則，versionCode 都是 1，所以只能顯示「build 1～3」。
 */

/** 從 expo-constants、expo-application、expo-updates 與打包時的環境變數讀到的原始值 */
export type RawVersionSources = {
  /** Platform.OS */
  platform: string;
  /** __DEV__：dev server 跑的都是 true */
  isDev: boolean;
  /** Constants.executionEnvironment："standalone"（APK）、"storeClient"（Expo Go）、"bare"（網頁版也是這個） */
  executionEnvironment: string | null;
  /** app.json 的 version（Constants.expoConfig.version）；OTA 時是發佈當下的值 */
  configVersion: string | null;
  /** 安裝檔裡的版本名稱（Application.nativeApplicationVersion）；網頁版是 null */
  nativeAppVersion: string | null;
  /** 安裝檔裡的 versionCode（Application.nativeBuildVersion）；網頁版是 null，Expo Go 是 Expo Go 自己的 */
  nativeBuildVersion: string | null;
  updatesEnabled: boolean;
  /** true = 跑的是 APK 內建的 JS；false = 跑的是下載下來的 OTA 更新 */
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  /** 正在跑的那份 JS 的建立時間（OTA 就是發佈時間） */
  updateCreatedAt: Date | null;
  runtimeVersion: string | null;
  channel: string | null;
  /** `npm run ota -- "說明"` 的說明，發佈時寫進 bundle（EXPO_PUBLIC_OTA_MESSAGE）；APK 內建的 JS 沒有 */
  otaMessage: string | null;
};

export type RuntimeKind = "apk" | "expo-go" | "web";

export type VersionDetail = { label: string; value: string };

export type VersionInfo = {
  runtime: RuntimeKind;
  /** 底部那一行小字，例如「v1.0.0 · build 4 · OTA 10/27 16:05」 */
  summary: string;
  /** 點開後的完整資訊 */
  details: VersionDetail[];
  /** 「複製版本資訊」貼出去的文字 */
  copyText: string;
};

/** build 1～3 的 versionCode 都是 1；build 4 起 versionCode = build N */
export const LEGACY_BUILD_MAX = 3;

const RUNTIME_LABEL: Record<RuntimeKind, string> = {
  apk: "APK",
  "expo-go": "Expo Go",
  web: "網頁版",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 10/27 16:05（手機當地時間） */
export function formatShortTime(date: Date): string {
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 2026/10/27 16:05（手機當地時間） */
export function formatFullTime(date: Date): string {
  return `${date.getFullYear()}/${formatShortTime(date)}`;
}

export function runtimeKindOf(raw: Pick<RawVersionSources, "platform" | "executionEnvironment">): RuntimeKind {
  if (raw.platform === "web") return "web";
  if (raw.executionEnvironment === "storeClient") return "expo-go";
  return "apk";
}

/** versionCode → 下載頁的名稱（build N）；舊規則打的回傳「build 1～3」，拿不到回傳「build 未知」 */
export function buildLabelOf(nativeBuildVersion: string | null): string {
  const code = Number(nativeBuildVersion);
  if (!nativeBuildVersion || !Number.isInteger(code) || code <= 0) return "build 未知";
  if (code <= LEGACY_BUILD_MAX) return "build 1～3";
  return `build ${code}`;
}

const blank = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function describeVersion(raw: RawVersionSources): VersionInfo {
  const runtime = runtimeKindOf(raw);
  const isApk = runtime === "apk";
  // APK 以安裝檔為準（OTA 帶來的 app.json 可能比安裝檔新）；Expo Go 的安裝檔版本是 Expo Go 自己的，不能用
  const version = (isApk ? blank(raw.nativeAppVersion) : null) ?? blank(raw.configVersion) ?? "未知";
  const buildLabel = isApk ? buildLabelOf(raw.nativeBuildVersion) : null;
  const isOta = isApk && !raw.isDev && raw.updatesEnabled && !raw.isEmbeddedLaunch;
  const shortId = raw.updateId ? raw.updateId.slice(0, 8) : null;
  const otaNote = blank(raw.otaMessage) ?? (shortId ? `更新 ${shortId}` : "（沒有說明）");

  const parts: string[] = [];
  if (raw.isDev) parts.push(`開發版（${RUNTIME_LABEL[runtime]}）`);
  else if (runtime !== "apk") parts.push(RUNTIME_LABEL[runtime]);
  parts.push(`v${version}`);
  if (buildLabel) parts.push(buildLabel);
  if (isOta) parts.push(raw.updateCreatedAt ? `OTA ${formatShortTime(raw.updateCreatedAt)}` : "OTA");
  const summary = parts.join(" · ");

  const source = raw.isDev
    ? "開發伺服器（dev server）"
    : runtime === "web"
      ? "網頁"
      : isOta
        ? "OTA 更新"
        : "APK 內建版本";

  const details: VersionDetail[] = [
    { label: "執行環境", value: raw.isDev ? `${RUNTIME_LABEL[runtime]}（開發版）` : RUNTIME_LABEL[runtime] },
    { label: "平台", value: raw.platform },
    { label: "App 版本", value: version },
  ];
  if (buildLabel) {
    details.push({ label: "APK build", value: `${buildLabel}（versionCode ${raw.nativeBuildVersion ?? "未知"}）` });
  }
  details.push({ label: "程式來源", value: source });
  if (isOta) {
    details.push({
      label: "OTA 時間",
      value: raw.updateCreatedAt ? formatFullTime(raw.updateCreatedAt) : "未知",
    });
    details.push({ label: "OTA 說明", value: otaNote });
  }
  if (isApk) {
    details.push({ label: "Runtime version", value: blank(raw.runtimeVersion) ?? "—" });
    details.push({ label: "Channel", value: blank(raw.channel) ?? "—" });
    details.push({ label: "Update ID", value: raw.updateId ?? "—" });
  }

  const copyText = [`賺了嗎 ${summary}`, ...details.map((d) => `${d.label}：${d.value}`)].join("\n");
  return { runtime, summary, details, copyText };
}
