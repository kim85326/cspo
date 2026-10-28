import {
  activeDcaRuleIds,
  candleMonthsFor,
  duePeriods,
  generateDcaTransactions,
  setDcaRuleEnabled,
  type DcaRuleFields,
  type DcaSkip,
} from "@/domain/dca";
import type { DcaRule, Ledger, Transaction } from "@/domain/ledgerTypes";
import type { CandleSource } from "./CandleSource";
import type { LedgerRepository, LedgerWriteResult } from "./ledgerRepository";

/**
 * 定期定額規則的新增／修改／暫停／刪除，以及 App 開啟時的自動補帳（Story 024）。
 * 規則存在記帳本的 dcaRules；寫入都走 repository.transform，跟其他寫入一起排隊，不會互相覆蓋。
 * 產生邏輯本身是 src/domain/dca.ts 的純函式，這裡只負責抓收盤價、寫回記帳本。
 */

export type DcaIdFactory = () => string;

let ruleSeq = 0;
const defaultRuleId: DcaIdFactory = () => {
  ruleSeq += 1;
  return `dca-${Date.now().toString(36)}-${ruleSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

let txSeq = 0;
const defaultTxId: DcaIdFactory = () => {
  txSeq += 1;
  return `tx-dca-${Date.now().toString(36)}-${txSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

/** 記帳本裡的規則；舊資料沒有這個欄位就是空的 */
export function dcaRulesOf(ledger: Ledger): DcaRule[] {
  return ledger.dcaRules ?? [];
}

/** 這條規則自動產生、目前還在記帳本裡的交易（新到舊） */
export function dcaTransactionsOf(ledger: Ledger, ruleId: string): Transaction[] {
  return ledger.transactions
    .filter((t) => t.source === "dca" && t.dcaRuleId === ruleId)
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}

function withRules(ledger: Ledger, rules: DcaRule[]): Ledger {
  return { ...ledger, dcaRules: rules };
}

/** 新增規則（啟用中）。回傳的 ruleId 給畫面用 */
export async function addDcaRule(
  repository: LedgerRepository,
  fields: DcaRuleFields,
  newId: DcaIdFactory = defaultRuleId,
): Promise<LedgerWriteResult & { ruleId: string }> {
  const ruleId = newId();
  const result = await repository.transform((ledger, _today, now) =>
    withRules(ledger, [
      ...dcaRulesOf(ledger),
      { ...fields, id: ruleId, enabled: true, handledPeriods: [], createdAt: now, updatedAt: now },
    ]),
  );
  return { ...result, ruleId };
}

/**
 * 修改規則的欄位。已經產生的交易不動（使用者可以自己去改成券商實際成交的數字）；
 * 新的金額、扣款日只影響之後產生的期數。已處理過的期數照舊不再產生。
 * 找不到規則（已被刪掉）時不寫入。
 */
export function updateDcaRule(repository: LedgerRepository, id: string, fields: DcaRuleFields): Promise<LedgerWriteResult> {
  return repository.transform((ledger, _today, now) => {
    const rules = dcaRulesOf(ledger);
    if (!rules.some((r) => r.id === id)) return ledger;
    return withRules(
      ledger,
      rules.map((r) => (r.id === id ? { ...r, ...fields, updatedAt: now } : r)),
    );
  });
}

/** 暫停或恢復；恢復時暫停期間到期的期數不補（見 domain setDcaRuleEnabled） */
export function setDcaRuleEnabledById(
  repository: LedgerRepository,
  id: string,
  enabled: boolean,
): Promise<LedgerWriteResult> {
  return repository.transform((ledger, today, now) => {
    const rules = dcaRulesOf(ledger);
    const target = rules.find((r) => r.id === id);
    if (!target || target.enabled === enabled) return ledger;
    const next = { ...setDcaRuleEnabled(target, enabled, today), updatedAt: now };
    return withRules(ledger, rules.map((r) => (r.id === id ? next : r)));
  });
}

/**
 * 刪除規則。已經自動產生的交易保留：那些是真的扣過款的買入紀錄，刪規則只代表之後不再自動產生。
 * 交易身上的 dcaRuleId 留著（找不到規則而已），列表上仍標「定期定額」。
 */
export function deleteDcaRule(repository: LedgerRepository, id: string): Promise<LedgerWriteResult> {
  return repository.transform((ledger) => {
    const rules = dcaRulesOf(ledger);
    if (!rules.some((r) => r.id === id)) return ledger;
    return withRules(
      ledger,
      rules.filter((r) => r.id !== id),
    );
  });
}

export type DcaCatchUpOptions = {
  repository: LedgerRepository;
  candleSource: CandleSource;
  /** Pro（或沒有方案限制）：所有規則都產生；否則只有最早建立的 1 條（P2-08） */
  unlimited: boolean;
  /** 產生交易 id；測試固定用 */
  newId?: DcaIdFactory;
  /** 今天 "YYYY-MM-DD"：只用來決定要抓哪幾個月的日 K；真正判斷到期用 repository 的今天 */
  today: string;
};

export type DcaCatchUpReport = {
  created: Transaction[];
  skipped: DcaSkip[];
  /** 抓日 K 失敗的代號（這次先跳過，下次再補） */
  failedSymbols: string[];
  /** 寫回記帳本失敗（例如存檔失敗）；交易沒有產生，下次再補 */
  saveError?: string;
};

/**
 * 補產生所有已到期、還沒產生的定期定額交易（App 開啟時跑一次；新增或修改規則後也跑一次）。
 * 1. 依記帳本現在的規則，算出每檔要抓哪幾個月的日 K（沒有待處理的期數就不打網路）。
 * 2. 抓日 K；某一檔失敗只跳過那一檔。
 * 3. 在 repository 佇列裡拿最新的記帳本產生交易並寫回：重複執行（例如同時觸發兩次）也不會重複產生，
 *    因為去重記號 handledPeriods 跟交易一起寫入。
 */
export async function runDcaCatchUp(options: DcaCatchUpOptions): Promise<DcaCatchUpReport> {
  const { repository, candleSource, unlimited, today } = options;
  const ledger = await repository.load();
  const rules = dcaRulesOf(ledger);
  const active = activeDcaRuleIds(rules, unlimited);

  const monthsBySymbol = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (!active.has(rule.id)) continue;
    const months = candleMonthsFor(duePeriods(rule, today), today);
    if (months.length === 0) continue;
    const set = monthsBySymbol.get(rule.symbol) ?? new Set<string>();
    months.forEach((m) => set.add(m));
    monthsBySymbol.set(rule.symbol, set);
  }
  if (monthsBySymbol.size === 0) return { created: [], skipped: [], failedSymbols: [] };

  const candles: Record<string, Awaited<ReturnType<CandleSource["getDailyCandles"]>> | undefined> = {};
  const failedSymbols: string[] = [];
  await Promise.all(
    [...monthsBySymbol].map(async ([symbol, months]) => {
      try {
        candles[symbol] = await candleSource.getDailyCandles(symbol, [...months].sort());
      } catch {
        failedSymbols.push(symbol);
      }
    }),
  );

  let report: Pick<DcaCatchUpReport, "created" | "skipped"> = { created: [], skipped: [] };
  const result = await repository.transform((latest, repoToday, now) => {
    const generated = generateDcaTransactions({
      ledger: latest,
      candles,
      today: repoToday,
      ruleIds: activeDcaRuleIds(dcaRulesOf(latest), unlimited),
      newId: options.newId ?? defaultTxId,
      now,
    });
    report = { created: generated.created, skipped: generated.skipped };
    return generated.ledger;
  });
  if (!result.ok) {
    return { created: [], skipped: report.skipped, failedSymbols, saveError: result.error.message };
  }
  return { ...report, failedSymbols };
}
