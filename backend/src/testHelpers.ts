import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "./claudeInsight.ts";
import type { InsightInput } from "./insightRequest.ts";

/** 測試共用：一組兩檔的合法請求（對應 app 假價表的台積電 +4%、鴻海 -5%） */
export function sampleInput(): InsightInput {
  return {
    version: 1,
    priceDate: "2026/10/22",
    feesIncluded: false,
    holdings: [
      {
        symbol: "2330",
        name: "台積電",
        shares: 1000,
        avgCost: 500,
        cost: 500_000,
        price: 520,
        pnl: 20_000,
        returnRate: 0.04,
      },
      {
        symbol: "2317",
        name: "鴻海",
        shares: 1000,
        avgCost: 200,
        cost: 200_000,
        price: 190,
        pnl: -10_000,
        returnRate: -0.05,
      },
    ],
    total: { cost: 700_000, marketValue: 710_000, pnl: 10_000, returnRate: 10_000 / 700_000 },
  };
}

export const CLEAN_REPLY = {
  summary: "這 2 檔合計賺 10,000 元，報酬率 +1.43%。",
  observations: [
    "台積電報酬率 +4.00%，賺 20,000 元，是表現最好的一檔。",
    "鴻海報酬率 -5.00%，虧 10,000 元。",
  ],
  riskNote: "以上依 2026/10/22 收盤價計算，未計入手續費與交易稅，股價會變動。",
};

/** 假的 Claude：依序回 replies 裡的 JSON（或丟出錯誤），並記下每次收到的參數 */
export function fakeClaude(replies: Array<object | Error | string>) {
  const calls: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const createMessage: CreateMessage = async (params) => {
    calls.push(params);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    const text = typeof reply === "string" ? reply : JSON.stringify(reply);
    return {
      id: `msg_${calls.length}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text, citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 400 },
    } as unknown as Anthropic.Beta.Messages.BetaMessage;
  };
  return { createMessage, calls };
}

/** 截圖辨識測試用的圖片：只有檔頭是真的（後端只看檔頭判斷格式），後面補 0 */
export const IMAGE_HEADERS = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [...Buffer.from("GIF89a")],
  webp: [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")],
  heic: [0, 0, 0, 0x18, ...Buffer.from("ftypheic")],
  pdf: [...Buffer.from("%PDF-1.7")],
} as const;

export function fakeImageBase64(kind: keyof typeof IMAGE_HEADERS, totalBytes = 64): string {
  const bytes = Buffer.alloc(Math.max(totalBytes, IMAGE_HEADERS[kind].length));
  Buffer.from(IMAGE_HEADERS[kind]).copy(bytes);
  return bytes.toString("base64");
}

/** 模型對一張兩檔截圖的回覆（structured outputs 的原始欄位） */
export const RECOGNIZE_REPLY = {
  holdings: [
    { symbol: "2330", name: "台積電", buyPrice: 512.5, quantity: 2, quantityUnit: "lots", confidence: "high" },
    { symbol: null, name: "鴻海", buyPrice: 180, quantity: 500, quantityUnit: "shares", confidence: "low" },
  ],
  warnings: ["第二列的代號被遮住"],
};
