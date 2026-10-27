import { isPro, PRO_FEATURES } from "./plan";

describe("isPro（對應 docs/stories/020）", () => {
  test("預設（沒開 Demo）不是 Pro", () => {
    expect(isPro({ demoUnlocked: false })).toBe(false);
  });

  test("打開 Demo 開關就是 Pro", () => {
    expect(isPro({ demoUnlocked: true })).toBe(true);
  });
});

describe("PRO_FEATURES", () => {
  test("列出實作指南 T14 的五項 Pro 功能，id 不重複", () => {
    const ids = PRO_FEATURES.map((f) => f.id);
    expect(ids).toEqual([
      "annualizedReturn",
      "etfDuelFull",
      "dividendAutoFill",
      "recurringInvestment",
      "assetHistory",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("說明文字不含買賣建議用語", () => {
    for (const feature of PRO_FEATURES) {
      expect(feature.description).not.toMatch(/建議|應該|買進|賣出/);
    }
  });
});
