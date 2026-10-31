import { participatingShares } from "./autoDividends";
import { localIsoDate } from "./buyDate";
import { nextPeriod, periodOf, scheduledDate } from "./dca";
import { buildOverview } from "./overview";
import { formatReturnRate, formatSignedAmount } from "./pnl";
import type { DcaRule, Ledger } from "./ledgerTypes";
import type { Candle, DividendEvent, Quote } from "./types";

/**
 * 本地通知要排什麼、內容寫什麼（Story 034）。這裡只做計算，不碰 expo-notifications：
 * 排程在 src/native/notifications.ts，什麼時候重排在 src/ui/NotificationScheduler.tsx。
 *
 * 不抓休市日曆：除息日前一天、扣款日都只跳過週六日。國定假日（春節、颱風假）可能提早或照常提醒，
 * 收盤損益則以「行情的資料日期是不是今天」判斷有沒有開盤（見 buildCloseSummary）。
 * 時間一律是手機當地時間；同學的手機都在台灣。
 */

/** 三種通知，設定頁各有一個開關 */
export type NotificationKind = "closeSummary" | "dividend" | "dca";

/** 一則要在未來某個時間跳出的通知 */
export type ReminderRequest = {
  /** 固定的識別碼：同一件事重排時用一樣的 id，系統只會留一則 */
  id: string;
  kind: NotificationKind;
  /** 哪一天（YYYY-MM-DD）幾點幾分跳出，手機當地時間 */
  date: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
};

/** 除息提醒、扣款提醒都在早上 9 點（開盤時）跳出 */
export const MORNING_HOUR = 9;

/**
 * 收盤損益只在 14:30 ～ 19:00 之間由背景工作發送；19:00 是「打開 app 看看」的退路提醒。
 * 14:30 是收盤後證交所大約更新完收盤價的時間；背景工作晚於 19:00 才跑的那天就不發了，免得和退路提醒重複。
 */
export const CLOSE_SUMMARY_FROM = { hour: 14, minute: 30 };
export const CLOSE_FALLBACK_AT = { hour: 19, minute: 0 };

/** 往後排幾天的提醒。app 每次打開、記帳本有變都會重排，所以不用排太遠 */
export const REMINDER_HORIZON_DAYS = 45;
/** 退路提醒往後排幾個交易日（平日） */
export const CLOSE_FALLBACK_DAYS = 10;

// ───────────── 日期 ─────────────

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

export function isWeekend(iso: string): boolean {
  const day = parseIso(iso).getDay();
  return day === 0 || day === 6;
}

/** iso 當天或之後的第一個平日（扣款日遇週末順延） */
export function weekdayOnOrAfter(iso: string): string {
  let date = iso;
  while (isWeekend(date)) date = addDays(date, 1);
  return date;
}

/** iso 之前（不含當天）的最後一個平日（除息日前一天遇週末往前找到週五） */
export function weekdayBefore(iso: string): string {
  let date = addDays(iso, -1);
  while (isWeekend(date)) date = addDays(date, -1);
  return date;
}

/** "2026-11-14" → "11/14（五）" */
export function shortDateLabel(iso: string): string {
  const date = parseIso(iso);
  const weekday = "日一二三四五六"[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}（${weekday}）`;
}

/** 這則提醒的時間是否已經過了（過了就不排，系統會立刻跳出） */
export function isPast(request: Pick<ReminderRequest, "date" | "hour" | "minute">, now: Date): boolean {
  const at = parseIso(request.date);
  at.setHours(request.hour, request.minute, 0, 0);
  return at.getTime() <= now.getTime();
}

// ───────────── 除息日前一天 ─────────────

/** 一檔即將除息的資料：預估股利（自動帶入的 estimated）或除權息公告 */
export type UpcomingExDividend = {
  symbol: string;
  exDate: string;
  /** 每股現金股利；還沒公告金額是 null */
  cashPerShare: number | null;
};

/**
 * 從除權息公告（corporateActionSource，今天以後的事件）找出要提醒的除息日。
 * 只算現金股利（cashPerShare 為 null 表示已公告除息日、金額未定，照樣提醒）；純配股（cashPerShare 0）也提醒。
 */
export function upcomingExDividends(events: readonly DividendEvent[], today: string): UpcomingExDividend[] {
  const seen = new Set<string>();
  const result: UpcomingExDividend[] = [];
  for (const e of events) {
    if (e.exDate <= today) continue;
    const key = `${e.symbol}|${e.exDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ symbol: e.symbol, exDate: e.exDate, cashPerShare: e.cashPerShare });
  }
  return result;
}

/**
 * 除息日前一天（遇週末往前到週五）早上 9 點提醒。只提醒「現在還持有」的股票：
 * 參與股數用記帳本裡除息日前的交易算（和自動帶入同一套，P2-03），0 股就不提醒。
 * names 是代號 → 名稱，沒有就只寫代號。
 */
export function planDividendReminders(
  ledger: Pick<Ledger, "transactions" | "dividends">,
  upcoming: readonly UpcomingExDividend[],
  today: string,
  names: Readonly<Record<string, string>> = {},
): ReminderRequest[] {
  const lastDay = addDays(today, REMINDER_HORIZON_DAYS);
  const result: ReminderRequest[] = [];
  for (const u of upcoming) {
    if (u.exDate <= today || u.exDate > lastDay) continue;
    const shares = participatingShares(ledger, u.symbol, u.exDate);
    if (shares <= 0) continue;
    const remindOn = weekdayBefore(u.exDate);
    if (remindOn < today) continue;
    const label = names[u.symbol] ? `${u.symbol} ${names[u.symbol]}` : u.symbol;
    const when = remindOn === addDays(u.exDate, -1) ? "明天" : shortDateLabel(u.exDate);
    const estimate =
      u.cashPerShare && u.cashPerShare > 0
        ? `每股 ${u.cashPerShare} 元，以目前 ${shares.toLocaleString("en-US")} 股估算約 ${Math.round(u.cashPerShare * shares).toLocaleString("en-US")} 元。`
        : "配發金額還沒公告。";
    result.push({
      id: `dividend-${u.symbol}-${u.exDate}`,
      kind: "dividend",
      date: remindOn,
      hour: MORNING_HOUR,
      minute: 0,
      title: `${label} ${when}除息`,
      body: `今天收盤時還持有才領得到這次股利。${estimate}`,
    });
  }
  return result;
}

// ───────────── 定期定額扣款日 ─────────────

/**
 * 定期定額扣款日當天早上 9 點提醒（P2-02 的規則，Story 024）。
 * - 只提醒啟用中、而且 activeIds 裡有的規則（Free 方案超過條數的規則不自動產生，也不提醒）。
 * - 扣款日遇週末順延到週一，和自動產生交易的規則一致；已處理過的期數不提醒。
 * - 開始日之前、結束日之後的期數不提醒。
 */
export function planDcaReminders(
  rules: readonly DcaRule[],
  activeIds: ReadonlySet<string>,
  today: string,
  names: Readonly<Record<string, string>> = {},
): ReminderRequest[] {
  const lastDay = addDays(today, REMINDER_HORIZON_DAYS);
  const result: ReminderRequest[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !activeIds.has(rule.id)) continue;
    const handled = new Set(rule.handledPeriods);
    // 從一週前的那個月開始看：上個月 28 日遇週末會順延到這個月初
    for (let period = periodOf(addDays(today, -7)); period <= periodOf(lastDay); period = nextPeriod(period)) {
      if (handled.has(period)) continue;
      const due = scheduledDate(period, rule.dayOfMonth);
      if (due < rule.startDate || (rule.endDate && due > rule.endDate)) continue;
      if (rule.resumedAt && due < rule.resumedAt) continue;
      const on = weekdayOnOrAfter(due);
      if (on < today || on > lastDay) continue;
      const label = names[rule.symbol] ? `${rule.symbol} ${names[rule.symbol]}` : rule.symbol;
      result.push({
        id: `dca-${rule.id}-${period}`,
        kind: "dca",
        date: on,
        hour: MORNING_HOUR,
        minute: 0,
        title: `今天是 ${label} 定期定額扣款日`,
        body: `這期 ${rule.amount.toLocaleString("en-US")} 元。收盤後打開「賺了嗎」，會自動記上這筆買入。`,
      });
    }
  }
  return result;
}

// ───────────── 收盤損益 ─────────────

/** 退路提醒：接下來幾個平日的 19:00「打開 app 看看今天賺多少」。背景工作發了當天的損益就取消當天的退路 */
export function planCloseFallbacks(now: Date, days: number = CLOSE_FALLBACK_DAYS): ReminderRequest[] {
  const result: ReminderRequest[] = [];
  let date = localIsoDate(now);
  while (result.length < days) {
    if (!isWeekend(date)) {
      const request: ReminderRequest = {
        id: closeFallbackId(date),
        kind: "closeSummary",
        date,
        hour: CLOSE_FALLBACK_AT.hour,
        minute: CLOSE_FALLBACK_AT.minute,
        title: "今天收盤了",
        body: "打開「賺了嗎」看看今天賺多少。休市日請忽略這則提醒。",
      };
      if (!isPast(request, now)) result.push(request);
    }
    date = addDays(date, 1);
  }
  return result;
}

export function closeFallbackId(date: string): string {
  return `close-fallback-${date}`;
}

/**
 * 背景工作現在該不該算收盤損益：平日、14:30 ～ 19:00、今天還沒發過。
 * lastSentDate 是上次發送的日期（YYYY-MM-DD），沒發過是 null。
 */
export function shouldSendCloseSummary(now: Date, lastSentDate: string | null): boolean {
  const today = localIsoDate(now);
  if (isWeekend(today) || lastSentDate === today) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = CLOSE_SUMMARY_FROM.hour * 60 + CLOSE_SUMMARY_FROM.minute;
  const until = CLOSE_FALLBACK_AT.hour * 60 + CLOSE_FALLBACK_AT.minute;
  return minutes >= from && minutes < until;
}

/** "2026/10/31"、"2026-10-31" → "2026-10-31" */
function normalizeDate(date: string): string {
  return date.replace(/\//g, "-");
}

/** 一檔的前一個交易日收盤價：日 K 裡日期早於今天的最後一根 */
export function previousClose(candles: readonly Candle[], today: string): number | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].date < today) return candles[i].close;
  }
  return null;
}

export type CloseSummary = {
  /** 今天的損益 = Σ 持有股數 × (今天收盤 − 昨天收盤) */
  todayChange: number;
  /** 整體總報酬（含已實現、股利）；有持股缺價時 null */
  totalReturn: number | null;
  /** 總報酬率；累計投入 0 或缺價時 null */
  returnRate: number | null;
};

/**
 * 收盤損益（Story 034）：記帳本 + 今天的收盤價 + 每檔昨天的收盤價。
 * 回 null 代表今天不發：
 * - 沒有持有中的股票；
 * - 有任何一檔的行情日期不是今天（休市、或證交所還沒更新，背景工作下次再試）；
 * - 有任何一檔拿不到報價或昨收（少算一檔會讓數字看起來不對，不如不發）。
 * 今天才買進的股數也用昨收算，和券商 app 的「今日損益」可能差一點。
 */
export function buildCloseSummary(
  ledger: Ledger,
  quotes: Readonly<Record<string, Quote>>,
  previousCloses: Readonly<Record<string, number>>,
  today: string,
): CloseSummary | null {
  const overview = buildOverview(ledger, (symbol) => quotes[symbol], today);
  const holdings = overview.holdings;
  if (holdings.length === 0) return null;

  let todayChange = 0;
  for (const h of holdings) {
    const quote = quotes[h.position.symbol];
    const prev = previousCloses[h.position.symbol];
    if (!quote || prev === undefined || !quote.asOf || normalizeDate(quote.asOf) !== today) return null;
    todayChange += h.position.shares * (quote.price - prev);
  }
  const overall = overview.summary.overall;
  return { todayChange: Math.round(todayChange), totalReturn: overall.totalReturn, returnRate: overall.returnRate };
}

/** 通知內容：「今天 +3,200 元，總報酬 +8.50%」 */
export function closeSummaryMessage(summary: CloseSummary): { title: string; body: string } {
  const today = `今天 ${formatSignedAmount(summary.todayChange)} 元`;
  const total =
    summary.returnRate === null || summary.totalReturn === null
      ? ""
      : `，總報酬 ${formatSignedAmount(summary.totalReturn)} 元（${formatReturnRate(summary.returnRate)}）`;
  return { title: "今日收盤損益", body: `${today}${total}` };
}

// ───────────── 全部一起排 ─────────────

/** 設定頁三個通知開關 */
export type NotificationSwitches = { closeSummary: boolean; dividendReminder: boolean; dcaReminder: boolean };

export const ALL_NOTIFICATION_KINDS: readonly NotificationKind[] = ["closeSummary", "dividend", "dca"];

/**
 * app 打開、回到前景、記帳本或開關有變時，要排的全部提醒（Story 034）。關掉的種類回空的，排程那邊會整批取消。
 * - 收盤損益的退路提醒：今天已經由背景工作發過損益（closeSummarySentOn 是今天）就不排今天的。
 * - activeDcaRuleIds：Free 方案超過條數的規則不提醒（和自動產生交易一致）。
 */
export function planReminders(input: {
  switches: NotificationSwitches;
  ledger: Ledger;
  upcoming: readonly UpcomingExDividend[];
  activeDcaRuleIds: ReadonlySet<string>;
  now: Date;
  closeSummarySentOn: string | null;
  names?: Readonly<Record<string, string>>;
}): ReminderRequest[] {
  const { switches, ledger, upcoming, now, closeSummarySentOn, names = {} } = input;
  const today = localIsoDate(now);
  const result: ReminderRequest[] = [];
  if (switches.closeSummary) {
    result.push(...planCloseFallbacks(now).filter((r) => !(r.date === today && closeSummarySentOn === today)));
  }
  if (switches.dividendReminder) result.push(...planDividendReminders(ledger, upcoming, today, names));
  if (switches.dcaReminder) {
    result.push(...planDcaReminders(ledger.dcaRules ?? [], input.activeDcaRuleIds, today, names));
  }
  return result.filter((r) => !isPast(r, now));
}
