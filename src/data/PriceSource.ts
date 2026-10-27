import type { Quote } from "@/domain/types";

/** 行情來源介面。找不到代號回 null。 */
export interface PriceSource {
  getQuote(symbol: string): Promise<Quote | null>;
}
