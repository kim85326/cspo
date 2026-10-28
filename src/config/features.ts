/**
 * 功能開關（feature toggle）。開發中、還不能給測試同學用的功能放這裡，預設關閉。
 * 對應 docs/stories/033-remote-feature-flags.md。
 *
 * 畫面不要直接 import 這裡的值，一律用 `useFeatures()`（src/hooks/useFeatures.tsx）：
 * 遠端設定更新時畫面才會跟著重新 render。
 *
 * 每個開關的值，由高到低：
 *   1. 開發時（__DEV__）`.env.local` 有設的 EXPO_PUBLIC_FEATURE_*：工程師自己測，蓋過遠端
 *   2. 遠端設定（GitHub 上 feature-flags 分支的 JSON，見 REMOTE_FLAGS_URL）
 *   3. 上次抓到、存在手機裡的遠端設定
 *   4. 打包時的 EXPO_PUBLIC_FEATURE_*（EAS 打包沒設，所以 APK 預設一律關閉）
 *
 * 開關只控制「畫面看不看得到」，不是保護：repo 是公開的，任何人都能讀這份 JSON 或自己改 app。
 *
 * EXPO_PUBLIC_ 變數會在打包時被 Expo CLI 直接換成字串，所以必須整個寫死 `process.env.EXPO_PUBLIC_…`，
 * 不能用變數或解構拿。
 */

/** 認得的開關名稱。新增開關時，scripts/feature-flags.mjs 的 FEATURE_NAMES 也要加（有測試比對）。 */
export const FEATURE_NAMES = ["screenshotImport", "aiInsight", "proPlan"] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Record<FeatureName, boolean>;

/**
 * 遠端設定的位置：GitHub repo kim85326/cspo 的 feature-flags 分支（只放這一個檔，不碰 iteration-1）。
 * 用 `node scripts/feature-flags.mjs set <名稱> on|off` 改。raw.githubusercontent.com 有 CDN 快取，改完最多 5 分鐘才看得到。
 */
export const REMOTE_FLAGS_URL = "https://raw.githubusercontent.com/kim85326/cspo/feature-flags/feature-flags.json";

/** 打包時的環境變數原始值（沒設是 undefined）。 */
const buildEnv: Record<FeatureName, string | undefined> = {
  /** Story 005：從券商截圖匯入持股。APK 版連不到辨識服務，上線方式見 docs/research/screenshot-import.md */
  screenshotImport: process.env.EXPO_PUBLIC_FEATURE_SCREENSHOT_IMPORT,
  /**
   * Story 031：算完盈虧後的「AI 解讀」按鈕。要搭配電腦上的 backend/（npm run backend），
   * 設定與連線方式見 docs/architecture.md 第 7 節「AI 解讀後端」。
   */
  aiInsight: process.env.EXPO_PUBLIC_FEATURE_AI_INSIGHT,
  /** Story 020：Free／Pro 鎖定畫面（只做畫面，不串金流）。關閉時設定頁沒有 Pro 區塊，/pro 直接導回首頁。 */
  proPlan: process.env.EXPO_PUBLIC_FEATURE_PRO_PLAN,
};

function fromEnv(read: (name: FeatureName) => boolean | undefined): Partial<Features> {
  const result: Partial<Features> = {};
  for (const name of FEATURE_NAMES) {
    const value = read(name);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

/** 打包時的預設值：只有 "1" 是開。 */
export const defaultFeatures: Features = { ...allOff(), ...fromEnv((name) => buildEnv[name] === "1") };

/**
 * 開發時 `.env.local` 明確設了 "1" 或 "0" 的開關，會蓋過遠端。
 * 只在 __DEV__ 生效：APK／OTA 一律聽遠端（npm run ota 也會擋下開著的 EXPO_PUBLIC_*=1）。
 */
export const localOverrides: Partial<Features> = __DEV__
  ? fromEnv((name) => (buildEnv[name] === "1" ? true : buildEnv[name] === "0" ? false : undefined))
  : {};

function allOff(): Features {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, false])) as Features;
}

/**
 * 把遠端（或手機裡存的）JSON 轉成開關。只接受認得的名稱、而且值是 true／false，其他一律忽略；
 * 整份不是物件就回 null，呼叫的人當作「這次沒拿到」。
 */
export function parseFlags(json: unknown): Partial<Features> | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const record = json as Record<string, unknown>;
  const result: Partial<Features> = {};
  for (const name of FEATURE_NAMES) {
    const value = record[name];
    if (typeof value === "boolean") result[name] = value;
  }
  return result;
}

/** 依優先順序算出最後的開關值（見檔頭）。remote 為 null 代表這次沒拿到，改用手機裡存的。 */
export function resolveFeatures(sources: {
  remote?: Partial<Features> | null;
  stored?: Partial<Features> | null;
  defaults?: Features;
  overrides?: Partial<Features>;
}): Features {
  const { remote, stored, defaults = defaultFeatures, overrides = localOverrides } = sources;
  return { ...defaults, ...(remote ?? stored ?? {}), ...overrides };
}
