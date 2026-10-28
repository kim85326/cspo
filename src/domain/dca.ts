import { calcFee } from "./fees";
import type { DcaRule, Ledger, Transaction, UserSettings } from "./ledgerTypes";
import { tradingDayOnOrAfter } from "./tradingDays";
import type { Candle } from "./types";

/**
 * 定期定額自動記帳（product-spec P2-02，docs/stories/024）。全部是純函式：
 * 收盤價由呼叫的人先抓好傳進來，這裡只決定「哪幾期該產生、產生什麼」。
 *
 * 一期 = 一個月，用 "YYYY-MM" 表示（扣款日所在的月份）。
 */

/** 每月扣款日的範圍（1–28：每個月都有這天，不用處理 29–31 號） */
export const DCA_MIN_DAY = 1;
export const DCA_MAX_DAY = 28;

/**
 * 扣款日最多順延幾天。台股最長的連假（春節）約 9 天；順延超過這個天數代表那段時間沒有這檔的資料
 * （還沒上市、停止交易、或資料缺漏），不應該把好幾期都擠到同一天，當作還沒有收盤價先跳過。
 */
export const MAX_POSTPONE_DAYS = 14;

/** Free 方案可以有幾條規則（P2-08）；Pro 不限 */
export const FREE_DCA_RULE_LIMIT = 1;

/** "2026-10" + 6 → "2026-10-06" */
export function scheduledDate(period: string, dayOfMonth: number): string {
  return `${period}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** "2026-10-06" → "2026-10" */
export function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** "2026-12" → "2027-01" */
export function nextPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * 這條規則「扣款日已經到了、但還沒處理」的期數，由舊到新。
 * - 暫停中的規則：一期都沒有。
 * - 扣款日要在 [開始日期, 結束日期] 之間、不晚於今天，也不早於最近一次恢復的日期（暫停期間不補）。
 * - 已在 handledPeriods 的期數略過（產生過，或使用者刪掉了自動產生的交易）。
 */
export function duePeriods(rule: DcaRule, today: string): string[] {
  if (!rule.enabled) return [];
  const from = rule.resumedAt && rule.resumedAt > rule.startDate ? rule.resumedAt : rule.startDate;
  const until = rule.endDate && rule.endDate < today ? rule.endDate : today;
  const handled = new Set(rule.handledPeriods);
  const periods: string[] = [];
  for (let period = periodOf(from); period <= periodOf(until); period = nextPeriod(period)) {
    const date = scheduledDate(period, rule.dayOfMonth);
    if (date >= from && date <= until && !handled.has(period)) periods.push(period);
  }
  return periods;
}

/**
 * 要抓哪幾個月的日 K 才夠判斷這些期數：從第一期到今天所在的月份
 * （扣款日在月底又遇到連假，可能順延到下個月）。沒有待處理的期數回空陣列。
 */
export function candleMonthsFor(periods: string[], today: string): string[] {
  if (periods.length === 0) return [];
  const months: string[] = [];
  for (let month = periods[0]; month <= periodOf(today); month = nextPeriod(month)) months.push(month);
  return months;
}

export type DcaPurchase = {
  shares: number;
  /** 成交金額 = 成交價 × 股數 */
  amount: number;
  fee: number;
};

/**
 * 每期買幾股（P2-02）：股數 = floor(每期金額 ÷ (成交價 × (1 + 手續費率 × 折扣)))，手續費依 3.2。
 * 公式沒考慮最低手續費：算出來「成交金額 + 手續費」超過每期金額時（例如最低手續費設 20 元的小額扣款），
 * 再一股一股往下減，確保不會扣超過每期金額。連 1 股都買不起回 shares = 0。
 */
export function dcaPurchase(budget: number, price: number, settings: UserSettings): DcaPurchase {
  let shares = Math.floor(budget / (price * (1 + settings.feeRate * settings.feeDiscount)) + 1e-9);
  while (shares > 0 && price * shares + calcFee(price * shares, shares, settings) > budget) shares -= 1;
  if (shares <= 0) return { shares: 0, amount: 0, fee: 0 };
  const amount = price * shares;
  return { shares, amount, fee: calcFee(amount, shares, settings) };
}

/**
 * 會自動產生交易的規則 id。
 * Pro（或沒有方案限制）全部；Free 只有最早建立的 FREE_DCA_RULE_LIMIT 條：
 * Pro 到期時多的規則保留、可檢視，只是不再自動產生（P2-08「降級不刪資料」）。
 */
export function activeDcaRuleIds(rules: DcaRule[], unlimited: boolean): Set<string> {
  const sorted = [...rules].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const allowed = unlimited ? sorted : sorted.slice(0, FREE_DCA_RULE_LIMIT);
  return new Set(allowed.map((r) => r.id));
}

export type DcaSkip = {
  ruleId: string;
  period: string;
  /** noPrice：該交易日還沒有收盤價（或抓不到），下次開啟再補；tooSmall：每期金額連 1 股都買不起 */
  reason: "noPrice" | "tooSmall";
};

export type DcaGenerationInput = {
  ledger: Ledger;
  /** 各代號的日 K（由舊到新）。沒有這個代號（抓失敗）就當作還沒有收盤價 */
  candles: Record<string, Candle[] | undefined>;
  today: string;
  /** 只處理這些規則（見 activeDcaRuleIds）；沒給就全部 */
  ruleIds?: Set<string>;
  /** 產生交易 id */
  newId: () => string;
  /** createdAt／updatedAt */
  now: string;
};

export type DcaGenerationResult = {
  /** 新的記帳本；什麼都沒變時就是傳進來的那份（同一個物件） */
  ledger: Ledger;
  created: Transaction[];
  skipped: DcaSkip[];
};

/**
 * 依規則補產生所有已到期、還沒產生的買入交易（App 開啟時跑）。
 * - 扣款日遇到非交易日，順延到下一個有收盤價的日子；成交價 = 那天的收盤價。
 *   交易日用「這檔自己有收盤價的日子」判斷：價格本來就要用這檔的收盤價，不必再抓一檔基準。
 * - 順延超過 MAX_POSTPONE_DAYS 天（那段時間沒有資料）也當作還沒有收盤價。
 * - 該交易日還沒有收盤價：這期先不處理，也不標記，下次開啟再補。
 * - 產生後把期數記進 handledPeriods（規則 ID + 年月去重）；使用者之後刪掉交易也不會補回。
 * - 手續費一律用記帳本的手續費設定（UserSettings），規則沒有自己的費率。
 * - 金額不足買 1 股：不產生交易，但標記已處理，免得每次開 App 都重算一次。
 */
export function generateDcaTransactions(input: DcaGenerationInput): DcaGenerationResult {
  const { ledger, today } = input;
  const rules = ledger.dcaRules ?? [];
  const created: Transaction[] = [];
  const skipped: DcaSkip[] = [];
  let changed = false;

  const nextRules = rules.map((rule) => {
    if (input.ruleIds && !input.ruleIds.has(rule.id)) return rule;
    const periods = duePeriods(rule, today);
    if (periods.length === 0) return rule;

    const candles = (input.candles[rule.symbol] ?? []).filter((c) => c.date <= today && c.close > 0);
    const closeByDate = new Map(candles.map((c) => [c.date, c.close]));
    const dates = candles.map((c) => c.date);
    const handled: string[] = [];

    for (const period of periods) {
      const scheduled = scheduledDate(period, rule.dayOfMonth);
      const tradeDate = tradingDayOnOrAfter(scheduled, dates);
      if (tradeDate === null || tradeDate > addDays(scheduled, MAX_POSTPONE_DAYS)) {
        skipped.push({ ruleId: rule.id, period, reason: "noPrice" });
        continue;
      }
      const price = closeByDate.get(tradeDate) as number;
      const purchase = dcaPurchase(rule.amount, price, ledger.settings);
      handled.push(period);
      if (purchase.shares === 0) {
        skipped.push({ ruleId: rule.id, period, reason: "tooSmall" });
        continue;
      }
      created.push({
        id: input.newId(),
        symbol: rule.symbol,
        side: "buy",
        tradeDate,
        price,
        shares: purchase.shares,
        fee: purchase.fee,
        tax: 0,
        feeOverridden: false,
        source: "dca",
        dcaRuleId: rule.id,
        dcaPeriod: period,
        createdAt: input.now,
        updatedAt: input.now,
      });
    }

    if (handled.length === 0) return rule;
    changed = true;
    return { ...rule, handledPeriods: [...rule.handledPeriods, ...handled] };
  });

  if (!changed) return { ledger, created, skipped };
  return {
    ledger: { ...ledger, dcaRules: nextRules, transactions: [...ledger.transactions, ...created] },
    created,
    skipped,
  };
}

/**
 * 暫停或恢復。恢復時記下今天：暫停期間到期的期數不補，避免一恢復就冒出好幾筆沒扣過款的交易。
 * 狀態沒變就原樣回傳。
 */
export function setDcaRuleEnabled(rule: DcaRule, enabled: boolean, today: string): DcaRule {
  if (rule.enabled === enabled) return rule;
  return enabled ? { ...rule, enabled, resumedAt: today } : { ...rule, enabled };
}

/** 規則表單的欄位（字串，直接對應輸入框） */
export type DcaRuleFormValues = {
  symbol: string;
  amount: string;
  dayOfMonth: string;
  /** "YYYY/MM/DD" 或 "YYYY-MM-DD" */
  startDate: string;
  /** 選填 */
  endDate: string;
};

export type DcaRuleFormErrors = Partial<Record<keyof DcaRuleFormValues, string>>;

export type DcaRuleFields = Pick<DcaRule, "symbol" | "amount" | "dayOfMonth" | "startDate" | "endDate">;

export type DcaRuleFormResult = { ok: true; value: DcaRuleFields } | { ok: false; errors: DcaRuleFormErrors };

const ISO_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

/** 檢查規則表單（P2-02 規則欄位） */
export function parseDcaRuleForm(values: DcaRuleFormValues): DcaRuleFormResult {
  const errors: DcaRuleFormErrors = {};
  const symbol = values.symbol.trim().toUpperCase();
  if (symbol === "") errors.symbol = "請選擇股票";

  const amount = Number(values.amount.replace(/,/g, "").trim());
  if (values.amount.trim() === "" || !Number.isInteger(amount) || amount <= 0) {
    errors.amount = "每期金額必須是大於 0 的整數";
  }

  const day = Number(values.dayOfMonth.trim());
  if (!Number.isInteger(day) || day < DCA_MIN_DAY || day > DCA_MAX_DAY) {
    errors.dayOfMonth = `扣款日請填 ${DCA_MIN_DAY}–${DCA_MAX_DAY}`;
  }

  const startDate = toIsoDate(values.startDate);
  if (!startDate) errors.startDate = "請選擇開始日期";

  let endDate: string | undefined;
  if (values.endDate.trim() !== "") {
    endDate = toIsoDate(values.endDate) ?? undefined;
    if (!endDate) errors.endDate = "結束日期格式不對";
    else if (startDate && endDate < startDate) errors.endDate = "結束日期不可早於開始日期";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { symbol, amount, dayOfMonth: day, startDate: startDate as string, endDate },
  };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function toIsoDate(raw: string): string | null {
  const match = ISO_DATE.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
