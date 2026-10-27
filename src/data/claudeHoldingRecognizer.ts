import { parseExtractionResult } from "@/domain/holdingExtract";
import { RecognizeError, type HoldingRecognizer } from "./HoldingRecognizer";
import { recognizeUrl } from "./recognizeEndpoint";

export const NETWORK_ERROR_MESSAGE = "連不上辨識服務，請確認手機與電腦在同一個 dev server 後重試";

/**
 * 用 Claude 辨識持股截圖。
 * API key 不能放進 app（EXPO_PUBLIC_ 變數會被打包進去），所以手機端只把圖片 POST 到 dev server 的
 * API route（src/app/recognize+api.ts），由伺服器端讀 ANTHROPIC_API_KEY 呼叫 Claude；
 * 真正的 prompt 與 JSON schema 在 src/server/recognizeHoldings.ts。
 */
export function createClaudeHoldingRecognizer(
  fetchFn: typeof fetch = (...args) => fetch(...args),
  url: () => string = recognizeUrl,
): HoldingRecognizer {
  return {
    async recognize(imageBase64, mimeType) {
      let response: Response;
      try {
        response = await fetchFn(url(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64, mimeType }),
        });
      } catch {
        throw new RecognizeError(NETWORK_ERROR_MESSAGE);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const message =
          body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `辨識服務回應錯誤（${response.status}）`;
        throw new RecognizeError(message);
      }
      return parseExtractionResult(body);
    },
  };
}

export const claudeHoldingRecognizer: HoldingRecognizer = createClaudeHoldingRecognizer();
