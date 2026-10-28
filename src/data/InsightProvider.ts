import type { InsightInput } from "@/domain/insightInput";

/** AI 解讀的結果（Story 031）。文字都已經過後端的禁用字眼檢查。 */
export type Insight = {
  /** 一句話總結 */
  summary: string;
  /** 2～4 點觀察 */
  observations: string[];
  /** 風險提醒 */
  riskNote: string;
  /** 固定的免責聲明：「僅為數據解讀，不構成投資建議」 */
  disclaimer: string;
  /** true 代表模型用了禁用字眼、內容已被刪減 */
  filtered: boolean;
};

/**
 * 把一組持股的計算結果交給 AI 解讀。
 * 實作：backendInsightProvider（打工程同學電腦上的 backend/）、fakeInsightProvider（測試）。
 */
export interface InsightProvider {
  /** @throws InsightError 沒設定網址、連不到、存取碼錯、太頻繁、後端沒設 key 等 */
  getInsight(input: InsightInput): Promise<Insight>;
}

/** 解讀失敗：message 是可以直接給使用者看的中文 */
export class InsightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightError";
  }
}
