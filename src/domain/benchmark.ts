import type { AdjustedClose } from "./adjustedPrice";
import { closeOnOrBefore, type DailyClose } from "./assetHistory";
import { shiftMonths } from "./candles";
import { fxRateOf, symbolCurrency, toTwd, twdOnlyFxRate, type FxRateLookup } from "./currency";
import { formatAmount } from "./holdings";
import type { Bucket, Dividend, Transaction } from "./ledgerTypes";
import { replaySymbol } from "./position";

/**
 * 個股 vs ETF 對決 B：如果改買 0050（product-spec P2-05 B，實作指南 T16）。
 * 對應 docs/stories/022-benchmark-duel.md。純函式，資料由 src/hooks/useBenchmarkDuel.ts 準備。
 *
 * 模擬規則：
 * - 每筆買入的現金（成交金額 + 手續費），同一天用基準的還原收盤價買入對應單位，可以是小數單位。
 * - 每筆賣出的淨額（成交金額 − 手續費 − 證交稅），同一天賣出等值的基準單位。
 * - 實際領到的股利不另外投入基準：還原收盤價已經把基準自己的股利、分割（0050 2025-06-18 一拆四）算進去。
 * - 基準那天沒有價格（假日、停牌）就用前一個交易日的價格。基準本身不算交易成本。
 * - 期間不是「全部」時，期初那天手上持股的市值當成一筆期初投入。
 *
 * 結論只陳述事實，不給建議：不得出現「建議」「應該」「買進」「賣出」（單元測試會掃描）。
 */

export type BenchmarkSymbol = "0050" | "006208";

export const BENCHMARKS: readonly { value: BenchmarkSymbol; label: string }[] = [
  { value: "0050", label: "0050" },
  { value: "006208", label: "006208" },
];

export type BenchmarkRange = "all" | "ytd" | "1y" | "3y";

export const BENCHMARK_RANGES: readonly { value: BenchmarkRange; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "ytd", label: "今年" },
  { value: "1y", label: "近 1 年" },
  { value: "3y", label: "近 3 年" },
];

/** 模擬哪些持股：只有衛星（個股），或整體 */
export type BenchmarkScope = Bucket | "all";

export const BENCHMARK_SCOPE_LABEL: Record<"satellite" | "all", string> = {
  satellite: "衛星（個股）",
  all: "整體",
};

/** 一筆現金流：正數是投入（買入），負數是取回（賣出淨額） */
export type BenchmarkFlow = { date: string; amount: number };

/**
 * 期間的第一天（含）。今年 = 1 月 1 日；近 1 年／近 3 年 = 往前推 12／36 個月的同一天；
 * 全部或期間開始時還沒有任何交易 = 第一筆交易那天。沒有交易回 null。
 */
export function benchmarkStart(
  range: BenchmarkRange,
  today: string,
  transactions: readonly Pick<Transaction, "tradeDate">[],
): string | null {
  let first: string | null = null;
  for (const t of transactions) if (first === null || t.tradeDate < first) first = t.tradeDate;
  if (first === null) return null;
  const start =
    range === "ytd" ? `${today.slice(0, 4)}-01-01` : range === "1y" ? shiftMonths(today, -12) : range === "3y" ? shiftMonths(today, -36) : first;
  return start > first ? start : first;
}

/**
 * 期間內的現金流（交易日在 start 當天或之後、today 當天或之前）。
 * 買入：+(成交金額 + 手續費)；賣出：−(成交金額 − 手續費 − 證交稅)。和 XIRR 的現金流同一套金額，只是正負號相反。
 * 金額依每筆自己的 fxRate 換成台幣（規格 3.8）。
 */
export function benchmarkFlows(transactions: readonly Transaction[], start: string, today: string): BenchmarkFlow[] {
  return transactions
    .filter((t) => t.tradeDate >= start && t.tradeDate <= today)
    .map((t) => {
      const gross = t.price * t.shares;
      const amount = t.side === "buy" ? gross + t.fee : -(gross - t.fee - t.tax);
      return { date: t.tradeDate, amount: toTwd(amount, fxRateOf(t)) };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 期初那天（不含當天的交易）每一檔還持有的股數。只列股數 > 0 的 */
export function sharesBefore(
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
  start: string,
): Record<string, number> {
  const txBefore = transactions.filter((t) => t.tradeDate < start);
  const divBefore = dividends.filter((d) => d.exDate < start);
  const shares: Record<string, number> = {};
  for (const symbol of new Set(txBefore.map((t) => t.symbol))) {
    const { state } = replaySymbol(symbol, txBefore, divBefore);
    if (state.shares > 0) shares[symbol] = state.shares;
  }
  return shares;
}

/**
 * 期初市值 = 期初持股 × 期初當天（或之前最近一個交易日）的收盤價。
 * 有一檔找不到價格回 null：少算一檔會讓期初投入變少，結果不準，不如不算。
 */
export function openingValue(
  shares: Readonly<Record<string, number>>,
  closes: Readonly<Record<string, readonly DailyClose[]>>,
  start: string,
  /** 外幣持股換台幣用：代號的幣別與期初那天的匯率（規格 3.8）。預設全部是台幣 */
  fx: { transactions: readonly Pick<Transaction, "symbol" | "currency">[]; rateOn: FxRateLookup } = {
    transactions: [],
    rateOn: twdOnlyFxRate,
  },
): number | null {
  let total = 0;
  for (const [symbol, count] of Object.entries(shares)) {
    const price = closeOnOrBefore(closes[symbol], start);
    const fxRate = fx.rateOn(symbolCurrency(symbol, fx.transactions), start);
    if (price === null || fxRate === null) return null;
    total += toTwd(count * price, fxRate);
  }
  return total;
}

export type BenchmarkSimulation =
  | {
      kind: "ok";
      /** 最後持有的基準單位（可為小數） */
      units: number;
      /** 現在的模擬價值 = 單位 × 最新還原收盤價 */
      value: number;
      /** 最新價格的日期 */
      asOf: string;
      /** 有一筆賣出的金額，超過當時模擬部位的價值（只能賣到 0） */
      oversold: boolean;
    }
  /** 某筆現金流早於基準最早的價格（例如 006208 2012 年才上市），模擬不了 */
  | { kind: "tooEarly"; flowDate: string; firstPriceDate: string | null };

/**
 * 把現金流原封不動地拿去買賣基準。adjCloses 要由舊到新，最後一筆當作「現在」的價格。
 * 賣出的金額超過模擬部位價值時，只能賣到 0 單位，並標記 oversold（畫面會說明，結果偏高）。
 */
export function simulateBenchmark(
  flows: readonly BenchmarkFlow[],
  adjCloses: readonly AdjustedClose[],
): BenchmarkSimulation {
  const firstPriceDate = adjCloses.length > 0 ? adjCloses[0].date : null;
  let units = 0;
  let oversold = false;
  for (const flow of flows) {
    const price = adjCloseOnOrBefore(adjCloses, flow.date);
    if (price === null) return { kind: "tooEarly", flowDate: flow.date, firstPriceDate };
    const delta = flow.amount / price;
    if (units + delta < 0) {
      oversold = true;
      units = 0;
    } else {
      units += delta;
    }
  }
  // 能走到這裡又沒有價格，代表根本沒有現金流
  if (adjCloses.length === 0) return { kind: "ok", units: 0, value: 0, asOf: "", oversold: false };
  const last = adjCloses[adjCloses.length - 1];
  return { kind: "ok", units, value: units * last.adjClose, asOf: last.date, oversold };
}

/** 某天（含）以前最近的還原收盤價；沒有回 null */
function adjCloseOnOrBefore(list: readonly AdjustedClose[], date: string): number | null {
  let found: number | null = null;
  for (const c of list) {
    if (c.date > date) break;
    found = c.adjClose;
  }
  return found;
}

/**
 * 實際的「現在價值」= 目前持股市值 + 期間內領到的現金股利。
 * 基準的還原收盤價已含股利，實際這邊也要把領到的股利算回來才公平。
 * 股利日期用發放日（沒有發放日用除息日），和 XIRR 一致。
 */
export function actualValue(
  marketValue: number,
  dividends: readonly Dividend[],
  start: string,
  today: string,
): number {
  let cash = 0;
  for (const d of dividends) {
    if (d.type !== "cash" || d.status !== "received") continue;
    const date = d.payDate ?? d.exDate;
    if (date >= start && date <= today) cash += toTwd(d.cashAmount ?? 0, fxRateOf(d));
  }
  return marketValue + cash;
}

export type BenchmarkComparison = {
  benchmark: BenchmarkSymbol;
  /** 模擬改買基準，現在的價值（四捨五入到元） */
  benchmarkValue: number;
  /** 實際現在的價值（四捨五入到元） */
  actualValue: number;
  /** benchmarkValue − actualValue；正數代表改買基準會比較多 */
  difference: number;
  /** 期間內實際投入的總額（期初市值 + 每筆買入），給畫面當參考 */
  invested: number;
  oversold: boolean;
};

/** 組出比較結果。金額先四捨五入到元再相減，畫面上的數字自己算也對得起來 */
export function compareWithBenchmark(
  benchmark: BenchmarkSymbol,
  simulated: Extract<BenchmarkSimulation, { kind: "ok" }>,
  actual: number,
  flows: readonly BenchmarkFlow[],
): BenchmarkComparison {
  const benchmarkValue = roundYuan(simulated.value);
  const actualRounded = roundYuan(actual);
  const invested = roundYuan(flows.reduce((sum, f) => (f.amount > 0 ? sum + f.amount : sum), 0));
  return {
    benchmark,
    benchmarkValue,
    actualValue: actualRounded,
    difference: benchmarkValue - actualRounded,
    invested,
    oversold: simulated.oversold,
  };
}

function roundYuan(n: number): number {
  const r = Math.round(n);
  return r === 0 ? 0 : r; // 避免 -0
}

/**
 * 一句話結論：「若改買 0050，現在價值 120,000 元，比你實際多 5,000 元。」
 * 差距在 1 元以內說「和你實際差不多」。只陳述事實。
 */
export function benchmarkConclusion(comparison: BenchmarkComparison): string {
  const { benchmark, benchmarkValue, difference } = comparison;
  const head = `若改買 ${benchmark}，現在價值 ${formatAmount(benchmarkValue)} 元`;
  if (Math.abs(difference) < 1) return `${head}，和你實際差不多。`;
  return `${head}，比你實際${difference > 0 ? "多" : "少"} ${formatAmount(Math.abs(difference))} 元。`;
}

export type BenchmarkDuelInput = {
  benchmark: BenchmarkSymbol;
  /** 這個範圍（衛星或整體）的交易與股利，已經篩好代號 */
  transactions: readonly Transaction[];
  dividends: readonly Dividend[];
  /** 這個範圍目前的市值；有持股拿不到現價時是 null */
  marketValue: number | null;
  /** 期間第一天（benchmarkStart） */
  start: string;
  today: string;
  /** 基準的還原收盤價，至少涵蓋 start 前一個月到今天 */
  adjCloses: readonly AdjustedClose[];
  /** 期初持股的收盤價（期間是「全部」或期初沒有持股時不需要） */
  openingCloses: Readonly<Record<string, readonly DailyClose[]>>;
  /** 外幣期初持股的匯率 [多幣別預留]；沒給只認得台幣 */
  fxRateOn?: FxRateLookup;
};

export type BenchmarkDuelResult =
  | { kind: "ok"; comparison: BenchmarkComparison; text: string }
  | { kind: "missingPrice"; text: string }
  | { kind: "noFlows"; text: string }
  | { kind: "tooEarly"; text: string };

/** 把上面幾步串起來：期初市值 → 現金流 → 模擬 → 和實際比較 → 白話結論 */
export function buildBenchmarkDuel(input: BenchmarkDuelInput): BenchmarkDuelResult {
  const { benchmark, transactions, dividends, marketValue, start, today, adjCloses, openingCloses } = input;
  const opening = openingValue(sharesBefore(transactions, dividends, start), openingCloses, start, {
    transactions,
    rateOn: input.fxRateOn ?? twdOnlyFxRate,
  });
  if (marketValue === null || opening === null) {
    return { kind: "missingPrice", text: "有股票拿不到價格，算不出實際價值，先不比較。" };
  }
  const flows = benchmarkFlows(transactions, start, today);
  if (opening > 0) flows.unshift({ date: start, amount: opening });
  if (flows.length === 0) {
    return { kind: "noFlows", text: "這段期間沒有持股，也沒有交易，沒有可以比較的。" };
  }
  const simulated = simulateBenchmark(flows, adjCloses);
  if (simulated.kind === "tooEarly") {
    const since = simulated.firstPriceDate ? `只有 ${simulated.firstPriceDate} 以後的價格` : "拿不到價格";
    return {
      kind: "tooEarly",
      text: `${benchmark} ${since}，${simulated.flowDate} 那筆紀錄比它還早，模擬不了。可以換一個期間或基準再看看。`,
    };
  }
  const comparison = compareWithBenchmark(benchmark, simulated, actualValue(marketValue, dividends, start, today), flows);
  return { kind: "ok", comparison, text: benchmarkConclusion(comparison) };
}
