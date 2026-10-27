import { DEFAULT_USER_SETTINGS } from "./fees";
import {
  autoCosts,
  estimatedTotal,
  parseTransactionForm,
  toHalfWidthNumber,
  type TransactionFormValues,
} from "./transactionForm";

const TODAY = new Date(2026, 9, 27);

function values(fields: Partial<TransactionFormValues>): TransactionFormValues {
  return { side: "buy", tradeDate: "2026/10/27", price: "", shares: "", fee: "", tax: "", note: "", ...fields };
}

describe("toHalfWidthNumber（對應 docs/stories/009）", () => {
  test("全形數字、全形小數點、千分位逗號都轉成半形數字", () => {
    expect(toHalfWidthNumber("６００．５")).toBe("600.5");
    expect(toHalfWidthNumber("1,000")).toBe("1000");
    expect(toHalfWidthNumber("１，０００")).toBe("1000");
  });
});

describe("autoCosts：依規格 3.2 自動帶入手續費與證交稅", () => {
  test("3.7 步驟 1：買 1000 股 @ 600 → 手續費 855、稅 0", () => {
    expect(autoCosts("buy", "600", "1000", DEFAULT_USER_SETTINGS, 0.003)).toEqual({ fee: "855", tax: "0" });
  });

  test("3.7 步驟 2：買 1000 股 @ 500 → 手續費 712", () => {
    expect(autoCosts("buy", "500", "1000", DEFAULT_USER_SETTINGS, 0.003)?.fee).toBe("712");
  });

  test("3.7 步驟 3：賣 500 股 @ 650 → 手續費 463、證交稅 975", () => {
    expect(autoCosts("sell", "650", "500", DEFAULT_USER_SETTINGS, 0.003)).toEqual({ fee: "463", tax: "975" });
  });

  test("零股範例：0050 買 30 股 @ 150 → 手續費 6", () => {
    expect(autoCosts("buy", "150", "30", DEFAULT_USER_SETTINGS, 0.001)?.fee).toBe("6");
  });

  test("ETF 賣出用 0.1% 證交稅", () => {
    expect(autoCosts("sell", "150", "1000", DEFAULT_USER_SETTINGS, 0.001)?.tax).toBe("150");
  });

  test("價格或股數還不完整時不算（回 null）", () => {
    expect(autoCosts("buy", "", "1000", DEFAULT_USER_SETTINGS, 0.003)).toBeNull();
    expect(autoCosts("buy", "600", "1.5", DEFAULT_USER_SETTINGS, 0.003)).toBeNull();
    expect(autoCosts("buy", "0", "1000", DEFAULT_USER_SETTINGS, 0.003)).toBeNull();
  });
});

describe("estimatedTotal：預估總金額", () => {
  test("買入 = 成交金額 + 手續費", () => {
    expect(estimatedTotal(values({ price: "600", shares: "1000", fee: "855" }))).toBe(600855);
  });

  test("賣出 = 成交金額 − 手續費 − 證交稅（3.7 步驟 3 淨額 323,562）", () => {
    expect(estimatedTotal(values({ side: "sell", price: "650", shares: "500", fee: "463", tax: "975" }))).toBe(323562);
  });

  test("用欄位上（可能被手動改過）的手續費", () => {
    expect(estimatedTotal(values({ price: "600", shares: "1000", fee: "300" }))).toBe(600300);
  });

  test("買入時證交稅欄位的值不算進去", () => {
    expect(estimatedTotal(values({ price: "600", shares: "1000", fee: "855", tax: "999" }))).toBe(600855);
  });

  test("欄位不完整時回 null", () => {
    expect(estimatedTotal(values({ price: "600", shares: "1000", fee: "" }))).toBeNull();
  });
});

describe("parseTransactionForm：M-02 驗證規則", () => {
  test("合法的賣出轉成數字，日期轉成 ISO，備註去空白", () => {
    const result = parseTransactionForm(
      values({ side: "sell", tradeDate: "2026/03/05", price: "650", shares: "500", fee: "463", tax: "975", note: " 停利 " }),
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      value: { side: "sell", tradeDate: "2026-03-05", price: 650, shares: 500, fee: 463, tax: 975, note: "停利" },
    });
  });

  test("買入的證交稅一律是 0；空白備註是 undefined", () => {
    const result = parseTransactionForm(values({ price: "600", shares: "1000", fee: "855", tax: "12" }), TODAY);
    expect(result.ok && result.value.tax).toBe(0);
    expect(result.ok && result.value.note).toBeUndefined();
  });

  test("成交價要 > 0、股數要正整數", () => {
    const result = parseTransactionForm(values({ price: "0", shares: "1.5", fee: "20" }), TODAY);
    expect(result).toEqual({
      ok: false,
      errors: { price: "成交價必須大於 0", shares: "股數必須是大於 0 的整數" },
    });
  });

  test("日期不可晚於今天、不可空白", () => {
    const future = parseTransactionForm(values({ tradeDate: "2026/10/28", price: "1", shares: "1", fee: "1" }), TODAY);
    expect(!future.ok && future.errors.tradeDate).toBe("交易日期不能晚於今天");
    const empty = parseTransactionForm(values({ tradeDate: "", price: "1", shares: "1", fee: "1" }), TODAY);
    expect(!empty.ok && empty.errors.tradeDate).toBe("請選擇交易日期");
  });

  test("手續費被清空、賣出的證交稅被清空都要擋", () => {
    const result = parseTransactionForm(values({ side: "sell", price: "1", shares: "1", fee: "", tax: "" }), TODAY);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(["fee", "tax"]);
  });
});
