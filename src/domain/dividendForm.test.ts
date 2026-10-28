import { applyDividendForm, confirmDividend, emptyDividendForm, formFromDividend, parseDividendForm } from "./dividendForm";
import { DEFAULT_USER_SETTINGS } from "./fees";
import { makeDividend, makeTx, spec37, spec37Ledger } from "./ledgerTestData";
import type { Ledger } from "./ledgerTypes";
import { validateLedgerChange } from "./ledgerValidation";
import { computePosition } from "./position";

const NOW = new Date(2026, 9, 28, 12);
const TODAY = "2026-10-28";

describe("parseDividendForm：M-03 欄位檢查（對應 docs/stories/012）", () => {
  test("現金股利：日期、金額、備註轉好；全形數字與千分位也收", () => {
    const r = parseDividendForm({ type: "cash", exDate: "2026/06/15", amount: "５,０００", note: " 扣了二代健保 " }, NOW);
    expect(r).toEqual({ ok: true, value: { type: "cash", exDate: "2026-06-15", cashAmount: 5000, note: "扣了二代健保" } });
  });

  test("股票股利：配發股數必須是正整數", () => {
    expect(parseDividendForm({ type: "stock", exDate: "2026/07/01", amount: "100", note: "" }, NOW)).toEqual({
      ok: true,
      value: { type: "stock", exDate: "2026-07-01", stockShares: 100, note: undefined },
    });
    expect(parseDividendForm({ type: "stock", exDate: "2026/07/01", amount: "10.5", note: "" }, NOW)).toEqual({
      ok: false,
      errors: { amount: "配發股數必須是大於 0 的整數" },
    });
  });

  test("沒選日期、日期在未來、金額 0 或空白都擋下", () => {
    expect(parseDividendForm({ type: "cash", exDate: "", amount: "0", note: "" }, NOW)).toEqual({
      ok: false,
      errors: { exDate: "請選擇除權息日", amount: "股利金額必須大於 0" },
    });
    expect(parseDividendForm({ type: "cash", exDate: "2026/11/01", amount: "", note: "" }, NOW)).toEqual({
      ok: false,
      errors: { exDate: "除權息日不能晚於今天", amount: "股利金額必須大於 0" },
    });
  });

  test("emptyDividendForm／formFromDividend 給畫面的初始值", () => {
    expect(emptyDividendForm(TODAY)).toEqual({ type: "cash", exDate: "2026/10/28", amount: "", note: "" });
    expect(formFromDividend(spec37.step4)).toEqual({ type: "cash", exDate: "2026/06/15", amount: "5000", note: "" });
  });
});

describe("M-03 AC", () => {
  const options = { type: "stock" as const, price: spec37.price, today: TODAY };

  test("新增 5,000 元現金股利後，總報酬增加 5,000，持有成本不變", () => {
    // 3.7 範例步驟 1–3（不含步驟 4 的股利）為起點
    const base: Ledger = { ...spec37Ledger(), dividends: [] };
    const before = computePosition("2330", base.transactions, base.dividends, options);
    const parsed = parseDividendForm({ type: "cash", exDate: "2026/06/15", amount: "5000", note: "" }, NOW);
    if (!parsed.ok) throw new Error("parse failed");
    const dividend = makeDividend({ ...parsed.value, note: undefined });
    const r = validateLedgerChange(base, { kind: "addDividend", dividend }, TODAY);
    if (!r.ok) throw new Error(r.error.message);
    const after = computePosition("2330", r.ledger.transactions, r.ledger.dividends, options);
    expect((after.totalReturn as number) - (before.totalReturn as number)).toBeCloseTo(5000, 6);
    expect(after.costBasis).toBe(before.costBasis);
    expect(after.cashDividends).toBe(5000);
  });

  test("持有 1000 股、成本 100,000 時，新增股票股利 100 股 → 持股 1100 股，平均成本 90.91", () => {
    // 手算：100,000 ÷ 1,100 = 90.909…，顯示四捨五入成 90.91
    const buy = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 100, shares: 1000, fee: 0 });
    const ledger: Ledger = { schemaVersion: 1, transactions: [buy], dividends: [], holdingSettings: [], settings: DEFAULT_USER_SETTINGS };
    const dividend = makeDividend({ type: "stock", exDate: "2026-07-01", stockShares: 100 });
    const r = validateLedgerChange(ledger, { kind: "addDividend", dividend }, TODAY);
    if (!r.ok) throw new Error(r.error.message);
    const p = computePosition("2330", r.ledger.transactions, r.ledger.dividends, { type: "stock", today: TODAY });
    expect(p.shares).toBe(1100);
    expect(p.costBasis).toBe(100000);
    expect((p.averageCost as number).toFixed(2)).toBe("90.91");
  });

  test("刪除股票股利會讓之後的賣出股數不足 → 拒絕", () => {
    // 1000 股 + 配 100 股 = 1100 股，之後賣 1100 股；刪掉配股就只剩 1000 股可賣
    const buy = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 100, shares: 1000, fee: 0 });
    const stock = makeDividend({ id: "stock-div", type: "stock", exDate: "2026-07-01", stockShares: 100 });
    const sell = makeTx({ side: "sell", tradeDate: "2026-08-01", price: 110, shares: 1100, fee: 172, tax: 363 });
    const ledger: Ledger = { schemaVersion: 1, transactions: [buy, sell], dividends: [stock], holdingSettings: [], settings: DEFAULT_USER_SETTINGS };
    const r = validateLedgerChange(ledger, { kind: "deleteDividend", id: "stock-div" }, TODAY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("oversell");
  });
});

describe("applyDividendForm／confirmDividend", () => {
  const auto = makeDividend({ type: "cash", exDate: "2026-10-20", cashAmount: 3000, status: "estimated", source: "auto", payDate: "2026-11-20" });

  test("自動帶入的紀錄改了金額 → userModified；只改備註不算", () => {
    const edited = applyDividendForm(auto, { type: "cash", exDate: "2026-10-20", cashAmount: 2937, note: undefined });
    expect(edited).toEqual({ ...auto, cashAmount: 2937, userModified: true });
    const noteOnly = applyDividendForm(auto, { type: "cash", exDate: "2026-10-20", cashAmount: 3000, note: "已確認" });
    expect(noteOnly).toEqual({ ...auto, note: "已確認" });
  });

  test("手動紀錄換類型：清掉現金金額、換成股數；不會標 userModified", () => {
    const manual = makeDividend({ type: "cash", cashAmount: 500, note: "舊備註" });
    const edited = applyDividendForm(manual, { type: "stock", exDate: "2026-07-01", stockShares: 50, note: undefined });
    expect(edited.cashAmount).toBeUndefined();
    expect(edited.note).toBeUndefined();
    expect(edited).toEqual(expect.objectContaining({ type: "stock", stockShares: 50 }));
    expect(edited.userModified).toBeUndefined();
  });

  test("確認入帳：estimated → received，自動紀錄之後不再更新", () => {
    expect(confirmDividend(auto)).toEqual({ ...auto, status: "received", userModified: true });
  });
});
