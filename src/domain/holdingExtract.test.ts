import {
  applyExtraction,
  matchExtractedToStocks,
  normalizeNumber,
  parseExtractionResult,
  type ExtractedHolding,
  type ExtractionResult,
  type HoldingDraft,
} from "./holdingExtract";
import type { StockInfo } from "./types";

const STOCKS: StockInfo[] = [
  { symbol: "2330", name: "台積電" },
  { symbol: "2317", name: "鴻海" },
  { symbol: "2454", name: "聯發科" },
  { symbol: "2303", name: "聯電" },
  { symbol: "0050", name: "元大台灣50" },
  { symbol: "2603", name: "長榮" },
];

const high = (h: Omit<ExtractedHolding, "confidence">): ExtractedHolding => ({
  ...h,
  confidence: "high",
});

describe("normalizeNumber", () => {
  test("去掉千分位逗號與貨幣符號", () => {
    expect(normalizeNumber("1,000")).toBe("1000");
    expect(normalizeNumber("NT$ 520.5")).toBe("520.5");
    expect(normalizeNumber("12,345.60")).toBe("12345.6");
  });

  test("全形數字也能讀", () => {
    expect(normalizeNumber("５００")).toBe("500");
  });

  test("讀不出數字就回空字串", () => {
    expect(normalizeNumber("--")).toBe("");
    expect(normalizeNumber("")).toBe("");
    expect(normalizeNumber(undefined)).toBe("");
  });
});

describe("matchExtractedToStocks", () => {
  test("代號與名稱都有：用代號對到股票", () => {
    const [m] = matchExtractedToStocks([high({ symbol: "2330", name: "台積電" })], STOCKS);
    expect(m.stock?.symbol).toBe("2330");
    expect(m.confidence).toBe("high");
  });

  test("只有名稱沒代號：用名稱對到股票", () => {
    const [m] = matchExtractedToStocks([high({ name: "鴻海", buyPrice: "200" })], STOCKS);
    expect(m.stock?.symbol).toBe("2317");
    expect(m.confidence).toBe("high");
  });

  test("代號是全形：轉成半形再對", () => {
    const [m] = matchExtractedToStocks([high({ symbol: "２３３０" })], STOCKS);
    expect(m.stock?.symbol).toBe("2330");
  });

  test("代號帶 .TW 後綴也能對", () => {
    const [m] = matchExtractedToStocks([high({ symbol: "2330.TW" })], STOCKS);
    expect(m.stock?.symbol).toBe("2330");
  });

  test("張數換算成股數：2 張 = 2000 股、1.5 張 = 1500 股", () => {
    const [a, b] = matchExtractedToStocks(
      [
        high({ symbol: "2330", shares: "2", unit: "lots" }),
        high({ symbol: "2317", shares: "1.5", unit: "lots" }),
      ],
      STOCKS,
    );
    expect(a.shares).toBe("2000");
    expect(b.shares).toBe("1500");
  });

  test("數字帶逗號：1,000 股、成本 1,200.5", () => {
    const [m] = matchExtractedToStocks(
      [high({ symbol: "2454", buyPrice: "1,200.5", shares: "1,000" })],
      STOCKS,
    );
    expect(m.buyPrice).toBe("1200.5");
    expect(m.shares).toBe("1000");
  });

  test("對不到股票：stock 為 null、信心降為 low、原文留給使用者", () => {
    const [m] = matchExtractedToStocks(
      [high({ symbol: "9999", name: "不存在公司", buyPrice: "10", shares: "100" })],
      STOCKS,
    );
    expect(m.stock).toBeNull();
    expect(m.confidence).toBe("low");
    expect(m.rawText).toBe("不存在公司");
  });

  test("代號看錯一碼不會猜到別檔（代號要完全相同）", () => {
    // 2454 聯發科存在，但 245 不該被猜成 2454
    const [m] = matchExtractedToStocks([high({ symbol: "245" })], STOCKS);
    expect(m.stock).toBeNull();
  });

  test("名稱只有部分（聯）有多檔符合時不猜", () => {
    const [m] = matchExtractedToStocks([high({ name: "聯" })], STOCKS);
    expect(m.stock).toBeNull();
    expect(m.rawText).toBe("聯");
  });

  test("同一檔出現兩次：股數相加、成本價取加權平均", () => {
    const result = matchExtractedToStocks(
      [
        high({ symbol: "2330", buyPrice: "500", shares: "1000" }),
        high({ symbol: "2317", buyPrice: "200", shares: "1000" }),
        high({ name: "台積電", buyPrice: "600", shares: "1", unit: "lots" }),
      ],
      STOCKS,
    );
    expect(result).toHaveLength(2);
    expect(result[0].stock?.symbol).toBe("2330");
    expect(result[0].shares).toBe("2000");
    expect(result[0].buyPrice).toBe("550");
    expect(result[0].mergedCount).toBe(2);
    expect(result[1].stock?.symbol).toBe("2317");
  });

  test("同一檔出現兩次但其中一筆缺價：不合併，兩筆都留", () => {
    const result = matchExtractedToStocks(
      [
        high({ symbol: "2330", buyPrice: "500", shares: "1000" }),
        high({ symbol: "2330", shares: "1000" }),
      ],
      STOCKS,
    );
    expect(result).toHaveLength(2);
  });

  test("辨識模型標 low 的那筆保持 low", () => {
    const [m] = matchExtractedToStocks(
      [{ symbol: "2330", buyPrice: "5?0", shares: "1000", confidence: "low" }],
      STOCKS,
    );
    expect(m.stock?.symbol).toBe("2330");
    expect(m.confidence).toBe("low");
    expect(m.buyPrice).toBe("50"); // 讀不清的字元被去掉，所以一定要標請確認
  });
});

describe("applyExtraction", () => {
  let counter = 10;
  const nextId = () => counter++;
  const createDraft = (id: number): HoldingDraft => ({
    id,
    query: "",
    selected: null,
    buyPrice: "",
    shares: "",
  });
  const blank = (id: number) => createDraft(id);
  const filled = (id: number, symbol: string): HoldingDraft => ({
    ...createDraft(id),
    selected: STOCKS.find((s) => s.symbol === symbol) ?? null,
    buyPrice: "100",
    shares: "100",
  });
  const twoHoldings: ExtractionResult = {
    holdings: [
      high({ symbol: "2330", buyPrice: "500", shares: "1000" }),
      high({ name: "鴻海", buyPrice: "200", shares: "1", unit: "lots" }),
    ],
    warnings: [],
  };

  beforeEach(() => {
    counter = 10;
  });

  test("空白筆被覆蓋，不夠的接在後面，對到的股票設 selected", () => {
    const { forms, warnings } = applyExtraction([blank(1)], twoHoldings, STOCKS, nextId, createDraft);
    expect(forms).toHaveLength(2);
    expect(forms[0].id).toBe(1);
    expect(forms[0].selected?.symbol).toBe("2330");
    expect(forms[0].query).toBe("");
    expect(forms[0].buyPrice).toBe("500");
    expect(forms[0].shares).toBe("1000");
    expect(forms[1].id).toBe(10);
    expect(forms[1].selected?.symbol).toBe("2317");
    expect(forms[1].shares).toBe("1000");
    expect(warnings).toEqual([]);
  });

  test("使用者已填的筆保留在原位，辨識結果接在後面", () => {
    const { forms } = applyExtraction([filled(1, "2454"), blank(2)], twoHoldings, STOCKS, nextId, createDraft);
    expect(forms.map((f) => f.selected?.symbol)).toEqual(["2454", "2330", "2317"]);
    expect(forms[0].buyPrice).toBe("100");
    expect(forms[1].id).toBe(2);
  });

  test("對不到的股票把名稱放進 query，並標 stock 請確認", () => {
    const result: ExtractionResult = {
      holdings: [high({ name: "不存在公司", buyPrice: "10", shares: "100" })],
      warnings: [],
    };
    const { forms } = applyExtraction([blank(1)], result, STOCKS, nextId, createDraft);
    expect(forms[0].selected).toBeNull();
    expect(forms[0].query).toBe("不存在公司");
    expect(forms[0].review?.stock).toBe(true);
  });

  test("low confidence 的欄位標請確認；high 且有值的不標", () => {
    const result: ExtractionResult = {
      holdings: [
        { symbol: "2330", buyPrice: "500", shares: "1000", confidence: "low" },
        high({ symbol: "2317", buyPrice: "200", shares: "" }),
      ],
      warnings: [],
    };
    const { forms } = applyExtraction([blank(1)], result, STOCKS, nextId, createDraft);
    expect(forms[0].review).toEqual({ stock: false, buyPrice: true, shares: true });
    expect(forms[1].review).toEqual({ stock: false, buyPrice: false, shares: true });
  });

  test("超過 5 檔：只匯入前 5 檔並提示", () => {
    const result: ExtractionResult = {
      holdings: ["2330", "2317", "2454", "2303", "0050", "2603"].map((symbol) =>
        high({ symbol, buyPrice: "10", shares: "1000" }),
      ),
      warnings: [],
    };
    const { forms, warnings } = applyExtraction([blank(1)], result, STOCKS, nextId, createDraft);
    expect(forms).toHaveLength(5);
    expect(forms.map((f) => f.selected?.symbol)).toEqual(["2330", "2317", "2454", "2303", "0050"]);
    expect(warnings).toEqual(["截圖有 6 檔，只匯入前 5 檔"]);
  });

  test("已填 4 檔再匯入 2 檔：只放得下 1 檔", () => {
    const existing = ["2454", "2303", "0050", "2603"].map((s, i) => filled(i + 1, s));
    const { forms, warnings } = applyExtraction(existing, twoHoldings, STOCKS, nextId, createDraft);
    expect(forms).toHaveLength(5);
    expect(forms[4].selected?.symbol).toBe("2330");
    expect(warnings).toEqual(["截圖有 2 檔，只匯入前 1 檔"]);
  });

  test("同一檔出現兩次：合併後加 warning", () => {
    const result: ExtractionResult = {
      holdings: [
        high({ symbol: "2330", buyPrice: "500", shares: "1000" }),
        high({ symbol: "2330", buyPrice: "600", shares: "1000" }),
      ],
      warnings: ["第 3 列看不清楚"],
    };
    const { forms, warnings } = applyExtraction([blank(1)], result, STOCKS, nextId, createDraft);
    expect(forms).toHaveLength(1);
    expect(forms[0].buyPrice).toBe("550");
    expect(forms[0].shares).toBe("2000");
    expect(warnings).toEqual([
      "第 3 列看不清楚",
      "台積電（2330） 在截圖出現 2 次，已合併（股數相加、成本價取加權平均）",
    ]);
  });

  test("辨識結果是空的：欄位維持原樣", () => {
    const { forms } = applyExtraction([filled(1, "2330"), blank(2)], { holdings: [], warnings: [] }, STOCKS, nextId, createDraft);
    expect(forms).toHaveLength(1);
    expect(forms[0].selected?.symbol).toBe("2330");
  });
});

describe("parseExtractionResult", () => {
  test("數字轉成字串、quantity/quantityUnit 也認得、confidence 不是 high 就是 low", () => {
    const result = parseExtractionResult({
      holdings: [
        { symbol: "2330", name: "台積電", buyPrice: 500.5, quantity: 2, quantityUnit: "lots", confidence: "high" },
        { symbol: null, name: "鴻海", buyPrice: null, shares: "1,000", confidence: "meh" },
      ],
      warnings: ["看不清楚", "", 3],
    });
    expect(result.holdings).toEqual([
      { symbol: "2330", name: "台積電", buyPrice: "500.5", shares: "2", unit: "lots", confidence: "high" },
      { symbol: undefined, name: "鴻海", buyPrice: undefined, shares: "1,000", unit: "shares", confidence: "low" },
    ]);
    expect(result.warnings).toEqual(["看不清楚"]);
  });

  test("什麼都沒有的列會被丟掉；不是物件就回空結果", () => {
    expect(parseExtractionResult({ holdings: [{ confidence: "high" }, null, "x"] })).toEqual({
      holdings: [],
      warnings: [],
    });
    expect(parseExtractionResult("oops")).toEqual({ holdings: [], warnings: [] });
    expect(parseExtractionResult(null)).toEqual({ holdings: [], warnings: [] });
  });
});
