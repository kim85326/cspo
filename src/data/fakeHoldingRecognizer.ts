import type { ExtractionResult } from "@/domain/holdingExtract";
import type { HoldingRecognizer } from "./HoldingRecognizer";

/** 固定回兩檔：台積電 500 × 1000 股、鴻海 200 × 1 張。配假價表剛好一賺一虧、合計 0。 */
export const FAKE_EXTRACTION: ExtractionResult = {
  holdings: [
    { symbol: "2330", name: "台積電", buyPrice: "500", shares: "1,000", unit: "shares", confidence: "high" },
    { name: "鴻海", buyPrice: "200", shares: "1", unit: "lots", confidence: "high" },
  ],
  warnings: [],
};

/** 測試用：不看圖片，固定回同一份結果（或由呼叫端自訂）。 */
export function createFakeHoldingRecognizer(
  result: ExtractionResult | (() => Promise<ExtractionResult>) = FAKE_EXTRACTION,
): HoldingRecognizer {
  return {
    async recognize() {
      return typeof result === "function" ? result() : structuredClone(result);
    },
  };
}

export const fakeHoldingRecognizer: HoldingRecognizer = createFakeHoldingRecognizer();
