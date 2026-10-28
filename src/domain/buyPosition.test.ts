import {
  bandEdges,
  buyPosition,
  buyPositionSentence,
  COMPARE_PERIODS,
  compareStart,
  comparisonChartCandles,
  DEFAULT_COMPARE_PERIOD,
  earliestCustomStart,
  levelOf,
  listingNote,
  validateCustomStart,
} from "./buyPosition";
import type { Candle } from "./types";

const BUY_DATE = "2026-10-05";

/** 買入日前連續 n 個工作日，收盤依序是 closes（由舊到新）；開高低跟收盤一樣就好 */
function daysBefore(buyDate: string, closes: number[]): Candle[] {
  const dates: string[] = [];
  const d = new Date(`${buyDate}T00:00:00Z`);
  while (dates.length < closes.length) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
  }
  return dates.map((date, i) => ({ date, open: closes[i], high: closes[i], low: closes[i], close: closes[i] }));
}

/** n 天裡有 below 天收盤 90（低於買入價 100），其餘 110 */
function mixed(n: number, below: number): number[] {
  return Array.from({ length: n }, (_, i) => (i < below ? 90 : 110));
}

describe("buyPosition（P2-09 買在高點還是低點）", () => {
  test("規格範例：100 個交易日有 85 天收盤低於買入價 → 85%、高檔", () => {
    const candles = daysBefore(BUY_DATE, mixed(100, 85));
    const position = buyPosition(candles, [], BUY_DATE, 100, 6);
    expect(position).toMatchObject({ kind: "ok", level: "high", percent: 85, below: 85, days: 100 });
    // 100 個工作日只有約 4.6 個月，在 6 個月期間裡算「上市以來」；句型另外驗：
    expect(buyPositionSentence({ ...position, listedMonths: undefined } as typeof position, 12)).toBe(
      "你買在近 1 年的高檔，買入價高於 85% 的交易日",
    );
  });

  test("剛好 80% 是高檔、剛好 20% 是低檔，中間是中段", () => {
    expect(levelOf(80, 100)).toBe("high");
    expect(levelOf(79, 100)).toBe("middle");
    expect(levelOf(21, 100)).toBe("middle");
    expect(levelOf(20, 100)).toBe("low");
    // 不能被小數誤差騙：4/5 與 1/5
    expect(levelOf(4, 5)).toBe("high");
    expect(levelOf(1, 5)).toBe("low");
  });

  test("只用買入日之前的收盤：買入當天和之後的日子不算", () => {
    const before = daysBefore(BUY_DATE, mixed(30, 30));
    const after: Candle[] = [
      { date: "2026-10-05", open: 200, high: 200, low: 200, close: 200 },
      { date: "2026-10-06", open: 200, high: 200, low: 200, close: 200 },
    ];
    expect(buyPosition([...before, ...after], [], BUY_DATE, 100, 3)).toMatchObject({ days: 30, percent: 100 });
  });

  test("比較區間外（更早）的日子不算", () => {
    const candles = daysBefore(BUY_DATE, mixed(300, 0));
    // 1 個月前到買入日前一天：2026-09-07～2026-10-02，20 個工作日
    expect(buyPosition(candles, [], BUY_DATE, 100, 1)).toMatchObject({ days: 20, from: "2026-09-07" });
  });

  test("交易日少於 20 天：資料不足，不下結論", () => {
    const position = buyPosition(daysBefore(BUY_DATE, mixed(19, 10)), [], BUY_DATE, 100, 1);
    expect(position).toEqual({ kind: "insufficient", days: 19 });
    expect(buyPositionSentence(position, 1)).toBe("資料不足，無法判斷");
  });

  test("買入價高於區間最高 → 100%；低於最低 → 0%，照常判斷", () => {
    const candles = daysBefore(BUY_DATE, mixed(40, 20));
    expect(buyPosition(candles, [], BUY_DATE, 999, 3)).toMatchObject({ percent: 100, level: "high" });
    expect(buyPosition(candles, [], BUY_DATE, 1, 3)).toMatchObject({ percent: 0, level: "low" });
  });

  test("用還原收盤價：除息前的日子扣掉股利再比", () => {
    // 前 20 天收 103、除息日起 20 天收 98；除息 5 元 → 除息前還原成 98 左右
    const closes = [...Array(20).fill(103), ...Array(20).fill(98)];
    const candles = daysBefore(BUY_DATE, closes);
    const exDate = candles[20].date;
    const dividend = { kind: "dividend" as const, symbol: "2330", exDate, cashPerShare: 5, stockPerThousand: 0, payDate: null };
    // 不還原：前 20 天 103 > 100，只有後 20 天低於買入價 → 50%
    expect(buyPosition(candles, [], BUY_DATE, 100, 3)).toMatchObject({ percent: 50 });
    // 還原：103 × (98/103) = 98 < 100 → 全部低於買入價
    expect(buyPosition(candles, [dividend], BUY_DATE, 100, 3)).toMatchObject({ percent: 100 });
  });

  test("上市時間短於所選期間：用上市以來的資料，並註明", () => {
    const candles = daysBefore(BUY_DATE, mixed(60, 30)); // 約 3 個月
    const position = buyPosition(candles, [], BUY_DATE, 100, 12);
    expect(position).toMatchObject({ kind: "ok", days: 60, listedMonths: 3 });
    expect(buyPositionSentence(position, 12)).toBe("你買在上市以來的中段，買入價高於 50% 的交易日");
    expect(listingNote(position, 12)).toBe("上市未滿 1 年，以上市以來 3 個月計算");
  });

  test("資料涵蓋整個期間：沒有上市註明", () => {
    const position = buyPosition(daysBefore(BUY_DATE, mixed(300, 30)), [], BUY_DATE, 100, 6);
    expect(listingNote(position, 6)).toBeNull();
  });

  test("結論只陳述事實：不含「建議」「應該」「買進」「賣出」", () => {
    const sentences = [0, 10, 50, 85, 100].flatMap((below) =>
      [1, 3, 6, 12, 36, { start: "2025-01-02" }].map((period) =>
        buyPositionSentence(buyPosition(daysBefore(BUY_DATE, mixed(100, below)), [], BUY_DATE, 100, 12), period),
      ),
    );
    sentences.push(buyPositionSentence({ kind: "insufficient", days: 3 }, 3));
    for (const sentence of sentences) expect(sentence).not.toMatch(/建議|應該|買進|賣出/);
  });

  test("比較區間選項：3 個月、6 個月、1 年（預設）、3 年", () => {
    expect([...COMPARE_PERIODS]).toEqual([3, 6, 12, 36]);
    expect(DEFAULT_COMPARE_PERIOD).toBe(12);
  });

  test("3 年：比較買入日前 36 個月", () => {
    const candles = daysBefore(BUY_DATE, mixed(900, 450));
    const position = buyPosition(candles, [], BUY_DATE, 100, 36);
    expect(compareStart(BUY_DATE, 36)).toBe("2023-10-05");
    expect(position).toMatchObject({ kind: "ok", from: "2023-10-05" });
    expect(buyPositionSentence(position, 36)).toMatch(/^你買在近 3 年的/);
  });

  test("自訂起始日：從那天算到買入日前一天，句子寫「yyyy/mm/dd 以來」", () => {
    const candles = daysBefore(BUY_DATE, mixed(300, 0));
    const range = { start: "2026-08-03" };
    const position = buyPosition(candles, [], BUY_DATE, 200, range);
    expect(position).toMatchObject({ kind: "ok", from: "2026-08-03", to: "2026-10-02", percent: 100 });
    expect(buyPositionSentence(position, range)).toBe("你買在 2026/08/03 以來的高檔，買入價高於 100% 的交易日");
  });

  test("自訂起始日早於買入日前 3 年：不可選取", () => {
    expect(earliestCustomStart(BUY_DATE)).toBe("2023-10-05");
    expect(validateCustomStart("2023-10-05", BUY_DATE)).toBeNull();
    expect(validateCustomStart("2023-10-04", BUY_DATE)).toBe("最早只能選到 2023/10/05（買入日前 3 年）");
    expect(validateCustomStart("2026-10-05", BUY_DATE)).toBe("起始日要在買入日之前");
    expect(validateCustomStart("2026-10-04", BUY_DATE)).toBeNull();
  });

  test("自訂起始日早於上市日：註明以上市以來計算", () => {
    const candles = daysBefore(BUY_DATE, mixed(60, 30));
    const range = { start: "2024-01-02" };
    const position = buyPosition(candles, [], BUY_DATE, 100, range);
    expect(listingNote(position, range)).toBe("上市日晚於所選起始日，以上市以來 3 個月計算");
  });

  test("色帶邊界跟高檔／低檔判斷一致：買入價 > highAbove 才是高檔、≤ lowUpTo 才是低檔", () => {
    // 不規則的收盤價，含重複值
    const closes = [12, 7, 7, 30, 18, 25, 9, 14, 14, 21, 11, 16, 28, 5, 19, 23, 8, 13, 26, 17, 10, 22, 15];
    const edges = bandEdges(closes);
    expect(edges).not.toBeNull();
    for (let price = 4; price <= 31; price += 0.5) {
      const below = closes.filter((c) => c < price).length;
      const level = levelOf(below, closes.length);
      expect(level === "high").toBe(price > edges!.highAbove);
      expect(level === "low").toBe(price <= edges!.lowUpTo);
    }
  });

  test("色帶：100 天 1～100 元，高檔區在 80 元以上、低檔區到 21 元為止", () => {
    const closes = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(bandEdges(closes)).toEqual({ highAbove: 80, lowUpTo: 21 });
    expect(bandEdges([])).toBeNull();
  });

  test("區間圖的 K 棒：用還原價，最後接上買入那天（買在週末就接下一個交易日）", () => {
    const closes = [...Array(20).fill(103), ...Array(20).fill(98)];
    const candles = daysBefore("2026-10-03", closes); // 10/03 是週六
    const dividend = {
      kind: "dividend" as const,
      symbol: "2330",
      exDate: candles[20].date,
      cashPerShare: 5,
      stockPerThousand: 0,
      payDate: null,
    };
    const monday = { date: "2026-10-05", open: 99, high: 101, low: 97, close: 100 };
    const chart = comparisonChartCandles([...candles, monday], [dividend], "2026-10-03", "2026-07-01");
    expect(chart).toHaveLength(41);
    expect(chart[0].close).toBeCloseTo(98, 6);
    expect(chart[0].high).toBeCloseTo(98, 6);
    expect(chart[39].close).toBe(98);
    expect(chart[40]).toEqual(monday);
  });
});
