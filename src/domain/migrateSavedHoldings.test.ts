import { DEFAULT_USER_SETTINGS } from "./fees";
import type { Ledger } from "./ledgerTypes";
import {
  emptyLedger,
  MIGRATED_NOTE,
  migrateSavedHoldings,
  replaceSavedHoldings,
  savedHoldingsFromLedger,
} from "./migrateSavedHoldings";
import { computePosition } from "./position";
import type { SavedHolding } from "./types";

// 本地時間 2026-10-27 上午 10 點搬移
const NOW = new Date(2026, 9, 27, 10, 0, 0);
const TODAY = "2026-10-27";

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

const TSMC: SavedHolding = { symbol: "2330", buyPrice: "600", shares: "1000", buyDate: "2026/01/05" };
const ETF: SavedHolding = { symbol: "0050", buyPrice: "150", shares: "30" };

describe("migrateSavedHoldings（對應 docs/stories/008）", () => {
  test("存了 2 檔：轉成 2 筆買入交易，手續費依 3.2、備註「由舊版資料轉入」", () => {
    const { transactions, skipped } = migrateSavedHoldings([TSMC, ETF], { now: NOW, newId: ids() });
    expect(skipped).toEqual([]);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      id: "id-1",
      symbol: "2330",
      side: "buy",
      tradeDate: "2026-01-05",
      price: 600,
      shares: 1000,
      fee: 855,
      tax: 0,
      feeOverridden: false,
      source: "manual",
      note: MIGRATED_NOTE,
    });
    expect(transactions[0].tradeDateUnknown).toBeUndefined();
    // 零股：max(floor(6.41), 1) = 6（規格 3.7 零股範例）
    expect(transactions[1]).toMatchObject({ symbol: "0050", price: 150, shares: 30, fee: 6 });
  });

  test("沒填買入日期：日期用搬移當天、標成日期不明，備註說明原因", () => {
    const [t] = migrateSavedHoldings([ETF], { now: NOW }).transactions;
    expect(t.tradeDate).toBe(TODAY);
    expect(t.tradeDateUnknown).toBe(true);
    expect(t.note).toBe(`${MIGRATED_NOTE}（舊資料沒有買入日期，暫用轉入當天）`);
  });

  test.each([
    ["格式不對", "去年十月"],
    ["沒有這一天", "2026/02/30"],
    ["晚於今天", "2026/12/01"],
  ])("買入日期%s：照樣搬，日期用搬移當天，備註留原文", (_, buyDate) => {
    const { transactions, skipped } = migrateSavedHoldings([{ ...TSMC, buyDate }], { now: NOW });
    expect(skipped).toEqual([]);
    expect(transactions[0]).toMatchObject({ tradeDate: TODAY, tradeDateUnknown: true, price: 600 });
    expect(transactions[0].note).toBe(`${MIGRATED_NOTE}（原買入日期「${buyDate}」無法辨識，暫用轉入當天）`);
  });

  test("使用者手打的各種日期寫法都認得", () => {
    const { transactions } = migrateSavedHoldings(
      ["2026-01-05", "2026.1.5", "２０２６／０１／０５", " 2026/1/5 "].map((buyDate) => ({ ...TSMC, buyDate })),
      { now: NOW },
    );
    expect(transactions.map((t) => t.tradeDate)).toEqual(Array(4).fill("2026-01-05"));
  });

  test("代號、價格、股數不合法的筆數略過並說明原因，其餘照搬", () => {
    const bad: SavedHolding[] = [
      { symbol: "", buyPrice: "600", shares: "1000" },
      { symbol: "2330", buyPrice: "-1", shares: "1000" },
      { symbol: "2330", buyPrice: "600", shares: "1.5" },
    ];
    const { transactions, skipped } = migrateSavedHoldings([...bad, ETF], { now: NOW });
    expect(transactions.map((t) => t.symbol)).toEqual(["0050"]);
    expect(skipped.map((s) => s.item)).toEqual(bad);
    expect(skipped[1].reason).toBe("買入價必須大於 0");
  });

  test("代號會去空白並轉大寫", () => {
    const [t] = migrateSavedHoldings([{ symbol: " 00631l ", buyPrice: "20", shares: "1000" }], { now: NOW })
      .transactions;
    expect(t.symbol).toBe("00631L");
  });

  test("createdAt 依原本順序遞增，同一天重播時順序不變", () => {
    const { transactions } = migrateSavedHoldings([ETF, ETF, ETF], { now: NOW });
    const stamps = transactions.map((t) => t.createdAt);
    expect([...stamps].sort()).toEqual(stamps);
    expect(new Set(stamps).size).toBe(3);
    expect(new Set(transactions.map((t) => t.id)).size).toBe(3);
  });

  test("搬過來的交易交給計算引擎：算得出持股與含手續費的持有成本", () => {
    const { transactions } = migrateSavedHoldings(
      [TSMC, { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/02/05" }],
      { now: NOW },
    );
    const position = computePosition("2330", transactions, [], { type: "stock", price: 620, today: TODAY });
    // 規格 3.7 步驟 1、2：持有 2000 股，成本 1,101,567
    expect(position.shares).toBe(2000);
    expect(position.costBasis).toBe(1_101_567);
    expect(position.averageCost).toBeCloseTo(550.7835, 6);
    expect(position.holdingSince).toBe("2026-01-05");
  });
});

describe("CalculateScreen 過渡轉接（對應 docs/stories/008）", () => {
  test("記帳本 → 欄位字串：日期轉成 2026/01/05，日期不明的不帶日期", () => {
    const ledger: Ledger = { ...emptyLedger(), ...migrateSavedHoldings([TSMC, ETF], { now: NOW }) };
    expect(savedHoldingsFromLedger(ledger)).toEqual([
      { symbol: "2330", buyPrice: "600", shares: "1000", buyDate: "2026/01/05" },
      { symbol: "0050", buyPrice: "150", shares: "30" },
    ]);
  });

  test("沒改的持股沿用原本的交易（id、備註、日期都不變），新的另建", () => {
    const migrated = migrateSavedHoldings([TSMC, ETF], { now: NOW, newId: ids() }).transactions;
    const ledger: Ledger = { ...emptyLedger(), transactions: migrated };
    const nextDay = new Date(2026, 9, 28, 9, 0, 0);
    const next = replaceSavedHoldings(
      ledger,
      [ETF, { symbol: "2317", buyPrice: "150", shares: "2000" }],
      { now: nextDay, newId: () => "new" },
    );
    expect(next.transactions[0]).toBe(migrated[1]);
    expect(next.transactions[0].tradeDate).toBe(TODAY);
    expect(next.transactions[1]).toMatchObject({ id: "new", symbol: "2317", tradeDate: "2026-10-28", fee: 427 });
    expect(next.transactions[1].note).toBeUndefined();
  });

  test("只取代交易，股利與設定不動；手續費用記帳本的設定", () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      settings: { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 },
      holdingSettings: [{ symbol: "2330", bucket: "core" }],
    };
    const next = replaceSavedHoldings(ledger, [{ symbol: "2330", buyPrice: "600", shares: "1000" }], { now: NOW });
    expect(next.settings).toBe(ledger.settings);
    expect(next.holdingSettings).toBe(ledger.holdingSettings);
    // floor(600,000 × 0.001425 × 0.28) = 239
    expect(next.transactions[0].fee).toBe(239);
  });
});
