import { SECURITY_TYPE_LABEL, securityTypeOf, toStockInfo } from "./security";

describe("securityTypeOf（對應 docs/stories/007）", () => {
  test("0050、00878 是 ETF，2330 是個股", () => {
    expect(securityTypeOf("0050")).toBe("etf");
    expect(securityTypeOf("00878")).toBe("etf");
    expect(securityTypeOf("2330")).toBe("stock");
  });

  test("上櫃 ETF（006201、帶字母的債券 ETF 00679B）也是 ETF", () => {
    expect(securityTypeOf("006201")).toBe("etf");
    expect(securityTypeOf("00679B")).toBe("etf");
    expect(securityTypeOf("00631L")).toBe("etf");
  });

  test("上櫃個股 5347 是個股", () => {
    expect(securityTypeOf("5347")).toBe("stock");
  });

  test("簡化規則的已知限制：ETN 與特別股會被當成個股", () => {
    expect(securityTypeOf("020001")).toBe("stock");
    expect(securityTypeOf("8349A")).toBe("stock");
  });
});

describe("toStockInfo", () => {
  test("帶上類型與市場", () => {
    expect(toStockInfo({ symbol: "006201", name: "元大富櫃50" }, "TPEx")).toEqual({
      symbol: "006201",
      name: "元大富櫃50",
      type: "etf",
      market: "TPEx",
    });
  });

  test("標籤文字", () => {
    expect(SECURITY_TYPE_LABEL.stock).toBe("個股");
    expect(SECURITY_TYPE_LABEL.etf).toBe("ETF");
  });
});
