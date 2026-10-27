import Anthropic from "@anthropic-ai/sdk";
import {
  DISCLAIMER,
  findBannedTerms,
  sanitizeInsight,
  type InsightText,
} from "./contentFilter.ts";
import type { InsightInput } from "./insightRequest.ts";

/**
 * 把持股數字交給 Claude 寫白話解讀。structured outputs（output_config.format）保證回 JSON；
 * 回傳前過一次 contentFilter，命中禁用字眼就重試一次，再不行就拿掉那幾句並標 filtered。
 */

export const INSIGHT_MODEL = "claude-opus-5-5";

/** 給 app 的回應 */
export type InsightResponse = InsightText & {
  disclaimer: string;
  /** true 代表模型兩次都用了禁用字眼，內容已被刪減 */
  filtered: boolean;
  model: string;
};

/** 錯誤：message 可直接給使用者看，status 是要回給 app 的 HTTP 狀態碼 */
export class InsightServerError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InsightServerError";
    this.status = status;
  }
}

/** 只用到 client 的這一個方法，測試注入假的 */
export type CreateMessage = (
  params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.Messages.BetaMessage>;

export function createClaudeCreateMessage(apiKey: string): CreateMessage {
  // 預設 timeout 是 10 分鐘；/insight 與 /recognize 都在 60 秒內回，超過就讓 app 顯示可重試的錯誤
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  return (params) => client.beta.messages.create(params);
}

export const SYSTEM_PROMPT = `你是台股記帳 app「賺了嗎」裡的數據解讀助手。使用者會給你一組持股的計算結果（JSON），請用白話的繁體中文，說明這組持股「到資料日期為止」的表現。

你只能描述資料裡已經呈現的事實，例如：整體賺或虧多少、哪一檔報酬率最高或最低、盈虧主要來自哪一檔、各檔占總成本的比重與集中程度。

這個 app 依台灣投顧法規，不能提供投資建議。所以：
- 不要提出任何操作方向：不說要不要買、賣、續抱、換股、增減持股，不提停損停利、目標價、進出場時機。
- 不要預測未來的股價或報酬，不評論公司前景、產業、新聞或總體經濟。
- 完全不要使用這些詞：建議、應該、買進、賣出、加碼、減碼、停損、停利、目標價、進場、出場、逢低、逢高。
- 只用輸入資料裡的數字，不要引用資料以外的資訊。

輸出欄位：
- summary：一句話（40 字以內）總結整體表現，要包含合計報酬率。
- observations：2～4 點，每點一句，具體引用數字。只有一檔時就描述那一檔本身（成本、現價、盈虧），不做排名。
- riskNote：一句中性的提醒，說明這是依某個時點的收盤價計算、股價會變動。若 feesIncluded 為 false，順帶說明未計入手續費與交易稅。

格式：金額用千分位整數加「元」，報酬率保留兩位小數並帶正負號（例如 +4.00%、-2.50%）。稱呼使用者為「你」。不用 emoji，不用 Markdown。`;

/** structured outputs 的 JSON schema；觀察點數 2～4 由程式端檢查（schema 不支援陣列長度限制） */
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "一句話總結整體表現" },
    observations: {
      type: "array",
      items: { type: "string" },
      description: "2～4 點觀察，每點一句",
    },
    riskNote: { type: "string", description: "一句中性的風險提醒" },
  },
  required: ["summary", "observations", "riskNote"],
  additionalProperties: false,
} as const;

const MAX_OBSERVATIONS = 4;

export type GenerateOptions = {
  createMessage: CreateMessage;
  maxTokens: number;
  /** 每次呼叫完回報 token 用量（main.ts 用來印 log 估費用） */
  onUsage?: (usage: Anthropic.Beta.Messages.BetaUsage) => void;
};

export async function generateInsight(
  input: InsightInput,
  { createMessage, maxTokens, onUsage }: GenerateOptions,
): Promise<InsightResponse> {
  const first = await askClaude(input, [], createMessage, maxTokens, onUsage);
  const firstHits = findBannedTerms(first);
  if (firstHits.length === 0) return finish(first, false);

  const second = await askClaude(input, firstHits, createMessage, maxTokens, onUsage);
  if (findBannedTerms(second).length === 0) return finish(second, false);
  return finish(sanitizeInsight(second, input), true);
}

function finish(text: InsightText, filtered: boolean): InsightResponse {
  return { ...text, disclaimer: DISCLAIMER, filtered, model: INSIGHT_MODEL };
}

async function askClaude(
  input: InsightInput,
  previousHits: string[],
  createMessage: CreateMessage,
  maxTokens: number,
  onUsage: GenerateOptions["onUsage"],
): Promise<InsightText> {
  const retryNote =
    previousHits.length > 0
      ? `\n\n上一次的回覆用到了不允許的詞（${previousHits.join("、")}）。請重新撰寫，完全不要出現這些詞。`
      : "";

  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    message = await createMessage({
      model: INSIGHT_MODEL,
      max_tokens: maxTokens,
      // 安全分類器誤判時自動換模型重跑，不用自己維護備援清單
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      // 白話摘要不需要深度推理；Opus 5.5 的 thinking 關不掉，用 low effort 省 token
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `請解讀這組持股：\n${JSON.stringify(input)}${retryNote}`,
        },
      ],
    });
  } catch (error) {
    throw toServerError(error);
  }
  onUsage?.(message.usage);

  if (message.stop_reason === "refusal") {
    throw new InsightServerError("AI 這次無法解讀這組資料，請稍後再試", 502);
  }
  if (message.stop_reason === "max_tokens") {
    throw new InsightServerError("AI 回覆被截斷，請重試", 502);
  }
  const text = message.content.find((block) => block.type === "text")?.text ?? "";
  return parseInsightText(text);
}

/** 模型回的 JSON → InsightText；格式不對回 502 讓 app 顯示可重試 */
export function parseInsightText(text: string): InsightText {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new InsightServerError("AI 回傳的格式不正確，請重試", 502);
  }
  const value = json as Partial<Record<keyof InsightText, unknown>>;
  const summary = typeof value?.summary === "string" ? value.summary.trim() : "";
  const riskNote = typeof value?.riskNote === "string" ? value.riskNote.trim() : "";
  const observations = Array.isArray(value?.observations)
    ? value.observations
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.trim())
        .filter((o) => o !== "")
        .slice(0, MAX_OBSERVATIONS)
    : [];
  if (summary === "" || observations.length === 0) {
    throw new InsightServerError("AI 回傳的格式不正確，請重試", 502);
  }
  return { summary, observations, riskNote };
}

/** SDK 例外 → 給使用者看的中文；英文原文只寫進後端 log，不回給 app（/recognize 也共用） */
export function toServerError(error: unknown): InsightServerError {
  if (error instanceof InsightServerError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new InsightServerError("後端的 ANTHROPIC_API_KEY 無效，請檢查 backend/.env", 503);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new InsightServerError("這把 API key 沒有權限使用模型，請檢查 Anthropic Console", 503);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new InsightServerError("AI 服務忙碌中，請稍後再試", 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new InsightServerError("後端連不上 AI 服務，請檢查電腦的網路", 502);
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`[claude] Claude API 錯誤 ${error.status ?? "?"}: ${error.message}`);
    return new InsightServerError(`AI 服務錯誤（${error.status ?? "?"}），請稍後再試`, 502);
  }
  console.error("[claude] 未預期的錯誤", error);
  return new InsightServerError("解讀時發生未知錯誤，請重試", 500);
}
