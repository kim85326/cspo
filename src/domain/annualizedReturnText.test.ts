import { annualizedReturnText, UNDER_ONE_YEAR } from "./annualizedReturnText";
import { makeTx } from "./ledgerTestData";
import { computePosition } from "./position";

const TODAY = "2026-10-27";

function position(price: number | null, shares = 1000) {
  const txs = [makeTx({ symbol: "2330", side: "buy", tradeDate: "2025-10-27", price: 100, shares, fee: 0 })];
  return computePosition("2330", txs, [], { type: "stock", today: TODAY, price });
}

describe("annualizedReturnText（P2-04 畫面文字，對應 docs/stories/019）", () => {
  test("有數字：+10.00%，上漲方向", () => {
    expect(annualizedReturnText({ kind: "rate", rate: 0.1 }, [position(110)])).toEqual({
      value: "+10.00%",
      reason: null,
      direction: "up",
    });
  });

  test("負的：下跌方向", () => {
    expect(annualizedReturnText({ kind: "rate", rate: -0.0523 }, [position(90)])).toEqual({
      value: "-5.23%",
      reason: null,
      direction: "down",
    });
  });

  test("四捨五入後是 0：顯示 0.00%，當持平", () => {
    expect(annualizedReturnText({ kind: "rate", rate: -0.00004 }, [position(100)])).toEqual({
      value: "0.00%",
      reason: null,
      direction: "flat",
    });
  });

  test("規格 AC：未滿一年顯示「持有未滿一年」並說明原因", () => {
    const text = annualizedReturnText({ kind: "underOneYear" }, [position(110)]);
    expect(text.value).toBe(UNDER_ONE_YEAR);
    expect(text.reason).toContain("不到 365 天");
    expect(text.direction).toBeNull();
  });

  test("沒有持股", () => {
    expect(annualizedReturnText({ kind: "unavailable" }, [])).toEqual({
      value: "—",
      reason: "沒有持股",
      direction: null,
    });
  });

  test("持有中缺價格", () => {
    expect(annualizedReturnText({ kind: "unavailable" }, [position(null)]).reason).toBe("缺少價格，暫時算不出來");
  });

  test("XIRR 無解：顯示 —，不讓 App 崩潰", () => {
    expect(annualizedReturnText({ kind: "unavailable" }, [position(110)])).toEqual({
      value: "—",
      reason: "這些買賣紀錄算不出年化報酬率",
      direction: null,
    });
  });
});
