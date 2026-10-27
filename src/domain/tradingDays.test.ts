import { tradingDayBefore, tradingDayOnOrAfter } from "./tradingDays";

// 2026-10-23（五）、10-26（一）休市
const DATES = ["2026-10-21", "2026-10-22", "2026-10-27", "2026-10-28"];

describe("tradingDayOnOrAfter", () => {
  test("當天是交易日：就是當天", () => {
    expect(tradingDayOnOrAfter("2026-10-22", DATES)).toBe("2026-10-22");
  });

  test("遇到週末或休市：順延到下一個交易日", () => {
    expect(tradingDayOnOrAfter("2026-10-24", DATES)).toBe("2026-10-27");
    expect(tradingDayOnOrAfter("2026-10-23", DATES)).toBe("2026-10-27");
  });

  test("晚於最後一筆資料：null（還沒收盤或資料還沒更新）", () => {
    expect(tradingDayOnOrAfter("2026-10-29", DATES)).toBeNull();
    expect(tradingDayOnOrAfter("2026-10-01", [])).toBeNull();
  });
});

describe("tradingDayBefore", () => {
  test("前一個交易日，跳過休市", () => {
    expect(tradingDayBefore("2026-10-27", DATES)).toBe("2026-10-22");
    expect(tradingDayBefore("2026-10-22", DATES)).toBe("2026-10-21");
  });

  test("資料範圍不夠：null", () => {
    expect(tradingDayBefore("2026-10-21", DATES)).toBeNull();
  });
});
