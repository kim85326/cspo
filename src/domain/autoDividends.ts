import { floorMoney } from "./fees";
import type { Dividend, DividendStatus, DividendType, Ledger } from "./ledgerTypes";
import { replaySymbol } from "./position";
import type { DividendEvent } from "./types";

/**
 * 股利自動帶入（P2-03，docs/stories/012）：依交易紀錄與除權息事件，算出記帳本裡應該有哪些自動股利。
 * 純函式，不打網路、不存檔；抓除權息資料與寫回記帳本在 src/data/autoDividendSync.ts。
 *
 * 規則：
 * - 參與股數 = 除權息日「前一個交易日」收盤時的持股。除權息日不開盤以外沒有交易，
 *   所以等於「交易日早於除權息日的所有交易」＋「除權息日更早、已入帳的股票股利」重播的結果。
 *   除權息日當天才買的不算。
 * - 現金股利 = floor(參與股數 × 每股現金股利)，元以下捨去（集保實際入帳也是捨去到元）。
 * - 股票股利 = floor(參與股數 × 每千股配股 ÷ 1000)。等於規格的 floor(參與股數 × 每股股票股利 ÷ 10)：
 *   每股股票股利 1 元 = 面額 10 元的 1/10 = 每千股 100 股。
 * - 發放日已到（發放日 ≤ 今天）是 received，否則 estimated；沒有發放日（官方來源）先維持 estimated。
 * - 只處理除權息日 ≤ 今天的事件：除權息日還沒到，參與股數還會變。
 * - 金額還沒公告（cashPerShare 是 null）、算出來是 0 的不建立。
 * - 去重：同證券、同除權息日、同類型已有手動紀錄，就不自動建立。
 * - 使用者改過（userModified）的自動紀錄不再更新金額；被刪掉的（dismissedAutoDividends）不再建立。
 * - 沒被改過的自動紀錄，交易改了就跟著重算；參與股數變 0 就移除。
 */

/** 要新增的自動股利；id、createdAt、updatedAt 由 repository 補 */
export type AutoDividendDraft = Omit<Dividend, "id" | "createdAt" | "updatedAt">;

export type AutoDividendPlan = {
  add: AutoDividendDraft[];
  /** 整筆取代（依 id）；updatedAt 由 repository 更新 */
  update: Dividend[];
  /** 要移除的 id */
  remove: string[];
};

/** 自動股利的身分：同證券、同除權息日、同類型只會有一筆 */
export function autoDividendKey(d: Pick<Dividend, "symbol" | "exDate" | "type">): string {
  return `${d.symbol}|${d.exDate}|${d.type}`;
}

/**
 * 除權息日前一個交易日收盤時的持股。
 * 股票股利只算已入帳、而且除權息日更早的；資料本身賣超時用重播停下來那一刻的股數。
 */
export function participatingShares(ledger: Pick<Ledger, "transactions" | "dividends">, symbol: string, exDate: string): number {
  const transactions = ledger.transactions.filter((t) => t.symbol === symbol && t.tradeDate < exDate);
  const dividends = ledger.dividends.filter((d) => d.symbol === symbol && d.exDate < exDate);
  return replaySymbol(symbol, transactions, dividends).state.shares;
}

/** 依發放日決定狀態 */
export function statusOn(payDate: string | null | undefined, today: string): DividendStatus {
  return payDate && payDate <= today ? "received" : "estimated";
}

/** 一個除權息事件、一種類型應該帶入多少；不該建立時 null */
function expectedAmount(event: DividendEvent, type: DividendType, shares: number): number | null {
  if (shares <= 0) return null;
  if (type === "cash") {
    if (event.cashPerShare === null || event.cashPerShare <= 0) return null;
    const amount = floorMoney(shares * event.cashPerShare);
    return amount > 0 ? amount : null;
  }
  if (event.stockPerThousand <= 0) return null;
  const stockShares = floorMoney((shares * event.stockPerThousand) / 1000);
  return stockShares > 0 ? stockShares : null;
}

/**
 * 算出要新增、更新、移除哪些自動股利。
 * events 可以混各檔證券、可以有重複；只看 kind = dividend、除權息日 ≤ today 的。
 * 只動 events 涵蓋到的（證券, 除權息日）：資料來源暫時抓不到某檔時，已經建好的不會被刪。
 */
export function planAutoDividends(ledger: Ledger, events: readonly DividendEvent[], today: string): AutoDividendPlan {
  const plan: AutoDividendPlan = { add: [], update: [], remove: [] };
  const dismissed = new Set(ledger.dismissedAutoDividends ?? []);
  const seen = new Set<string>();
  /** 已經決定好的股票股利要算進之後的參與股數（連續好幾年配股時，後一年的參與股數含前一年配的） */
  const planned: Dividend[] = [];
  const working = () => {
    const replaced = new Set([...planned.map((d) => d.id), ...plan.remove]);
    return { transactions: ledger.transactions, dividends: [...ledger.dividends.filter((d) => !replaced.has(d.id)), ...planned] };
  };

  const sorted = events
    .filter((e) => e.kind === "dividend" && e.exDate <= today)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));
  for (const event of sorted) {
    const shares = participatingShares(working(), event.symbol, event.exDate);

    for (const type of ["cash", "stock"] as const) {
      const key = autoDividendKey({ symbol: event.symbol, exDate: event.exDate, type });
      if (seen.has(key) || dismissed.has(key)) continue;
      seen.add(key);

      const existing = ledger.dividends.filter((d) => autoDividendKey(d) === key);
      if (existing.some((d) => d.source === "manual")) continue;
      const auto = existing.find((d) => d.source === "auto");
      const amount = expectedAmount(event, type, shares);
      const payDate = event.payDate ?? auto?.payDate;
      const status = statusOn(payDate, today);

      if (!auto) {
        if (amount === null) continue;
        const draft: AutoDividendDraft = {
          symbol: event.symbol,
          type,
          exDate: event.exDate,
          ...(payDate ? { payDate } : {}),
          ...(type === "cash" ? { cashAmount: amount } : { stockShares: amount }),
          status,
          source: "auto",
        };
        plan.add.push(draft);
        planned.push({ ...draft, id: `planned-${key}`, createdAt: "", updatedAt: "" });
        continue;
      }

      if (auto.userModified) {
        // 使用者改過金額：只依發放日轉成已入帳，不動金額
        if (auto.status === "estimated" && statusOn(auto.payDate, today) === "received") {
          const next: Dividend = { ...auto, status: "received" };
          plan.update.push(next);
          planned.push(next);
        }
        continue;
      }

      if (amount === null) {
        // 金額還沒公告時不刪，等公告；參與股數變 0（例如刪了除權息日前的買入）才移除
        if (shares <= 0) plan.remove.push(auto.id);
        continue;
      }
      const next: Dividend = {
        ...auto,
        ...(payDate ? { payDate } : {}),
        ...(type === "cash" ? { cashAmount: amount } : { stockShares: amount }),
        status,
      };
      if (
        next.cashAmount !== auto.cashAmount ||
        next.stockShares !== auto.stockShares ||
        next.payDate !== auto.payDate ||
        next.status !== auto.status
      ) {
        plan.update.push(next);
        planned.push(next);
      }
    }
  }
  return plan;
}

export function isEmptyPlan(plan: AutoDividendPlan): boolean {
  return plan.add.length === 0 && plan.update.length === 0 && plan.remove.length === 0;
}

/**
 * 套用計畫（不修改傳入的 ledger）。make 把新增的草稿補上 id 與時間，stamp 是更新時間。
 * 呼叫的人要再用 validateLedger 檢查（股票股利入帳會改變持股）。
 */
export function applyAutoDividendPlan(
  ledger: Ledger,
  plan: AutoDividendPlan,
  make: (draft: AutoDividendDraft) => Dividend,
  stamp: string,
): Ledger {
  const removed = new Set(plan.remove);
  const updated = new Map(plan.update.map((d) => [d.id, { ...d, updatedAt: stamp }]));
  const dividends = ledger.dividends
    .filter((d) => !removed.has(d.id))
    .map((d) => updated.get(d.id) ?? d)
    .concat(plan.add.map(make));
  return { ...ledger, dividends };
}

/** 刪掉自動股利時記下來，之後不再自動建立（手動紀錄不用記） */
export function dismissAutoDividend(ledger: Ledger, dividend: Dividend): Ledger {
  if (dividend.source !== "auto") return ledger;
  const key = autoDividendKey(dividend);
  const dismissed = ledger.dismissedAutoDividends ?? [];
  if (dismissed.includes(key)) return ledger;
  return { ...ledger, dismissedAutoDividends: [...dismissed, key] };
}

/** 某檔證券「預估即將入帳」的現金股利合計（estimated 不計入總報酬，只在畫面上另外顯示） */
export function estimatedCashDividends(dividends: readonly Dividend[], symbol: string): number {
  return dividends
    .filter((d) => d.symbol === symbol && d.type === "cash" && d.status === "estimated")
    .reduce((sum, d) => sum + (d.cashAmount ?? 0), 0);
}

/** 某檔證券「預估即將入帳」的配股股數合計 */
export function estimatedStockDividends(dividends: readonly Dividend[], symbol: string): number {
  return dividends
    .filter((d) => d.symbol === symbol && d.type === "stock" && d.status === "estimated")
    .reduce((sum, d) => sum + (d.stockShares ?? 0), 0);
}
