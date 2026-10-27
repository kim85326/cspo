import type { Candle } from "@/domain/types";
import { loadAdjustedCloses } from "./adjustedHistory";
import type { CandleSource } from "./CandleSource";
import { corporateActionSource } from "./index";

function candle(date: string, close: number): Candle {
  return { date, open: close, high: close, low: close, close };
}

describe("loadAdjustedCloses", () => {
  test("跨月份抓日 K、篩期間，再套用除權息與分割（0050 用假除權息來源）", async () => {
    const candles: CandleSource = {
      getDailyCandles: jest.fn(async () => [
        candle("2025-05-30", 190),
        candle("2025-06-02", 188.65),
        candle("2025-06-18", 47.16),
        candle("2025-07-18", 51.45),
        candle("2025-07-21", 51.09),
        candle("2025-08-01", 52),
      ]),
    };
    const result = await loadAdjustedCloses("0050", "2025-06-01", "2025-07-31", {
      candles,
      actions: corporateActionSource,
    });

    expect(candles.getDailyCandles).toHaveBeenCalledWith("0050", ["2025-06", "2025-07"]);
    expect(result.map((r) => r.date)).toEqual(["2025-06-02", "2025-06-18", "2025-07-18", "2025-07-21"]);
    const dividend = (51.45 - 0.36) / 51.45;
    expect(result[0].adjClose).toBeCloseTo((188.65 / 4) * dividend, 6);
    expect(result[2].adjClose).toBeCloseTo(51.45 * dividend, 6);
    expect(result[3].adjClose).toBe(51.09);
  });
});
