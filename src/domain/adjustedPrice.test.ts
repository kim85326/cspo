import { adjustCloses, dividendFactor } from "./adjustedPrice";
import type { Candle, DividendEvent, SplitEvent } from "./types";

function close(date: string, price: number): Candle {
  return { date, open: price, high: price, low: price, close: price };
}

function dividend(exDate: string, cash: number | null, extra: Partial<DividendEvent> = {}): DividendEvent {
  return { kind: "dividend", symbol: "X", exDate, cashPerShare: cash, stockPerThousand: 0, payDate: null, ...extra };
}

function split(date: string, ratio: number): SplitEvent {
  return { kind: "split", symbol: "X", date, ratio };
}

describe("dividendFactor", () => {
  test("只配現金：台積電 2025-12-11 前收 1,505、配 5.000011 → 參考價 1,499.999989（證交所公告無條件捨去成 1,499.99）", () => {
    const factor = dividendFactor(dividend("2025-12-11", 5.000011), 1505);
    expect(1505 * factor!).toBeCloseTo(1499.999989, 6);
  });

  test("現金加配股：玉山金 2025-07-22 前收 34.20、現金 1.2、每千股 10 股 → 參考價 32.67", () => {
    const factor = dividendFactor(dividend("2025-07-22", 1.2, { stockPerThousand: 10 }), 34.2);
    expect(34.2 * factor!).toBeCloseTo(32.67, 2);
  });

  test("官方給了前收與參考價：直接用，不自己算", () => {
    const event = dividend("2025-07-21", 0.36, { closeBefore: 51.45, referencePrice: 51.09 });
    expect(dividendFactor(event, 999)).toBeCloseTo(51.09 / 51.45, 10);
  });

  test("金額待公告：回 null", () => {
    expect(dividendFactor(dividend("2026-11-03", null), 20)).toBeNull();
  });

  test("配息大於前收（資料錯誤）：回 null，不產生負價格", () => {
    expect(dividendFactor(dividend("2026-01-01", 30), 20)).toBeNull();
  });
});

describe("adjustCloses", () => {
  test("沒有事件：還原價等於收盤價", () => {
    const candles = [close("2026-01-02", 100), close("2026-01-05", 101)];
    expect(adjustCloses(candles, []).map((c) => c.adjClose)).toEqual([100, 101]);
  });

  test("除息日之前的每一天乘上因子，除息日當天與之後不變", () => {
    const candles = [close("2026-01-20", 70), close("2026-01-21", 71.85), close("2026-01-22", 71), close("2026-01-23", 72)];
    const result = adjustCloses(candles, [dividend("2026-01-22", 1)]);
    const factor = 70.85 / 71.85;
    expect(result[0].adjClose).toBeCloseTo(70 * factor, 10);
    expect(result[1].adjClose).toBeCloseTo(70.85, 10);
    expect(result.slice(2).map((c) => c.adjClose)).toEqual([71, 72]);
    expect(result.map((c) => c.close)).toEqual([70, 71.85, 71, 72]);
  });

  test("0050 一拆四：分割前的價格除以 4，前後接得起來", () => {
    const candles = [close("2025-06-09", 188.65), close("2025-06-18", 47.16)];
    const result = adjustCloses(candles, [split("2025-06-18", 4)]);
    expect(result[0].adjClose).toBeCloseTo(47.1625, 4);
    expect(result[1].adjClose).toBe(47.16);
  });

  test("多次事件會連乘", () => {
    const candles = [close("2026-01-02", 100), close("2026-02-02", 100), close("2026-03-02", 100)];
    const result = adjustCloses(candles, [dividend("2026-02-02", 10), split("2026-03-02", 2)]);
    expect(result[0].adjClose).toBeCloseTo(100 * 0.9 * 0.5, 10);
    expect(result[1].adjClose).toBeCloseTo(50, 10);
    expect(result[2].adjClose).toBe(100);
  });

  test("略過：金額待公告、還沒發生、在第一根當天或之前的事件", () => {
    const candles = [close("2026-01-02", 100), close("2026-01-05", 100)];
    const actions = [
      dividend("2026-01-05", null),
      dividend("2026-02-01", 5),
      dividend("2026-01-02", 5),
      split("2025-12-01", 4),
    ];
    expect(adjustCloses(candles, actions).map((c) => c.adjClose)).toEqual([100, 100]);
  });

  test("沒有 K 棒：回空陣列", () => {
    expect(adjustCloses([], [dividend("2026-01-02", 1)])).toEqual([]);
  });
});
