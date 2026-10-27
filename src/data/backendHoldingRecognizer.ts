import { parseExtractionResult } from "@/domain/holdingExtract";
import { RecognizeError, type HoldingRecognizer } from "./HoldingRecognizer";
import { insightBaseUrl } from "./insightEndpoint";

export const NOT_CONFIGURED_MESSAGE =
  "還沒設定辨識服務的網址：請在 .env.local 設定 EXPO_PUBLIC_INSIGHT_API_URL 後重新載入 app";
export const NETWORK_ERROR_MESSAGE =
  "連不上辨識服務：提供服務的電腦可能還沒開（npm run backend:tunnel），請稍後再試";
export const TIMEOUT_MESSAGE = "辨識等太久沒有回應，請重試";
/** 後端呼叫 Claude 的 timeout 是 60 秒；這裡多等一點，讓後端的中文錯誤先回來 */
const TIMEOUT_MS = 75_000;

/**
 * 用 Claude 辨識持股截圖：打工程同學電腦上的後端 backend/ 的 POST /recognize（docs/architecture.md 第 7 節）。
 * 和 AI 解讀（backendInsightProvider）共用同一台後端、同一個網址（EXPO_PUBLIC_INSIGHT_API_URL）
 * 與存取碼（EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN）。Anthropic API key 只在那台電腦的 backend/.env，app 裡沒有。
 * 真正的 prompt 與 JSON schema 在 backend/src/claudeRecognize.ts；圖片格式由後端看檔頭判斷。
 */
export function createBackendHoldingRecognizer(
  fetchFn: typeof fetch = (...args) => fetch(...args),
  baseUrl: () => string | null = () => insightBaseUrl(),
  accessToken: () => string = () => process.env.EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN ?? "",
): HoldingRecognizer {
  return {
    async recognize(imageBase64, mimeType) {
      const base = baseUrl();
      if (!base) throw new RecognizeError(NOT_CONFIGURED_MESSAGE);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchFn(`${base}/recognize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken()}`,
            // 後端走 ngrok 免費網域時，沒帶這個 header 的瀏覽器請求會拿到 ngrok 的提示頁而不是 JSON
            "ngrok-skip-browser-warning": "1",
          },
          body: JSON.stringify({ imageBase64, mimeType }),
          signal: controller.signal,
        });
      } catch {
        throw new RecognizeError(controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE);
      } finally {
        clearTimeout(timer);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) throw new RecognizeError(errorMessage(response.status, body));
      return parseExtractionResult(body);
    },
  };
}

/** 後端有回中文 error 就照用；沒有（例如 tunnel 自己回的 429／502）就依狀態碼給一句 */
function errorMessage(status: number, body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error !== "") return error;
  if (status === 429) return "辨識使用太頻繁，請稍候一分鐘再試";
  if (status === 413) return "圖片太大，請裁切後再試";
  if (status === 401) return "辨識服務存取碼不正確，請確認 app 與後端的設定一致";
  if (status === 503) return "辨識服務的後端還沒設定好，請確認 backend/.env";
  return `辨識服務回應錯誤（${status}）`;
}

export const backendHoldingRecognizer: HoldingRecognizer = createBackendHoldingRecognizer();
