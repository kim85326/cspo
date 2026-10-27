import { candleDirection, chartMonths, layoutCandleChart, locateBuyDate } from "./candles";
import type { Candle } from "./types";

function candle(date: string, open: number, high: number, low: number, close: number): Candle {
  return { date, open, high, low, close };
}

const CANDLES: Candle[] = [
  candle("2026-10-01", 100, 110, 95, 105),
  candle("2026-10-02", 105, 108, 98, 100),
  candle("2026-10-05", 100, 104, 99, 100),
  candle("2026-10-06", 100, 120, 100, 118),
];

describe("chartMonths", () => {
  test("沒填買入日期：近 3 個月", () => {
    expect(chartMonths("2026-10-27")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  test("買入日期在近 3 個月內：還是近 3 個月", () => {
    expect(chartMonths("2026-10-27", "2026-09-15")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  test("買入日期更早：延伸到買入那個月", () => {
    expect(chartMonths("2026-10-27", "2026-06-03")).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  test("最多 6 個月，跨年也對", () => {
    expect(chartMonths("2026-02-10", "2024-01-01")).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("locateBuyDate", () => {
  test("買入日剛好是交易日", () => {
    expect(locateBuyDate(CANDLES, "2026-10-02")).toEqual({ kind: "in", index: 1 });
  });

  test("買入日是週末：落在下一個交易日", () => {
    expect(locateBuyDate(CANDLES, "2026-10-03")).toEqual({ kind: "in", index: 2 });
  });

  test("買入日早於第一根 K 棒", () => {
    expect(locateBuyDate(CANDLES, "2026-09-30")).toEqual({ kind: "before" });
  });

  test("買入日晚於最新一根（今天的行情還沒出來）", () => {
    expect(locateBuyDate(CANDLES, "2026-10-07")).toEqual({ kind: "after" });
  });

  test("沒有任何 K 棒", () => {
    expect(locateBuyDate([], "2026-10-02")).toEqual({ kind: "before" });
  });
});

describe("candleDirection（台股紅 K 漲、綠 K 跌）", () => {
  test.each([
    [candle("d", 100, 110, 90, 105), "up"],
    [candle("d", 105, 110, 90, 100), "down"],
    [candle("d", 100, 110, 90, 100), "flat"],
  ])("%p → %s", (c, expected) => {
    expect(candleDirection(c)).toBe(expected);
  });
});

describe("layoutCandleChart", () => {
  const options = { width: 456, height: 252, axisWidth: 56, paddingTop: 12, paddingBottom: 40 };

  test("每根 K 棒平均分配寬度、置中", () => {
    const layout = layoutCandleChart(CANDLES, options);
    expect(layout.plotRight).toBe(400);
    expect(layout.shapes.map((s) => s.x)).toEqual([50, 150, 250, 350]);
    expect(layout.shapes[0].bodyWidth).toBe(60);
  });

  test("價格越高 y 越小；最高價與最低價都在繪圖區內", () => {
    const layout = layoutCandleChart(CANDLES, options);
    const top = layout.priceToY(120);
    const bottom = layout.priceToY(95);
    expect(top).toBeLessThan(bottom);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(bottom).toBeLessThanOrEqual(252 - 40);
  });

  test("K 棒實體：紅 K 上緣是收盤、綠 K 上緣是開盤；十字線至少 1px", () => {
    const layout = layoutCandleChart(CANDLES, options);
    const [up, down, flat] = layout.shapes;
    expect(up.direction).toBe("up");
    expect(up.bodyTop).toBeCloseTo(layout.priceToY(105));
    expect(down.direction).toBe("down");
    expect(down.bodyTop).toBeCloseTo(layout.priceToY(105));
    expect(flat.direction).toBe("flat");
    expect(flat.bodyHeight).toBe(1);
  });

  test("成本價在 K 線範圍外時，價格範圍會把它包進來", () => {
    const layout = layoutCandleChart(CANDLES, { ...options, costPrice: 80 });
    expect(layout.costY).not.toBeNull();
    expect(layout.costY!).toBeLessThanOrEqual(252 - 40);
    expect(layout.costY!).toBeGreaterThan(layout.priceToY(95));
  });

  test("沒給成本價：沒有成本線", () => {
    expect(layoutCandleChart(CANDLES, options).costY).toBeNull();
  });

  test("買入點落在對應 K 棒的最低點", () => {
    const layout = layoutCandleChart(CANDLES, { ...options, buyDate: "2026-10-03" });
    expect(layout.buy).toEqual({ kind: "in", index: 2 });
    expect(layout.buyPoint).toEqual({
      x: 250,
      lowY: layout.priceToY(99),
      candle: CANDLES[2],
    });
  });

  test("買入日不在圖上：沒有買入點，但回報位置", () => {
    const layout = layoutCandleChart(CANDLES, { ...options, buyDate: "2026-01-02" });
    expect(layout.buy).toEqual({ kind: "before" });
    expect(layout.buyPoint).toBeNull();
  });

  test("刻度是最高、中間、最低；日期標籤是第一天、中間、最後一天", () => {
    const layout = layoutCandleChart(CANDLES, options);
    expect(layout.ticks.map((t) => t.price)).toEqual([120, 107.5, 95]);
    expect(layout.dateLabels.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-06"]);
  });

  test("只有一根 K 棒也不會壞", () => {
    const layout = layoutCandleChart([CANDLES[0]], options);
    expect(layout.shapes).toHaveLength(1);
    expect(layout.dateLabels).toHaveLength(1);
  });
});
