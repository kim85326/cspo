import {
  calcFee,
  calcTax,
  DEFAULT_USER_SETTINGS,
  defaultTaxRate,
  estimateTrade,
  floorMoney,
} from "./fees";

describe("floorMoney（浮點數取整）", () => {
  test("差一點點到整數時進到整數，不會少 1 元", () => {
    expect(floorMoney(854.9999999999)).toBe(855);
    expect(floorMoney(0.57 * 100)).toBe(57); // JS 算出 56.99999999999999
  });

  test("真的有小數就捨去", () => {
    expect(floorMoney(855.0)).toBe(855);
    expect(floorMoney(712.5)).toBe(712);
    expect(floorMoney(854.99)).toBe(854);
    expect(floorMoney(0.999999)).toBe(0);
  });

  test("0 還是 0", () => {
    expect(floorMoney(0)).toBe(0);
  });
});

describe("defaultTaxRate", () => {
  test("個股 0.003、ETF 0.001", () => {
    expect(defaultTaxRate("stock")).toBe(0.003);
    expect(defaultTaxRate("etf")).toBe(0.001);
  });
});

describe("calcFee（規格 3.2）", () => {
  test("3.7 步驟 1：600,000 → 855", () => {
    expect(calcFee(600_000, 1000, DEFAULT_USER_SETTINGS)).toBe(855);
  });

  test("3.7 步驟 2：500,000 → floor(712.5) = 712", () => {
    expect(calcFee(500_000, 1000, DEFAULT_USER_SETTINGS)).toBe(712);
  });

  test("3.7 步驟 3：325,000 → floor(463.125) = 463", () => {
    expect(calcFee(325_000, 500, DEFAULT_USER_SETTINGS)).toBe(463);
  });

  test("零股：0050 買 30 股 @ 150 → max(floor(6.41), 1) = 6", () => {
    expect(calcFee(150 * 30, 30, DEFAULT_USER_SETTINGS)).toBe(6);
  });

  test("整股最低手續費：1000 股 @ 10 算出 14.25 → 20", () => {
    expect(calcFee(10_000, 1000, DEFAULT_USER_SETTINGS)).toBe(20);
  });

  test("零股最低手續費：1 股 @ 10 算出 0.01 → 1", () => {
    expect(calcFee(10, 1, DEFAULT_USER_SETTINGS)).toBe(1);
  });

  test("999 股算零股、1000 股算整股", () => {
    expect(calcFee(9_990, 999, DEFAULT_USER_SETTINGS)).toBe(14);
    expect(calcFee(10_000, 1000, DEFAULT_USER_SETTINGS)).toBe(20);
  });

  test("折扣 0.28（M-09）：1000 股 @ 600 → floor(239.4) = 239", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 };
    expect(calcFee(600_000, 1000, settings)).toBe(239);
  });

  test("最低手續費可在設定修改", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, minFeeBoardLot: 1, minFeeOddLot: 5 };
    expect(calcFee(10_000, 1000, settings)).toBe(14);
    expect(calcFee(10, 1, settings)).toBe(5);
  });
});

describe("calcTax（規格 3.2）", () => {
  test("個股：325,000 × 0.003 = 975", () => {
    expect(calcTax(325_000, 0.003)).toBe(975);
  });

  test("個股：930,000 × 0.003 = 2,790", () => {
    expect(calcTax(930_000, 0.003)).toBe(2790);
  });

  test("ETF：4,567 × 0.001 = floor(4.567) = 4", () => {
    expect(calcTax(4_567, 0.001)).toBe(4);
  });

  test("免稅（例如債券 ETF 覆寫成 0）", () => {
    expect(calcTax(100_000, 0)).toBe(0);
  });
});

describe("estimateTrade（M-02 預估總金額）", () => {
  test("買入：金額 + 手續費，沒有證交稅", () => {
    expect(estimateTrade("buy", 600, 1000, DEFAULT_USER_SETTINGS, 0.003)).toEqual({
      amount: 600_000,
      fee: 855,
      tax: 0,
      total: 600_855,
    });
  });

  test("賣出：金額 − 手續費 − 證交稅（3.7 步驟 3 淨額 323,562）", () => {
    expect(estimateTrade("sell", 650, 500, DEFAULT_USER_SETTINGS, 0.003)).toEqual({
      amount: 325_000,
      fee: 463,
      tax: 975,
      total: 323_562,
    });
  });
});
