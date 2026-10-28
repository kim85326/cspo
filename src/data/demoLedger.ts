import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { Dividend, Ledger, Transaction } from "@/domain/ledgerTypes";

/**
 * 畫面開發用的示範記帳本（EXPO_PUBLIC_USE_DEMO_LEDGER=1 時用，資料只在記憶體）。
 * 2330 是 product-spec 3.7 的範例；另有 ETF（核心）、個股（衛星）、一檔已出清、一檔手動改成核心。
 * 手續費與證交稅照 3.2 預設設定算好。
 */
export function demoLedger(): Ledger {
  let seq = 0;
  const stamp = () => {
    seq += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
  };
  const tx = (
    symbol: string,
    side: Transaction["side"],
    tradeDate: string,
    price: number,
    shares: number,
    fee: number,
    tax = 0,
  ): Transaction => {
    const at = stamp();
    return {
      id: `demo-tx-${seq}`,
      symbol,
      side,
      tradeDate,
      price,
      shares,
      fee,
      tax,
      feeOverridden: false,
      source: "manual",
      createdAt: at,
      updatedAt: at,
    };
  };
  const cash = (symbol: string, exDate: string, cashAmount: number): Dividend => {
    const at = stamp();
    return {
      id: `demo-div-${seq}`,
      symbol,
      type: "cash",
      exDate,
      cashAmount,
      status: "received",
      source: "manual",
      createdAt: at,
      updatedAt: at,
    };
  };

  return {
    schemaVersion: 1,
    transactions: [
      // 3.7 範例
      tx("2330", "buy", "2026-01-05", 600, 1000, 855),
      tx("2330", "buy", "2026-02-05", 500, 1000, 712),
      tx("2330", "sell", "2026-03-05", 650, 500, 463, 975),
      // ETF：核心
      tx("0050", "buy", "2026-02-10", 160, 2000, 456),
      tx("00878", "buy", "2026-04-01", 21, 3000, 89),
      // 個股：衛星
      tx("2317", "buy", "2026-05-20", 200, 1000, 285),
      // 已出清
      tx("2454", "buy", "2026-03-02", 1100, 100, 156),
      tx("2454", "sell", "2026-08-15", 1250, 100, 178, 375),
      // 手動改成核心的存股型個股
      tx("2412", "buy", "2026-01-15", 120, 1000, 171),
    ],
    dividends: [
      cash("2330", "2026-06-15", 5000),
      cash("0050", "2026-07-17", 2000),
      // 自動帶入、還沒到發放日的預估股利（Story 012），看「預估即將入帳」用。日期與金額是示範用的，不是真的除息資料
      { ...cash("00878", "2026-10-21", 1200), payDate: "2026-11-18", status: "estimated", source: "auto" },
    ],
    holdingSettings: [{ symbol: "2412", bucket: "core" }],
    settings: DEFAULT_USER_SETTINGS,
  };
}
