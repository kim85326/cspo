import {
  calculatePnl,
  formatReturnRate,
  formatSignedAmount,
  pnlDirection,
  validateHoldingInput,
} from "./pnl";

describe("calculatePnl（對應 docs/stories/001）", () => {
  const holding = { symbol: "2330", buyPrice: 500, shares: 1000 };

  test("賺錢：500 買、現價 520、1000 股 → +20,000", () => {
    const r = calculatePnl(holding, 520);
    expect(r.cost).toBe(500_000);
    expect(r.marketValue).toBe(520_000);
    expect(r.pnl).toBe(20_000);
    expect(r.returnRate).toBeCloseTo(0.04);
  });

  test("虧錢：500 買、現價 480 → -20,000", () => {
    const r = calculatePnl(holding, 480);
    expect(r.pnl).toBe(-20_000);
    expect(r.returnRate).toBeCloseTo(-0.04);
  });

  test("平盤：現價等於買入價 → 0", () => {
    const r = calculatePnl(holding, 500);
    expect(r.pnl).toBe(0);
    expect(r.returnRate).toBe(0);
  });

  test("小數價格不出現浮點誤差", () => {
    const r = calculatePnl({ symbol: "2330", buyPrice: 500.5, shares: 3 }, 510.1);
    expect(r.cost).toBe(1501.5);
    expect(r.marketValue).toBe(1530.3);
    expect(r.pnl).toBe(28.8);
  });

  test("零股也能算", () => {
    const r = calculatePnl({ symbol: "2330", buyPrice: 500, shares: 7 }, 520);
    expect(r.pnl).toBe(140);
  });
});

describe("pnlDirection（台股漲紅跌綠）", () => {
  test.each([
    [1, "up"],
    [-1, "down"],
    [0, "flat"],
  ])("pnl=%p → %s", (pnl, expected) => {
    expect(pnlDirection(pnl)).toBe(expected);
  });
});

describe("formatSignedAmount", () => {
  test.each([
    [20000, "+20,000"],
    [-20000, "-20,000"],
    [0, "0"],
    [1234567.4, "+1,234,567"],
    [-0.4, "0"],
  ])("%p → %s", (n, expected) => {
    expect(formatSignedAmount(n)).toBe(expected);
  });
});

describe("formatReturnRate", () => {
  test.each([
    [0.04, "+4.00%"],
    [-0.04, "-4.00%"],
    [0, "0.00%"],
  ])("%p → %s", (n, expected) => {
    expect(formatReturnRate(n)).toBe(expected);
  });
});

describe("validateHoldingInput", () => {
  test("正常輸入通過並轉成數字", () => {
    const r = validateHoldingInput({ symbol: " 2330 ", buyPrice: "500", shares: "1000" });
    expect(r).toEqual({ ok: true, holding: { symbol: "2330", buyPrice: 500, shares: 1000 } });
  });

  test("代號不是台股代號格式", () => {
    const r = validateHoldingInput({ symbol: "abc", buyPrice: "500", shares: "1000" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.symbol).toBeDefined();
  });

  test.each(["00631L", "00632R", "00625K", "01001T", "2881A"])(
    "代號尾端帶一個英文字母也通過：%s（槓桿／反向 ETF、REITs、特別股）",
    (symbol) => {
      const r = validateHoldingInput({ symbol, buyPrice: "100", shares: "1000" });
      expect(r).toEqual({ ok: true, holding: { symbol, buyPrice: 100, shares: 1000 } });
    },
  );

  test("小寫字母轉成大寫：00631l → 00631L", () => {
    const r = validateHoldingInput({ symbol: "00631l", buyPrice: "100", shares: "1000" });
    expect(r.ok && r.holding.symbol).toBe("00631L");
  });

  test.each(["L00631", "00631LL", "123L", "2330-A"])("代號格式不對：%s", (symbol) => {
    const r = validateHoldingInput({ symbol, buyPrice: "100", shares: "1000" });
    expect(r.ok).toBe(false);
  });

  test("買入價為空或 0", () => {
    expect(validateHoldingInput({ symbol: "2330", buyPrice: "", shares: "1" }).ok).toBe(false);
    expect(validateHoldingInput({ symbol: "2330", buyPrice: "0", shares: "1" }).ok).toBe(false);
  });

  test("數量不是正整數", () => {
    expect(validateHoldingInput({ symbol: "2330", buyPrice: "500", shares: "1.5" }).ok).toBe(false);
    expect(validateHoldingInput({ symbol: "2330", buyPrice: "500", shares: "-1" }).ok).toBe(false);
  });

  test("買入日期選填：沒填就不帶 buyDate", () => {
    const r = validateHoldingInput({ symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "" });
    expect(r.ok && "buyDate" in r.holding).toBe(false);
  });

  test("買入日期有填：轉成 ISO", () => {
    const r = validateHoldingInput(
      { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/10/5" },
      new Date(2026, 9, 27),
    );
    expect(r).toEqual({
      ok: true,
      holding: { symbol: "2330", buyPrice: 500, shares: 1000, buyDate: "2026-10-05" },
    });
  });

  test("買入日期不對：只有 buyDate 有錯", () => {
    const r = validateHoldingInput(
      { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/10/28" },
      new Date(2026, 9, 27),
    );
    expect(r).toEqual({ ok: false, errors: { buyDate: "買入日期不能晚於今天" } });
  });

  test("多個欄位同時錯誤會全部回報", () => {
    const r = validateHoldingInput({ symbol: "", buyPrice: "", shares: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["buyPrice", "shares", "symbol"]);
  });
});
