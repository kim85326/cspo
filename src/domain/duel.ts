import { DASH, formatRate, type HoldingView } from "./holdings";
import type { Bucket, Ledger } from "./ledgerTypes";
import { summarize, type GroupSummary } from "./portfolio";
import { portfolioAnnualizedReturns, type AnnualizedReturn } from "./xirr";

/**
 * 個股 vs ETF 對決 A：我的核心 vs 我的衛星（product-spec P2-05 A，實作指南 T12）。
 * 對應 docs/stories/027-core-vs-satellite-duel.md。
 * 結論只陳述事實，不給建議：不得出現「建議」「應該」「買進」「賣出」（單元測試會掃描）。
 */

/** 一邊（核心或衛星）的數字 */
export type DuelSide = {
  /** 記帳本裡有沒有這一邊的任何交易或股利（含已出清） */
  hasRecords: boolean;
  summary: GroupSummary;
  annualized: AnnualizedReturn;
};

export type Duel = { core: DuelSide; satellite: DuelSide };

/** 從持股明細的資料組出兩邊的數字。分組規則和首頁一樣（使用者設定優先，否則 ETF → 核心）。 */
export function buildDuel(ledger: Ledger, views: readonly HoldingView[], today: string): Duel {
  const positions = views.map((v) => v.position);
  const summary = summarize(positions, ledger.holdingSettings);
  const annualized = portfolioAnnualizedReturns(
    positions,
    ledger.transactions,
    ledger.dividends,
    ledger.holdingSettings,
    today,
  );
  const side = (bucket: Bucket): DuelSide => ({
    hasRecords: views.some((v) => v.bucket === bucket),
    summary: summary[bucket],
    annualized: annualized[bucket],
  });
  return { core: side("core"), satellite: side("satellite") };
}

/** 比的是哪一種報酬率 */
export type DuelMetric = "annualized" | "simple";

/** 為什麼改比簡單報酬率 */
export type SimpleReason = "underOneYear" | "annualizedUnavailable" | "annualizedHidden";

export type DuelConclusion =
  | { kind: "noRecords"; text: string }
  | { kind: "oneSide"; missing: Bucket; text: string }
  | { kind: "missingPrice"; text: string }
  | { kind: "notEnoughData"; text: string }
  | {
      kind: "compared";
      metric: DuelMetric;
      /** 誰的報酬率比較高；顯示到小數點後一位相同就算持平 */
      leader: Bucket | "tie";
      text: string;
      /** 改比簡單報酬率時，說明原因（給新手看的白話） */
      note: string | null;
      reason: SimpleReason | null;
    };

const SIMPLE_NOTE: Record<SimpleReason, string> = {
  underOneYear:
    "持有還不到一年，換算成年化會把短期的漲跌放大，所以先比報酬率。報酬率沒有把持有時間長短算進去。",
  annualizedUnavailable: "年化報酬率算不出來，所以先比報酬率。報酬率沒有把持有時間長短算進去。",
  annualizedHidden: "這裡比的是報酬率，沒有把持有時間長短算進去。",
};

/**
 * 一句話結論，例如「你的個股年化 6.2%，ETF 年化 9.8%，個股落後 3.6%。」
 * - 兩邊都有年化報酬率才比年化；任一邊持有未滿一年、算不出來，或 annualizedVisible 是 false（Free 版鎖住），
 *   改比簡單報酬率，並附上原因。
 * - 任一邊沒有紀錄、缺價格、或報酬率算不出來時，不下結論，改說明為什麼。
 * - 差距用畫面上顯示的數字（四捨五入到 0.1%）相減，讓新手自己算也對得起來。
 */
export function duelConclusion(duel: Duel, annualizedVisible: boolean): DuelConclusion {
  const { core, satellite } = duel;
  if (!core.hasRecords && !satellite.hasRecords) {
    return { kind: "noRecords", text: "還沒有任何 ETF 或個股的紀錄，記下交易後就能比較。" };
  }
  if (!core.hasRecords) {
    return {
      kind: "oneSide",
      missing: "core",
      text: "目前只有個股的紀錄，還沒有 ETF 可以比。有 ETF 的交易紀錄後，這裡會告訴你個股有沒有贏過 ETF。",
    };
  }
  if (!satellite.hasRecords) {
    return {
      kind: "oneSide",
      missing: "satellite",
      text: "目前只有 ETF 的紀錄，還沒有個股可以比。有個股的交易紀錄後，這裡會告訴你個股有沒有贏過 ETF。",
    };
  }
  if (core.summary.missingPriceCount > 0 || satellite.summary.missingPriceCount > 0) {
    return { kind: "missingPrice", text: "有股票拿不到現價，算不出目前賺多少，先不比較。" };
  }
  if (core.summary.returnRate === null || satellite.summary.returnRate === null) {
    return { kind: "notEnoughData", text: "資料還不夠，算不出報酬率，先不比較。" };
  }

  if (annualizedVisible && core.annualized.kind === "rate" && satellite.annualized.kind === "rate") {
    return compare("annualized", satellite.annualized.rate, core.annualized.rate, null);
  }
  const reason: SimpleReason = !annualizedVisible
    ? "annualizedHidden"
    : core.annualized.kind === "underOneYear" || satellite.annualized.kind === "underOneYear"
      ? "underOneYear"
      : "annualizedUnavailable";
  return compare("simple", satellite.summary.returnRate, core.summary.returnRate, reason);
}

function compare(
  metric: DuelMetric,
  satelliteRate: number,
  coreRate: number,
  reason: SimpleReason | null,
): DuelConclusion {
  const label = metric === "annualized" ? "年化" : "報酬率";
  // 以「千分之一」為單位的整數：0.062 → 62，代表 6.2%
  const s = toTenthsOfPercent(satelliteRate);
  const c = toTenthsOfPercent(coreRate);
  const diff = s - c;
  const leader: Bucket | "tie" = diff > 0 ? "satellite" : diff < 0 ? "core" : "tie";
  const head = `你的個股${label} ${formatTenths(s)}，ETF ${label} ${formatTenths(c)}`;
  const tail =
    leader === "tie"
      ? "兩邊差不多。"
      : `個股${leader === "satellite" ? "領先" : "落後"} ${formatTenths(Math.abs(diff))}。`;
  return {
    kind: "compared",
    metric,
    leader,
    text: `${head}，${tail}`,
    note: reason ? SIMPLE_NOTE[reason] : null,
    reason,
  };
}

function toTenthsOfPercent(rate: number): number {
  const tenths = Math.round(rate * 1000);
  return tenths === 0 ? 0 : tenths; // 避免 -0
}

/** 62 → "6.2%"、-31 → "-3.1%" */
function formatTenths(tenths: number): string {
  return `${(tenths / 10).toFixed(1)}%`;
}

/** 年化報酬率的顯示：+10.00%（和報酬率同一種格式）、「持有未滿一年」或 — */
export function formatAnnualized(annualized: AnnualizedReturn): string {
  if (annualized.kind === "underOneYear") return "持有未滿一年";
  if (annualized.kind === "unavailable") return DASH;
  return formatRate(annualized.rate);
}
