import { FAKE_EXTRACTION } from "@/data/fakeHoldingRecognizer";
import {
  addExtractionToRows,
  checkImportRows,
  emptyImportRow,
  IMPORT_NOTE,
  MAX_IMPORT_ROWS,
  toImportTransactions,
  type ImportRow,
} from "./importTransactions";
import { makeTx } from "./ledgerTestData";
import { emptyLedger } from "./migrateSavedHoldings";
import { toStockInfo } from "./security";
import type { StockInfo } from "./types";

const STOCKS: StockInfo[] = [
  { symbol: "2330", name: "台積電" },
  { symbol: "2317", name: "鴻海" },
  { symbol: "0050", name: "元大台灣50" },
].map((s) => toStockInfo(s, "TWSE"));

const TSMC = STOCKS[0];
const TODAY = new Date(2026, 9, 28, 10, 0, 0);

function idGen() {
  let n = 0;
  return () => ++n;
}

function row(fields: Partial<ImportRow>): ImportRow {
  return { ...emptyImportRow(99, TODAY), selected: TSMC, buyPrice: "500", shares: "1000", ...fields };
}

describe("addExtractionToRows（對應 docs/stories/015）", () => {
  test("兩檔都變成一列，鴻海 1 張換算成 1000 股，建倉日期預設今天", () => {
    const { forms } = addExtractionToRows([], FAKE_EXTRACTION, STOCKS, idGen(), TODAY);
    expect(forms.map((f) => [f.selected?.symbol, f.buyPrice, f.shares, f.buyDate])).toEqual([
      ["2330", "500", "1000", "2026/10/28"],
      ["2317", "200", "1000", "2026/10/28"],
    ]);
  });

  test("再加一張截圖：原本的列保留，新的接在後面", () => {
    const next = idGen();
    const first = addExtractionToRows([], FAKE_EXTRACTION, STOCKS, next, TODAY).forms;
    const edited = first.map((f, i) => (i === 0 ? { ...f, buyDate: "2025/01/02" } : f));
    const { forms } = addExtractionToRows(
      edited,
      { holdings: [{ symbol: "0050", buyPrice: "150", shares: "2000", confidence: "high" }], warnings: [] },
      STOCKS,
      next,
      TODAY,
    );
    expect(forms.map((f) => [f.selected?.symbol, f.buyDate])).toEqual([
      ["2330", "2025/01/02"],
      ["2317", "2026/10/28"],
      ["0050", "2026/10/28"],
    ]);
  });

  test(`最多 ${MAX_IMPORT_ROWS} 列，超過的提示`, () => {
    const holdings = Array.from({ length: MAX_IMPORT_ROWS + 2 }, () => ({
      name: "不存在公司",
      buyPrice: "10",
      shares: "1",
      confidence: "high" as const,
    }));
    const { forms, warnings } = addExtractionToRows([], { holdings, warnings: [] }, STOCKS, idGen(), TODAY);
    expect(forms).toHaveLength(MAX_IMPORT_ROWS);
    expect(warnings).toContain(`截圖有 ${MAX_IMPORT_ROWS + 2} 檔，只匯入前 ${MAX_IMPORT_ROWS} 檔`);
  });
});

describe("checkImportRows（對應 docs/stories/015）", () => {
  test("都填好：可以匯入", () => {
    const check = checkImportRows([row({ id: 1 })], emptyLedger(), TODAY);
    expect(check.canImport).toBe(true);
    expect(check.rows.get(1)).toEqual({ errors: {}, heldShares: null });
  });

  test("沒有任何列：不能匯入", () => {
    expect(checkImportRows([], emptyLedger(), TODAY).canImport).toBe(false);
  });

  test("有欄位為空：那一欄標錯，不能匯入", () => {
    const check = checkImportRows([row({ id: 1, buyPrice: "", shares: "", buyDate: "" })], emptyLedger(), TODAY);
    expect(check.canImport).toBe(false);
    expect(check.rows.get(1)?.errors).toEqual({
      buyPrice: "請輸入平均成本",
      shares: "請輸入股數",
      buyDate: "請選擇建倉日期",
    });
  });

  test("股票對不到清單：該列標錯", () => {
    const check = checkImportRows([row({ id: 1, selected: null, query: "不存在公司" })], emptyLedger(), TODAY);
    expect(check.rows.get(1)?.errors.stock).toBe("清單裡找不到「不存在公司」，請從清單選擇正確的股票");
    expect(check.canImport).toBe(false);
  });

  test("股數不是整數、成本 0、日期晚於今天：各自標錯", () => {
    const check = checkImportRows(
      [row({ id: 1, shares: "1.5", buyPrice: "0", buyDate: "2026/10/29" })],
      emptyLedger(),
      TODAY,
    );
    expect(check.rows.get(1)?.errors).toEqual({
      shares: "股數必須是大於 0 的整數",
      buyPrice: "平均成本必須大於 0",
      buyDate: "建倉日期不能晚於今天",
    });
  });

  test("同一檔出現在兩列（兩張截圖重疊）：第二列標錯，不能匯入", () => {
    const check = checkImportRows([row({ id: 1 }), row({ id: 2, buyPrice: "510" })], emptyLedger(), TODAY);
    expect(check.rows.get(1)?.errors).toEqual({});
    expect(check.rows.get(2)?.errors.stock).toBe("和第 1 檔都是台積電（2330），請刪掉重複的那一檔");
    expect(check.canImport).toBe(false);
  });

  test("記帳本已經有這檔：不擋，但回傳目前股數", () => {
    const ledger = { ...emptyLedger(), transactions: [makeTx({ side: "buy", price: 480, shares: 2000 })] };
    const check = checkImportRows([row({ id: 1 })], ledger, TODAY);
    expect(check.canImport).toBe(true);
    expect(check.rows.get(1)?.heldShares).toBe(2000);
  });

  test("記帳本裡已出清的不算持有", () => {
    const ledger = {
      ...emptyLedger(),
      transactions: [
        makeTx({ side: "buy", price: 480, shares: 1000 }),
        makeTx({ side: "sell", price: 500, shares: 1000, tradeDate: "2026-02-01" }),
      ],
    };
    expect(checkImportRows([row({ id: 1 })], ledger, TODAY).rows.get(1)?.heldShares).toBeNull();
  });
});

describe("toImportTransactions（對應 docs/stories/015）", () => {
  test("每列一筆買入：價格 = 平均成本、手續費 0 且視為手動覆寫、source = import、備註", () => {
    const [tx] = toImportTransactions([row({ id: 1, buyPrice: "512.5", shares: "1,000", buyDate: "2025/03/04" })], TODAY);
    expect(tx).toEqual({
      symbol: "2330",
      side: "buy",
      tradeDate: "2025-03-04",
      price: 512.5,
      shares: 1000,
      fee: 0,
      tax: 0,
      feeOverridden: true,
      source: "import",
      note: IMPORT_NOTE,
    });
    expect(IMPORT_NOTE).toBe("拍照匯入期初持股");
  });

  test("沒核對完的列：丟錯，不產生半套交易", () => {
    expect(() => toImportTransactions([row({ id: 1, selected: null })], TODAY)).toThrow();
  });
});
