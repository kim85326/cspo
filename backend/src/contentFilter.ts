import type { InsightInput } from "./insightRequest.ts";

/**
 * 內容規則（投顧法規）：解讀只能描述數字，不能有操作方向。
 * prompt 已經禁止，這裡是回傳前的最後一道檢查：命中就重試一次，再命中就把那幾句拿掉並標記 filtered。
 * 規格依據：docs/product-spec.md 1.4、P2-05 的 AC。
 */
export const BANNED_TERMS = [
  "建議",
  "應該",
  "買進",
  "賣出",
  "加碼",
  "減碼",
  "停損",
  "停利",
  "目標價",
  "進場",
  "出場",
  "逢低",
  "逢高",
  // 模型偶爾混用簡體字
  "建议",
  "应该",
  "买进",
  "卖出",
  "加码",
  "减码",
  "止损",
] as const;

/** 每次回應都附上的固定免責聲明（本身含「建議」二字，所以在過濾之後才加） */
export const DISCLAIMER = "僅為數據解讀，不構成投資建議";

/** Claude 回的三個欄位 */
export type InsightText = {
  summary: string;
  observations: string[];
  riskNote: string;
};

export function findBannedTerms(text: InsightText): string[] {
  const joined = [text.summary, ...text.observations, text.riskNote].join("\n");
  return BANNED_TERMS.filter((term) => joined.includes(term));
}

const FALLBACK_RISK_NOTE = "以上依單一時點的收盤價計算，股價會變動，過去表現不代表未來結果。";

/**
 * 去掉含禁用字眼的句子。整段被拿光時用數字自己組一句中性的描述補上，畫面不會空白。
 * 補上的句子只用 input 的數字，不經過模型，也不含禁用字眼（有測試確認）。
 */
export function sanitizeInsight(text: InsightText, input: InsightInput): InsightText {
  const summary = dropBannedSentences(text.summary) || fallbackSummary(input);
  let observations = text.observations.map(dropBannedSentences).filter((s) => s !== "");
  if (observations.length === 0) observations = fallbackObservations(input);
  const riskNote = dropBannedSentences(text.riskNote) || FALLBACK_RISK_NOTE;
  return { summary, observations, riskNote };
}

/** 以句號、驚嘆號、問號、分號、換行切句，保留標點 */
function dropBannedSentences(text: string): string {
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*/g) ?? [];
  return sentences
    .filter((s) => !BANNED_TERMS.some((term) => s.includes(term)))
    .join("")
    .trim();
}

function fallbackSummary(input: InsightInput): string {
  const { pnl, returnRate } = input.total;
  const count = input.holdings.length;
  const verb = pnl > 0 ? "賺" : pnl < 0 ? "虧" : "損益兩平";
  const amount = pnl === 0 ? "" : ` ${formatAmount(Math.abs(pnl))} 元`;
  return `這 ${count} 檔持股合計${verb}${amount}，報酬率 ${formatRate(returnRate)}。`;
}

function fallbackObservations(input: InsightInput): string[] {
  const sorted = [...input.holdings].sort((a, b) => b.returnRate - a.returnRate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (sorted.length === 1) {
    return [`${best.name}（${best.symbol}）報酬率 ${formatRate(best.returnRate)}。`];
  }
  return [
    `報酬率最高的是 ${best.name}（${best.symbol}），${formatRate(best.returnRate)}。`,
    `報酬率最低的是 ${worst.name}（${worst.symbol}），${formatRate(worst.returnRate)}。`,
  ];
}

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatRate(rate: number): string {
  const pct = (rate * 100).toFixed(2);
  return rate > 0 ? `+${pct}%` : `${pct}%`;
}
