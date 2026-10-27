import type { InsightInput } from "@/domain/insightInput";
import { insightBaseUrl } from "./insightEndpoint";
import { InsightError, type Insight, type InsightProvider } from "./InsightProvider";

export const NOT_CONFIGURED_MESSAGE =
  "還沒設定 AI 解讀服務的網址：請在 .env.local 設定 EXPO_PUBLIC_INSIGHT_API_URL 後重新載入 app";
export const NETWORK_ERROR_MESSAGE =
  "連不上 AI 解讀服務：請確認電腦上已執行 npm run backend，且手機連得到這台電腦";
export const TIMEOUT_MESSAGE = "AI 解讀等太久沒有回應，請重試";
const TIMEOUT_MS = 60_000;

/**
 * 打工程同學電腦上的 AI 解讀後端（backend/，見 docs/architecture.md 第 7 節）。
 * Anthropic API key 只放在那台電腦的 backend/.env，app 裡沒有。
 *
 * 存取碼 EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN：EXPO_PUBLIC_ 變數會被打包進 app，拆包就看得到，
 * 所以它**不是秘密**，只是擋掉隨手亂打網址的路人。真正的保護是 key 不離開電腦、後端的頻率與每日上限、
 * 以及 Anthropic Console 的每月花費上限。
 */
export function createBackendInsightProvider(
  fetchFn: typeof fetch = (...args) => fetch(...args),
  baseUrl: () => string | null = () => insightBaseUrl(),
  accessToken: () => string = () => process.env.EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN ?? "",
): InsightProvider {
  return {
    async getInsight(input: InsightInput): Promise<Insight> {
      const base = baseUrl();
      if (!base) throw new InsightError(NOT_CONFIGURED_MESSAGE);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchFn(`${base}/insight`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken()}` },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
      } catch {
        throw new InsightError(controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE);
      } finally {
        clearTimeout(timer);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) throw new InsightError(errorMessage(response.status, body));
      return parseInsight(body);
    },
  };
}

/** 後端有回中文 error 就照用；沒有（例如 tunnel 自己回的 429／502）就依狀態碼給一句 */
function errorMessage(status: number, body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error !== "") return error;
  if (status === 429) return "AI 解讀使用太頻繁，請稍候一分鐘再試";
  if (status === 401) return "AI 解讀存取碼不正確，請確認 app 與後端的設定一致";
  if (status === 503) return "AI 解讀後端還沒設定好，請確認 backend/.env";
  return `AI 解讀服務錯誤（${status}），請重試`;
}

/** 後端回應 → Insight；欄位缺漏就當成錯誤，不讓畫面顯示半套內容 */
export function parseInsight(body: unknown): Insight {
  const value = (body ?? {}) as Record<string, unknown>;
  const observations = Array.isArray(value.observations)
    ? value.observations.filter((o): o is string => typeof o === "string" && o !== "")
    : [];
  if (typeof value.summary !== "string" || value.summary === "" || observations.length === 0) {
    throw new InsightError("AI 解讀的回應格式不正確，請重試");
  }
  return {
    summary: value.summary,
    observations,
    riskNote: typeof value.riskNote === "string" ? value.riskNote : "",
    disclaimer: typeof value.disclaimer === "string" && value.disclaimer !== ""
      ? value.disclaimer
      : "僅為數據解讀，不構成投資建議",
    filtered: value.filtered === true,
  };
}

export const backendInsightProvider: InsightProvider = createBackendInsightProvider();
