import type { Candle } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import type { CorporateActionSource } from "./CorporateActionSource";
import { createFallbackActionSource, createFallbackCandleSource } from "./fallbackSource";
import { PriceLoadError } from "./PriceSource";

const CANDLE: Candle = { date: "2026-10-01", open: 1, high: 1, low: 1, close: 1 };

function candles(result: Candle[] | Error) {
  return {
    getDailyCandles: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } satisfies CandleSource;
}

describe("createFallbackCandleSource", () => {
  test("第一個成功就用，不問第二個", async () => {
    const primary = candles([CANDLE]);
    const backup = candles([]);
    await expect(createFallbackCandleSource([primary, backup]).getDailyCandles("2330", ["2026-10"])).resolves.toEqual([CANDLE]);
    expect(backup.getDailyCandles).not.toHaveBeenCalled();
  });

  test("回空陣列也算成功（這檔真的沒資料）", async () => {
    const backup = candles([CANDLE]);
    await expect(createFallbackCandleSource([candles([]), backup]).getDailyCandles("X", ["2026-10"])).resolves.toEqual([]);
    expect(backup.getDailyCandles).not.toHaveBeenCalled();
  });

  test("第一個 PriceLoadError（例如 FinMind 超過上限）：自動改問第二個", async () => {
    const source = createFallbackCandleSource([candles(new PriceLoadError("402")), candles([CANDLE])]);
    await expect(source.getDailyCandles("2330", ["2026-10"])).resolves.toEqual([CANDLE]);
  });

  test("全部失敗：丟 PriceLoadError", async () => {
    const source = createFallbackCandleSource([candles(new PriceLoadError()), candles(new PriceLoadError())]);
    await expect(source.getDailyCandles("2330", ["2026-10"])).rejects.toBeInstanceOf(PriceLoadError);
  });

  test("不是 PriceLoadError（程式錯）：直接往外丟，不換來源", async () => {
    const backup = candles([CANDLE]);
    const source = createFallbackCandleSource([candles(new TypeError("bug")), backup]);
    await expect(source.getDailyCandles("2330", ["2026-10"])).rejects.toBeInstanceOf(TypeError);
    expect(backup.getDailyCandles).not.toHaveBeenCalled();
  });
});

describe("createFallbackActionSource", () => {
  test("第一個失敗就問第二個，參數原樣傳過去", async () => {
    const backup: CorporateActionSource = { getActions: jest.fn(async () => []) };
    const source = createFallbackActionSource([
      {
        getActions: async () => {
          throw new PriceLoadError();
        },
      },
      backup,
    ]);
    await source.getActions("0050", "2025-01-01", "2025-12-31");
    expect(backup.getActions).toHaveBeenCalledWith("0050", "2025-01-01", "2025-12-31");
  });
});
