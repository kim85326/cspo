import type { CorporateAction } from "@/domain/types";

/**
 * 除權息與分割來源介面（P2-03 股利自動帶入、P2-05 B 還原股價用）。
 * - from、to 是 ISO 日期（含頭尾），比對的是除權息交易日／分割生效日。
 *   要拿「已公告、還沒除息」的事件，to 就給未來的日期。
 * - 回傳依日期由舊到新。這檔沒有事件、或代號不存在：回空陣列。
 * - 拿不到資料（斷網、伺服器錯誤、超過次數上限）丟 PriceLoadError。
 */
export interface CorporateActionSource {
  getActions(symbol: string, from: string, to: string): Promise<CorporateAction[]>;
}

/** 依日期排序用：分割看 date、除權息看 exDate */
export function actionDate(action: CorporateAction): string {
  return action.kind === "split" ? action.date : action.exDate;
}

export function sortActions(actions: CorporateAction[]): CorporateAction[] {
  return [...actions].sort((a, b) => (actionDate(a) < actionDate(b) ? -1 : actionDate(a) > actionDate(b) ? 1 : 0));
}
