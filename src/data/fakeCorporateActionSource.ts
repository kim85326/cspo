import type { CorporateAction } from "@/domain/types";
import { type CorporateActionSource, actionDate } from "./CorporateActionSource";

/**
 * 假除權息：demo 與自動化測試用，結果固定、不打網路。
 * 照抄 2330、0050 的真實紀錄（FinMind 2026-10-27 取得），其他代號沒有事件。
 */
const ACTIONS: CorporateAction[] = [
  { kind: "split", symbol: "0050", date: "2025-06-18", ratio: 4 },
  { kind: "dividend", symbol: "0050", exDate: "2025-07-21", cashPerShare: 0.36, stockPerThousand: 0, payDate: "2025-08-08" },
  { kind: "dividend", symbol: "2330", exDate: "2025-12-11", cashPerShare: 5.000011, stockPerThousand: 0, payDate: "2026-01-08" },
  { kind: "dividend", symbol: "0050", exDate: "2026-01-22", cashPerShare: 1, stockPerThousand: 0, payDate: "2026-02-11" },
  { kind: "dividend", symbol: "2330", exDate: "2026-03-17", cashPerShare: 6.000035, stockPerThousand: 0, payDate: "2026-04-09" },
  { kind: "dividend", symbol: "2330", exDate: "2026-06-11", cashPerShare: 6.000035, stockPerThousand: 0, payDate: "2026-07-09" },
  { kind: "dividend", symbol: "0050", exDate: "2026-07-21", cashPerShare: 0.6, stockPerThousand: 0, payDate: "2026-08-10" },
  { kind: "dividend", symbol: "2330", exDate: "2026-09-16", cashPerShare: 7.000001, stockPerThousand: 0, payDate: "2026-10-08" },
];

export const fakeCorporateActionSource: CorporateActionSource = {
  async getActions(symbol, from, to) {
    return ACTIONS.filter((a) => a.symbol === symbol && actionDate(a) >= from && actionDate(a) <= to);
  },
};
