import type { Quote } from "@/domain/types";

/**
 * 行情來源介面。
 * - 找不到代號回 null。
 * - 行情本身拿不到（斷網、證交所沒回應）丟 PriceLoadError，畫面據此顯示「行情載入失敗」。
 */
export interface PriceSource {
  getQuote(symbol: string): Promise<Quote | null>;
}

/** 行情或股票清單載入失敗（網路、伺服器錯誤、回應格式不對） */
export class PriceLoadError extends Error {
  constructor(message = "行情載入失敗", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PriceLoadError";
  }
}
