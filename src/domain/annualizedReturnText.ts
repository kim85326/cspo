import { formatReturnRate, pnlDirection } from "./pnl";
import type { Position } from "./position";
import type { PnlDirection } from "./types";
import type { AnnualizedReturn } from "./xirr";

/**
 * 年化報酬率（P2-04）要顯示的文字。value 是那一欄的值；reason 是值為「—」或「持有未滿一年」時的原因，
 * 放在下面一行小字，讓使用者知道為什麼看不到數字。對應 docs/stories/019-allocation-and-annualized-return-ui.md。
 */
export type AnnualizedReturnText = {
  value: string;
  reason: string | null;
  /** 有數字時的漲跌方向（上色用）；沒有數字是 null */
  direction: PnlDirection | null;
};

export const UNDER_ONE_YEAR = "持有未滿一年";

/**
 * positions 是這一組（單一持股、核心、衛星或整體）的持股，用來分辨算不出來的原因；
 * 不影響數字本身，數字照 xirr.ts 算好的結果。
 */
export function annualizedReturnText(
  result: AnnualizedReturn,
  positions: readonly Position[],
): AnnualizedReturnText {
  if (result.kind === "rate") {
    // 顯示到小數點後 2 位：−0.004% 顯示成 0.00%，就當持平
    const shown = Math.round(result.rate * 10_000) / 10_000;
    return {
      value: shown === 0 ? "0.00%" : formatReturnRate(result.rate),
      reason: null,
      direction: pnlDirection(shown),
    };
  }
  if (result.kind === "underOneYear") {
    return {
      value: UNDER_ONE_YEAR,
      reason: "第一筆投入到今天不到 365 天，年化會把短期漲跌放大，先不顯示",
      direction: null,
    };
  }
  if (positions.length === 0) return { value: "—", reason: "沒有持股", direction: null };
  if (positions.some((p) => p.shares > 0 && p.marketValue === null)) {
    return { value: "—", reason: "缺少價格，暫時算不出來", direction: null };
  }
  return { value: "—", reason: "這些買賣紀錄算不出年化報酬率", direction: null };
}
