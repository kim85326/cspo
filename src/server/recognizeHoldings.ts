import Anthropic from "@anthropic-ai/sdk";
import { parseExtractionResult, type ExtractionResult } from "@/domain/holdingExtract";

/**
 * 伺服器端：把持股截圖交給 Claude 的 vision，用 JSON schema（structured outputs）強制回結構化結果。
 * 只會被 src/app/recognize+api.ts（API route）載入，API key 與這段程式都不會進手機 app 的 bundle。
 * 對到股票清單、張數換算等邏輯不在這裡，在 src/domain/holdingExtract.ts。
 */

export const RECOGNIZE_MODEL = "claude-opus-5-5";
const MAX_OUTPUT_TOKENS = 4096;

export const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export const MISSING_API_KEY_MESSAGE =
  "伺服器沒有設定 ANTHROPIC_API_KEY：請在專案根目錄建立 .env（參考 .env.example）後重新執行 npx expo start";

/** 伺服器端錯誤：message 可直接給使用者看，status 是要回給手機的 HTTP 狀態碼 */
export class RecognizeServerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RecognizeServerError";
  }
}

export const SYSTEM_PROMPT = `你是台股券商 app 截圖的資料擷取器。使用者會給一張「庫存」「持股」「未實現損益」之類畫面的截圖，你要把每一檔持股讀出來。

台股券商截圖常見欄位：股票名稱、股票代號（4～6 碼，多半是數字，ETF 可能像 0050、00878）、成本／均價／成本價（每股）、股數或張數（1 張 = 1000 股）、現價／市價、損益／報酬率、現值／市值／總成本。

規則：
1. 只回傳持股列。合計列、標題列、分頁、廣告、帳戶總覽都不是持股。
2. 成本價要填「每股的成本／均價」，不是總成本、不是現價、不是損益。
3. 數量：截圖寫「張」就 quantityUnit 填 lots；寫「股」或沒標單位就填 shares。零股（不滿 1000 股）通常以「股」顯示。
4. 名稱照截圖原文抄；代號只填代號本身（不要加 .TW）。
5. 看不清楚、被遮住、或不確定的欄位填 null，並把那一列的 confidence 設成 low。寧可留空也不要猜。
6. 一列裡所有欄位都清楚才設 high。
7. warnings 用繁體中文各寫一句，說明哪些列或欄位辨識不到、截圖是否被裁掉；沒有就回空陣列。
8. 如果這張圖根本不是持股畫面，holdings 回空陣列，並在 warnings 說明。`;

/** structured outputs 的 JSON schema：所有欄位都 required，看不到就 null */
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    holdings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { anyOf: [{ type: "string" }, { type: "null" }], description: "股票代號" },
          name: { anyOf: [{ type: "string" }, { type: "null" }], description: "股票名稱" },
          buyPrice: { anyOf: [{ type: "number" }, { type: "null" }], description: "每股成本／均價" },
          quantity: { anyOf: [{ type: "number" }, { type: "null" }], description: "數量，單位看 quantityUnit" },
          quantityUnit: { enum: ["shares", "lots", null], description: "shares=股、lots=張" },
          confidence: { enum: ["high", "low"] },
        },
        required: ["symbol", "name", "buyPrice", "quantity", "quantityUnit", "confidence"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["holdings", "warnings"],
  additionalProperties: false,
} as const;

export function isSupportedMediaType(mimeType: string): mimeType is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mimeType);
}

/** 用 .env 的 ANTHROPIC_API_KEY 建 client；沒設就丟 503 的錯誤給手機端顯示 */
export function createClaudeClient(apiKey = process.env.ANTHROPIC_API_KEY): Anthropic {
  if (!apiKey || apiKey.trim() === "") throw new RecognizeServerError(MISSING_API_KEY_MESSAGE, 503);
  return new Anthropic({ apiKey });
}

/** 只用到 client 的這一個方法，測試可以注入假的 */
export type CreateMessage = (
  params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.Messages.BetaMessage>;

export async function recognizeHoldingsWithClaude(
  imageBase64: string,
  mimeType: string,
  createMessage?: CreateMessage,
): Promise<ExtractionResult> {
  if (!isSupportedMediaType(mimeType)) {
    throw new RecognizeServerError(`不支援的圖片格式（${mimeType}），請用 JPEG 或 PNG`, 400);
  }
  const create: CreateMessage =
    createMessage ??
    (() => {
      const client = createClaudeClient();
      return (params) => client.beta.messages.create(params);
    })();

  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    message = await create({
      model: RECOGNIZE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // 安全分類器誤判時自動換模型重跑，不用自己維護備援清單
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
            { type: "text", text: "請讀出這張截圖裡的每一檔持股。" },
          ],
        },
      ],
    });
  } catch (error) {
    throw toServerError(error);
  }

  if (message.stop_reason === "refusal") {
    throw new RecognizeServerError("辨識服務無法處理這張圖片，請換一張持股截圖", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new RecognizeServerError("截圖內容太多，辨識結果被截斷，請裁切成較少檔數後再試", 422);
  }
  const text = message.content.find((block) => block.type === "text")?.text ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RecognizeServerError("辨識服務回傳的格式不正確，請重試", 502);
  }
  return parseExtractionResult(json);
}

/** 把 SDK 的例外換成給使用者看的中文；從最特定的類別開始判斷 */
function toServerError(error: unknown): RecognizeServerError {
  if (error instanceof RecognizeServerError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new RecognizeServerError("ANTHROPIC_API_KEY 無效，請檢查 .env", 503);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new RecognizeServerError("辨識服務忙碌中，請稍後再試", 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new RecognizeServerError("伺服器連不上辨識服務，請檢查電腦的網路", 502);
  }
  if (error instanceof Anthropic.APIError) {
    return new RecognizeServerError(`辨識服務錯誤（${error.status ?? "?"}）：${error.message}`, 502);
  }
  return new RecognizeServerError("辨識時發生未知錯誤，請重試", 500);
}
