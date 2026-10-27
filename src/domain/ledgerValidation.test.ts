import { DEFAULT_USER_SETTINGS } from "./fees";
import { makeDividend, makeTx, spec37, spec37Ledger } from "./ledgerTestData";
import type { Ledger } from "./ledgerTypes";
import {
  validateDividend,
  validateLedger,
  validateLedgerChange,
  validateTransaction,
} from "./ledgerValidation";
import { computePosition } from "./position";

const TODAY = "2026-10-27";

function positionOf(ledger: Ledger, symbol = "2330") {
  return computePosition(symbol, ledger.transactions, ledger.dividends, { type: "stock", today: TODAY });
}

describe("validateLedgerChange：賣出超過持股（規格 3.7 錯誤範例，對應 docs/stories/006）", () => {
  test("持有 1500 股時賣 2000 股 → 拒絕，提示「賣出股數超過持有股數（1,500 股）」", () => {
    const sell = makeTx({ id: "big-sell", side: "sell", tradeDate: "2026-04-01", price: 650, shares: 2000, fee: 1852, tax: 3900 });
    const r = validateLedgerChange(spec37Ledger(), { kind: "addTransaction", transaction: sell }, TODAY);
    expect(r).toEqual({
      ok: false,
      error: {
        code: "oversell",
        message: "賣出股數超過持有股數（1,500 股）",
        symbol: "2330",
        transactionId: "big-sell",
        held: 1500,
      },
    });
  });

  test("剛好賣光 1500 股 → 通過，回傳新的 ledger，原本的 ledger 不變", () => {
    const ledger = spec37Ledger();
    const sell = makeTx({ side: "sell", tradeDate: "2026-04-01", price: 650, shares: 1500, fee: 1389, tax: 2925 });
    const r = validateLedgerChange(ledger, { kind: "addTransaction", transaction: sell }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ledger.transactions).toHaveLength(4);
    expect(ledger.transactions).toHaveLength(3);
    expect(positionOf(r.ledger).shares).toBe(0);
  });

  test("賣出日期早於買入（當時還沒有持股）→ 拒絕", () => {
    const early = makeTx({ id: "early", side: "sell", tradeDate: "2026-01-01", price: 600, shares: 100, fee: 85, tax: 180 });
    const r = validateLedgerChange(spec37Ledger(), { kind: "addTransaction", transaction: early }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "oversell", transactionId: "early", held: 0 });
    expect(r.error.message).toBe("賣出股數超過持有股數（0 股）");
  });

  test("插在中間的賣出會讓後面的賣出不夠 → 拒絕，並說是後面那一筆", () => {
    // 步驟 2 和 3 之間賣 1800 股：自己夠賣（2000），但步驟 3 只剩 200 股可賣
    const mid = makeTx({ id: "mid", side: "sell", tradeDate: "2026-02-20", price: 550, shares: 1800, fee: 1410, tax: 2970 });
    const r = validateLedgerChange(spec37Ledger(), { kind: "addTransaction", transaction: mid }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "oversell", transactionId: "step3", held: 200 });
    expect(r.error.message).toBe(
      "2026-03-05 賣出 500 股的那筆交易會超過當時持有股數（200 股），請先修改或刪除那筆賣出",
    );
  });

  test("把賣出改成超過持股 → 拒絕", () => {
    const edited = { ...spec37.step3, shares: 2500 };
    const r = validateLedgerChange(spec37Ledger(), { kind: "updateTransaction", transaction: edited }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toBe("賣出股數超過持有股數（2,000 股）");
  });

  test("把買入的日期改到賣出之後，導致賣出不足 → 拒絕", () => {
    const moved = { ...spec37.step1, tradeDate: "2026-05-01" };
    const r = validateLedgerChange(spec37Ledger(), { kind: "updateTransaction", transaction: moved }, TODAY);
    // 步驟 3 當時只剩步驟 2 的 1000 股，仍夠賣 500 → 通過
    expect(r.ok).toBe(true);
    const moved2 = { ...spec37.step2, tradeDate: "2026-05-01" };
    const r2 = validateLedgerChange(
      (r as { ledger: Ledger }).ledger,
      { kind: "updateTransaction", transaction: moved2 },
      TODAY,
    );
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error).toMatchObject({ code: "oversell", transactionId: "step3", held: 0 });
  });

  test("把賣出的代號改成別檔：新代號沒有持股 → 拒絕", () => {
    const edited = { ...spec37.step3, symbol: "2317" };
    const r = validateLedgerChange(spec37Ledger(), { kind: "updateTransaction", transaction: edited }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "oversell", symbol: "2317" });
  });
});

describe("validateLedgerChange：刪除交易（M-02）", () => {
  test("刪除步驟 2 的買入 → 剩 1000 股、賣 500 仍成立，刪除成功並重算", () => {
    const r = validateLedgerChange(spec37Ledger(), { kind: "deleteTransaction", id: "step2" }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = positionOf(r.ledger);
    expect(p.shares).toBe(500);
    expect(p.costBasis).toBeCloseTo(300_427.5, 6);
    // 323,562 − 600,855 × 500 / 1000
    expect(p.realizedPnl).toBeCloseTo(23_134.5, 6);
  });

  test("刪除步驟 1 和 2 → 步驟 3 會賣出超過持股，刪除被拒絕並說是哪一筆", () => {
    const afterStep1 = validateLedgerChange(spec37Ledger(), { kind: "deleteTransaction", id: "step1" }, TODAY);
    // 只刪步驟 1 時，步驟 3 還有步驟 2 的 1000 股可賣
    expect(afterStep1.ok).toBe(true);
    if (!afterStep1.ok) return;

    const r = validateLedgerChange(afterStep1.ledger, { kind: "deleteTransaction", id: "step2" }, TODAY);
    expect(r).toEqual({
      ok: false,
      error: {
        code: "oversell",
        message: "2026-03-05 賣出 500 股的那筆交易會超過當時持有股數（0 股），請先修改或刪除那筆賣出",
        symbol: "2330",
        transactionId: "step3",
        held: 0,
      },
    });
    // 被拒絕的變更不影響原本的資料
    expect(afterStep1.ledger.transactions.map((t) => t.id)).toEqual(["step2", "step3"]);
  });

  test("刪除賣出永遠可以", () => {
    const r = validateLedgerChange(spec37Ledger(), { kind: "deleteTransaction", id: "step3" }, TODAY);
    expect(r.ok).toBe(true);
  });

  test("刪除不存在的交易 → notFound", () => {
    const r = validateLedgerChange(spec37Ledger(), { kind: "deleteTransaction", id: "nope" }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("notFound");
  });
});

describe("validateLedgerChange：股利（M-03）", () => {
  const buy = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 99.8, shares: 1000, fee: 200 });
  const stockDiv = makeDividend({ id: "sd", type: "stock", exDate: "2026-07-01", stockShares: 100 });
  const sellAll = makeTx({ id: "sell-1100", side: "sell", tradeDate: "2026-08-01", price: 110, shares: 1100, fee: 172, tax: 363 });
  const ledger: Ledger = {
    schemaVersion: 1,
    transactions: [buy, sellAll],
    dividends: [stockDiv],
    holdingSettings: [],
    settings: DEFAULT_USER_SETTINGS,
  };

  test("刪除股票股利會讓之後賣出 1100 股不夠 → 拒絕並說是哪一筆", () => {
    const r = validateLedgerChange(ledger, { kind: "deleteDividend", id: "sd" }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "oversell", transactionId: "sell-1100", held: 1000 });
    expect(r.error.message).toContain("2026-08-01 賣出 1,100 股");
  });

  test("新增現金股利 → 通過，總報酬增加、持有成本不變", () => {
    const base = { ...ledger, transactions: [buy], dividends: [] };
    const cash = makeDividend({ type: "cash", exDate: "2026-07-01", cashAmount: 5000 });
    const r = validateLedgerChange(base, { kind: "addDividend", dividend: cash }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(positionOf(r.ledger).cashDividends).toBe(5000);
    expect(positionOf(r.ledger).costBasis).toBe(100_000);
  });

  test("除權息日當時沒有持股的股票股利 → 拒絕", () => {
    const early = makeDividend({ id: "early-sd", type: "stock", exDate: "2025-12-01", stockShares: 50 });
    const r = validateLedgerChange(ledger, { kind: "addDividend", dividend: early }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({
      code: "stockDividendWithoutShares",
      message: "除權息日當時沒有持股，請確認日期",
      symbol: "2330",
      dividendId: "early-sd",
    });
  });

  test("刪除買入讓股票股利變成沒有持股 → 拒絕並說是哪一筆股利", () => {
    const base = { ...ledger, transactions: [buy] };
    const r = validateLedgerChange(base, { kind: "deleteTransaction", id: buy.id }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("stockDividendWithoutShares");
    expect(r.error.message).toBe(
      "2026-07-01 的股票股利會變成除權息日當時沒有持股，請先修改或刪除那筆股利",
    );
  });

  test("修改股利：把配股改少，讓之後的賣出不夠 → 拒絕", () => {
    const r = validateLedgerChange(ledger, { kind: "updateDividend", dividend: { ...stockDiv, stockShares: 50 } }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "oversell", transactionId: "sell-1100", held: 1050 });
  });
});

describe("validateLedgerChange：欄位檢查（M-02 驗證規則）", () => {
  const valid = makeTx({ side: "buy", tradeDate: "2026-10-27", price: 600, shares: 1000, fee: 855 });

  test.each([
    [{ tradeDate: "2026-10-28" }, "tradeDate", "交易日期不可晚於今天"],
    [{ tradeDate: "2026/10/01" }, "tradeDate", "請選擇交易日期"],
    [{ price: 0 }, "price", "成交價必須大於 0"],
    [{ price: NaN }, "price", "成交價必須大於 0"],
    [{ shares: 1.5 }, "shares", "股數必須是大於 0 的整數"],
    [{ shares: 0 }, "shares", "股數必須是大於 0 的整數"],
    [{ fee: -1 }, "fee", "手續費不可小於 0"],
    [{ tax: 10 }, "tax", "買入沒有證交稅"],
  ])("%p → %s 錯誤", (patch, field, message) => {
    const r = validateLedgerChange(spec37Ledger(), { kind: "addTransaction", transaction: { ...valid, ...patch } }, TODAY);
    expect(r).toEqual({ ok: false, error: { code: "invalid", field, message } });
  });

  test("今天的交易可以", () => {
    expect(validateTransaction(valid, TODAY)).toBeNull();
  });

  test("股利金額與配股股數", () => {
    expect(validateDividend(makeDividend({ type: "cash", cashAmount: 0 }))).toMatchObject({ field: "cashAmount" });
    expect(validateDividend(makeDividend({ type: "cash" }))).toMatchObject({ field: "cashAmount" });
    expect(validateDividend(makeDividend({ type: "stock", stockShares: 2.5 }))).toMatchObject({ field: "stockShares" });
    expect(validateDividend(makeDividend({ type: "stock", stockShares: 100 }))).toBeNull();
  });
});

describe("validateLedger（讀檔、還原時檢查整份）", () => {
  test("3.7 範例沒問題", () => {
    expect(validateLedger(spec37Ledger())).toBeNull();
  });

  test("有一檔賣超 → 回報那一筆", () => {
    const ledger = spec37Ledger();
    const bad = makeTx({ id: "bad", symbol: "0050", side: "sell", price: 150, shares: 10, fee: 1, tax: 1 });
    ledger.transactions.push(bad);
    expect(validateLedger(ledger)).toMatchObject({ code: "oversell", symbol: "0050", transactionId: "bad" });
  });
});
