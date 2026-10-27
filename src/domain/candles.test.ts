import {
  candleDirection,
  chartStart,
  dayChange,
  fetchMonths,
  indexAtX,
  layoutCandleChart,
  linePath,
  locateBuyDate,
  monthsBetween,
  movingAverage,
  periodLabel,
  shiftMonths,
} from "./candles";
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

describe("shiftMonths", () => {
  test("往前推、跨年", () => {
    expect(shiftMonths("2026-02-10", -3)).toBe("2025-11-10");
    expect(shiftMonths("2026-10-27", -12)).toBe("2025-10-27");
  });

  test("月底夾到那個月最後一天（含閏年）", () => {
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2024-03-31", -1)).toBe("2024-02-29");
  });
});

describe("期間與要抓的月份", () => {
  test("期間名稱", () => {
    expect([1, 3, 6, 12].map(periodLabel)).toEqual(["1 個月", "3 個月", "6 個月", "1 年"]);
  });

  test("圖從 N 個月前開始", () => {
    expect(chartStart("2026-10-27", 3)).toBe("2026-07-27");
  });

  test("沒填買入日期：近 N 個月再往前多 1 個月（均線暖身）", () => {
    expect(fetchMonths("2026-10-27", 3)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  test("買入日期在圖內：比較區間跟圖的月份合併、不重複", () => {
    expect(fetchMonths("2026-10-27", 1, "2026-10-05")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  test("很久以前買的：多抓買入日前 N 個月那一段，中間不抓", () => {
    expect(fetchMonths("2026-10-27", 1, "2024-03-15")).toEqual([
      "2024-02",
      "2024-03",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });
});

describe("movingAverage", () => {
  test("湊不滿天數的位置是 null，之後是前 N 天平均", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  test("資料比天數少：全是 null", () => {
    expect(movingAverage([1, 2], 5)).toEqual([null, null]);
  });
});

describe("dayChange", () => {
  test("跟前一天收盤比", () => {
    expect(dayChange(105, 100)).toEqual({ change: 5, percent: 5 });
  });

  test("沒有前一天：null", () => {
    expect(dayChange(105, undefined)).toBeNull();
  });
});

describe("linePath", () => {
  test("null 的地方斷開，重新起筆", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 4.04 }])).toBe("M 0 1 L 1 2 M 3 4");
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

  test("成本離股價太遠：不照比例畫，成本線貼在下緣（或上緣），走勢不會被壓扁", () => {
    const below = layoutCandleChart(CANDLES, { ...options, costPrice: 20 });
    expect(below.costOffChart).toBe("below");
    expect(below.costY).toBe(252 - 40);
    expect(below.priceToY(95)).toBeGreaterThan(200); // 最低價仍在底部附近，沒被擠到中間
    const above = layoutCandleChart(CANDLES, { ...options, costPrice: 500 });
    expect(above.costOffChart).toBe("above");
    expect(above.costY).toBe(12);
    expect(layoutCandleChart(CANDLES, { ...options, costPrice: 80 }).costOffChart).toBeNull();
  });

  test("沒給成本價：沒有成本線", () => {
    expect(layoutCandleChart(CANDLES, options).costY).toBeNull();
  });

  test("買入點：買入那天、成本價的高度", () => {
    const layout = layoutCandleChart(CANDLES, { ...options, buyDate: "2026-10-03", costPrice: 102 });
    expect(layout.buy).toEqual({ kind: "in", index: 2 });
    expect(layout.buyPoint).toEqual({ x: 250, y: layout.priceToY(102), candle: CANDLES[2] });
  });

  test("沒給成本價：買入點落在當天最低點", () => {
    const layout = layoutCandleChart(CANDLES, { ...options, buyDate: "2026-10-05" });
    expect(layout.buyPoint?.y).toBeCloseTo(layout.priceToY(99));
  });

  test("均線也包進價格範圍；收盤折線經過每根 K 棒中心", () => {
    const layout = layoutCandleChart(CANDLES, { ...options, extraPrices: [130, null] });
    expect(layout.priceToY(130)).toBeGreaterThanOrEqual(12);
    expect(layout.closePath.startsWith("M 50 ")).toBe(true);
    expect(layout.closePath.split("L")).toHaveLength(4);
  });

  test("點圖的 x 換算成第幾天，超出範圍夾到頭尾", () => {
    const layout = layoutCandleChart(CANDLES, options);
    expect(indexAtX(layout, 120)).toBe(1);
    expect(indexAtX(layout, -5)).toBe(0);
    expect(indexAtX(layout, 999)).toBe(3);
    expect(indexAtX(layoutCandleChart([], options), 10)).toBeNull();
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

describe("monthsBetween", () => {
  test("跨年、含頭尾", () => {
    expect(monthsBetween("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  test("同一個月；from 晚於 to 回空陣列", () => {
    expect(monthsBetween("2026-10-01", "2026-10-27")).toEqual(["2026-10"]);
    expect(monthsBetween("2026-11-01", "2026-10-27")).toEqual([]);
  });
});
