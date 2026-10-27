import type { Insight, InsightProvider } from "./InsightProvider";

/** 固定的解讀內容，對應假價表的台積電 500 → 520（+4%）。 */
export const FAKE_INSIGHT: Insight = {
  summary: "這組持股合計賺 20,000 元，報酬率 +4.00%。",
  observations: ["台積電現價 520 元，比平均成本 500 元高 20 元。", "持有 1,000 股，未實現盈虧 +20,000 元。"],
  riskNote: "以上依收盤價計算，未計入手續費與交易稅，股價會變動。",
  disclaimer: "僅為數據解讀，不構成投資建議",
  filtered: false,
};

/** 測試用：不打網路，固定回同一份結果（或由呼叫端自訂，例如丟錯誤） */
export function createFakeInsightProvider(
  result: Insight | (() => Promise<Insight>) = FAKE_INSIGHT,
): InsightProvider {
  return {
    async getInsight() {
      return typeof result === "function" ? result() : structuredClone(result);
    },
  };
}

export const fakeInsightProvider: InsightProvider = createFakeInsightProvider();
