import type Anthropic from "@anthropic-ai/sdk";
import { InsightServerError, toServerError, type CreateMessage } from "./claudeInsight.ts";
import type { RecognizeInput } from "./recognizeRequest.ts";

/**
 * 截圖匯入（Story 005）：把持股截圖交給 Claude 的 vision，用 JSON schema（structured outputs）強制回結構化結果。
 * 這裡只負責「讀出截圖上的字」；對到股票清單、張數換算、合併同一檔都在 app 的 src/domain/holdingExtract.ts，
 * app 收到後用 parseExtractionResult 正規化，所以這裡回的是模型的原始欄位（quantity／quantityUnit）。
 */

export const RECOGNIZE_MODEL = "claude-opus-5-5";
/** 截圖可能有十幾檔，加上 thinking；仍在 config.ts 的 MAX_TOKENS_CEILING 以內 */
export const RECOGNIZE_MAX_TOKENS = 4096;

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

/** 給 app 的回應：模型的原始結果（app 端 parseExtractionResult 再正規化） */
export type RecognizeResponse = {
  holdings: Array<Record<string, unknown>>;
  warnings: string[];
};

export type RecognizeOptions = {
  createMessage: CreateMessage;
  onUsage?: (usage: Anthropic.Beta.Messages.BetaUsage) => void;
};

export async function recognizeHoldings(
  input: RecognizeInput,
  { createMessage, onUsage }: RecognizeOptions,
): Promise<RecognizeResponse> {
  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    message = await createMessage({
      model: RECOGNIZE_MODEL,
      max_tokens: RECOGNIZE_MAX_TOKENS,
      // 安全分類器誤判時自動換模型重跑，不用自己維護備援清單
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 } },
            { type: "text", text: "請讀出這張截圖裡的每一檔持股。" },
          ],
        },
      ],
    });
  } catch (error) {
    throw toServerError(error);
  }
  onUsage?.(message.usage);

  if (message.stop_reason === "refusal") {
    throw new InsightServerError("辨識服務無法處理這張圖片，請換一張持股截圖", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new InsightServerError("截圖內容太多，辨識結果被截斷，請裁切成較少檔數後再試", 422);
  }
  const text = message.content.find((block) => block.type === "text")?.text ?? "";
  return parseRecognizeText(text);
}

/** 模型回的 JSON → RecognizeResponse；最外層形狀不對回 502 讓 app 顯示可重試 */
export function parseRecognizeText(text: string): RecognizeResponse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new InsightServerError("辨識服務回傳的格式不正確，請重試", 502);
  }
  const value = json as { holdings?: unknown; warnings?: unknown } | null;
  if (!value || typeof value !== "object" || !Array.isArray(value.holdings)) {
    throw new InsightServerError("辨識服務回傳的格式不正確，請重試", 502);
  }
  return {
    holdings: value.holdings.filter((h): h is Record<string, unknown> => !!h && typeof h === "object"),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}
