/**
 * 後端設定：全部從環境變數讀（npm start 會用 --env-file-if-exists 載入 backend/.env）。
 * 數字設定都有預設值與上限，填錯就用預設，不讓一個打錯字的設定變成無限制。
 */
export type InsightConfig = {
  /** Anthropic API key；空字串代表沒設，/insight 回 503 */
  apiKey: string;
  /** app 帶來的共享存取碼；空字串代表沒設，/insight 回 503（fail closed） */
  accessToken: string;
  port: number;
  host: string;
  /** 允許的網頁版來源；含 "*" 代表全部允許，"https://*.exp.direct" 代表該網域的所有子網域 */
  allowedOrigins: string[];
  rateLimitPerMinute: number;
  dailyLimit: number;
  maxBodyBytes: number;
  maxTokens: number;
  /** 同時最多幾個請求在等 Claude，超過回 429 */
  maxConcurrent: number;
  /** 走 tunnel 時才開：本機轉進來的連線改用 CF-Connecting-IP／X-Forwarded-For 當來源 IP */
  trustProxy: boolean;
};

/** max_tokens 的硬上限：設定值再大也不會超過，限制單次最壞花費 */
export const MAX_TOKENS_CEILING = 4096;

export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:8081", "http://127.0.0.1:8081"];

export function loadConfig(env: Record<string, string | undefined>): InsightConfig {
  return {
    apiKey: (env.ANTHROPIC_API_KEY ?? "").trim(),
    accessToken: (env.INSIGHT_ACCESS_TOKEN ?? "").trim(),
    port: intSetting(env.INSIGHT_PORT, 8787, 1, 65535),
    host: env.INSIGHT_HOST?.trim() || "0.0.0.0",
    allowedOrigins: env.INSIGHT_ALLOWED_ORIGINS
      ? env.INSIGHT_ALLOWED_ORIGINS.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean)
      : DEFAULT_ALLOWED_ORIGINS,
    rateLimitPerMinute: intSetting(env.INSIGHT_RATE_LIMIT_PER_MINUTE, 5, 1, 120),
    dailyLimit: intSetting(env.INSIGHT_DAILY_LIMIT, 100, 1, 10_000),
    maxBodyBytes: intSetting(env.INSIGHT_MAX_BODY_BYTES, 16_384, 1_024, 262_144),
    maxTokens: intSetting(env.INSIGHT_MAX_TOKENS, 2048, 512, MAX_TOKENS_CEILING),
    maxConcurrent: intSetting(env.INSIGHT_MAX_CONCURRENT, 3, 1, 20),
    trustProxy: env.INSIGHT_TRUST_PROXY === "1",
  };
}

function intSetting(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
