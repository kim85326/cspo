import { parseRocSlashDate, parseTwseDayCandles } from "./twseDayParse";

// 證交所 STOCK_DAY 實際回應的形狀（2026/10 的 2330，節錄）
const OK_BODY = {
  stat: "OK",
  date: "20261001",
  fields: ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差", "成交筆數", "註記"],
  data: [
    ["115/10/02", "15,792,206", "39,508,159,297", "2,505.00", "2,515.00", "2,495.00", "2,500.00", "-10.00", "65,783", ""],
    ["115/10/01", "20,666,092", "51,702,445,610", "2,490.00", "2,510.00", "2,485.00", "2,510.00", "+30.00", "57,634", ""],
    ["115/10/05", "0", "0", "--", "--", "--", "--", " 0.00", "0", ""],
  ],
};

describe("parseTwseDayCandles", () => {
  test("轉成 Candle、去千分位、依日期排序、略過沒成交的列", () => {
    expect(parseTwseDayCandles(OK_BODY)).toEqual([
      { date: "2026-10-01", open: 2490, high: 2510, low: 2485, close: 2510 },
      { date: "2026-10-02", open: 2505, high: 2515, low: 2495, close: 2500 },
    ]);
  });

  test.each([
    [{ stat: "很抱歉，沒有符合條件的資料!", total: 0 }],
    [{ stat: "查詢日期大於今日，請重新查詢!", total: 0 }],
    [{ stat: "OK" }],
    [null],
    ["not json"],
  ])("沒資料或格式不對 → 空陣列：%p", (body) => {
    expect(parseTwseDayCandles(body)).toEqual([]);
  });
});

describe("parseRocSlashDate", () => {
  test("民國年轉西元 ISO", () => {
    expect(parseRocSlashDate("115/10/01")).toBe("2026-10-01");
    expect(parseRocSlashDate("99/01/04")).toBe("2010-01-04");
  });

  test("格式不對回 undefined", () => {
    expect(parseRocSlashDate("2026-10-01")).toBeUndefined();
    expect(parseRocSlashDate(undefined)).toBeUndefined();
  });
});
