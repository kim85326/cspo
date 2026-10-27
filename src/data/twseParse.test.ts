import { formatTwseDate, parseTwsePrice, parseTwseRows, type TwseRow } from "./twseParse";

describe("parseTwsePrice", () => {
  test.each([
    ["2385.00", 2385],
    ["106.90", 106.9],
    ["14.41", 14.41],
    ["1,234.50", 1234.5],
    [" 520 ", 520],
  ])("%s → %s", (raw, expected) => {
    expect(parseTwsePrice(raw)).toBe(expected);
  });

  test.each([["--"], [""], ["   "], ["N/A"], ["0"], ["-5"], ["abc"]])(
    "%s → null",
    (raw) => {
      expect(parseTwsePrice(raw)).toBeNull();
    },
  );

  test("undefined → null", () => {
    expect(parseTwsePrice(undefined)).toBeNull();
  });
});

describe("formatTwseDate", () => {
  test("民國年轉西元：1151022 → 2026/10/22", () => {
    expect(formatTwseDate("1151022")).toBe("2026/10/22");
  });

  test("格式不對回 undefined", () => {
    expect(formatTwseDate("")).toBeUndefined();
    expect(formatTwseDate("2026-10-22")).toBeUndefined();
    expect(formatTwseDate(undefined)).toBeUndefined();
  });
});

describe("parseTwseRows", () => {
  const rows: TwseRow[] = [
    { Date: "1151022", Code: "2330", Name: "台積電", ClosingPrice: "2385.00" },
    { Date: "1151022", Code: "0050", Name: "元大台灣50", ClosingPrice: "106.90" },
    { Date: "1151022", Code: "00625K", Name: "富邦上証+R", ClosingPrice: "" },
    { Date: "1151022", Code: "9999", Name: "停牌股", ClosingPrice: "--" },
    { Date: "1151022", Code: "1234", Name: "千分位", ClosingPrice: "1,234.50" },
    { Date: "1151022", Code: "", Name: "沒代號", ClosingPrice: "10.00" },
    { Date: "1151022", Code: "5555", Name: "", ClosingPrice: "10.00" },
    { Date: "1151022", Code: "2330", Name: "台積電重複", ClosingPrice: "1.00" },
  ];

  test("只留代號、名稱、收盤價都有效的列，並帶資料日期", () => {
    expect(parseTwseRows(rows)).toEqual([
      { symbol: "2330", name: "台積電", price: 2385, asOf: "2026/10/22" },
      { symbol: "0050", name: "元大台灣50", price: 106.9, asOf: "2026/10/22" },
      { symbol: "1234", name: "千分位", price: 1234.5, asOf: "2026/10/22" },
    ]);
  });

  test("沒有 Date 欄位時不帶 asOf", () => {
    expect(parseTwseRows([{ Code: "2317", Name: "鴻海", ClosingPrice: "245.00" }])).toEqual([
      { symbol: "2317", name: "鴻海", price: 245 },
    ]);
  });

  test("回應不是陣列或列不是物件 → 忽略", () => {
    expect(parseTwseRows(null)).toEqual([]);
    expect(parseTwseRows({ error: "x" })).toEqual([]);
    expect(parseTwseRows([null, "x", 1])).toEqual([]);
  });
});
