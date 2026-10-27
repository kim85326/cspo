/**
 * 單元測試共用的記帳資料：product-spec 3.7 的驗收範例，以及產生交易／股利的小工具。
 * 只給 *.test.ts 用。
 */
import { DEFAULT_USER_SETTINGS } from "./fees";
import type { Dividend, Ledger, Transaction } from "./ledgerTypes";

let seq = 0;

/** 一筆交易；沒給的欄位用合理的預設值。createdAt 依呼叫順序遞增 */
export function makeTx(fields: Partial<Transaction> & Pick<Transaction, "side" | "price" | "shares">): Transaction {
  seq += 1;
  const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
  return {
    id: `tx-${seq}`,
    symbol: "2330",
    tradeDate: "2026-01-02",
    fee: 0,
    tax: 0,
    feeOverridden: false,
    source: "manual",
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
  };
}

/** 一筆已入帳的股利 */
export function makeDividend(fields: Partial<Dividend> & Pick<Dividend, "type">): Dividend {
  seq += 1;
  const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
  return {
    id: `div-${seq}`,
    symbol: "2330",
    exDate: "2026-07-01",
    status: "received",
    source: "manual",
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
  };
}

/** product-spec 3.7：2330，手續費與證交稅照 3.2 預設設定算好 */
export const spec37 = {
  step1: makeTx({ id: "step1", side: "buy", tradeDate: "2026-01-05", price: 600, shares: 1000, fee: 855 }),
  step2: makeTx({ id: "step2", side: "buy", tradeDate: "2026-02-05", price: 500, shares: 1000, fee: 712 }),
  step3: makeTx({
    id: "step3",
    side: "sell",
    tradeDate: "2026-03-05",
    price: 650,
    shares: 500,
    fee: 463,
    tax: 975,
  }),
  step4: makeDividend({ id: "step4", type: "cash", exDate: "2026-06-15", cashAmount: 5000 }),
  price: 620,
};

export function spec37Ledger(): Ledger {
  return {
    schemaVersion: 1,
    transactions: [spec37.step1, spec37.step2, spec37.step3],
    dividends: [spec37.step4],
    holdingSettings: [],
    settings: DEFAULT_USER_SETTINGS,
  };
}
