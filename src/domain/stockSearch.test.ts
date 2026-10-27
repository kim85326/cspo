import { toStockInfo } from "./security";
import {
  formatStockLabel,
  MAX_SEARCH_RESULTS,
  normalizeQuery,
  resolveStock,
  searchStocks,
} from "./stockSearch";
import type { Market, StockInfo } from "./types";

function info(symbol: string, name: string, market: Market = "TWSE"): StockInfo {
  return toStockInfo({ symbol, name }, market);
}

const STOCKS: StockInfo[] = [
  info("2330", "台積電"),
  info("2317", "鴻海"),
  info("2454", "聯發科"),
  info("2303", "聯電"),
  info("2308", "台達電"),
  info("0050", "元大台灣50"),
  info("2881", "富邦金"),
  info("2882", "國泰金"),
  info("2603", "長榮"),
  info("2609", "陽明"),
];

describe("normalizeQuery", () => {
  test("全形數字轉半形、去空白、轉小寫", () => {
    expect(normalizeQuery(" ２３３０ ")).toBe("2330");
    expect(normalizeQuery("台 積 電")).toBe("台積電");
  });
});

describe("searchStocks（對應 docs/stories/002）", () => {
  test("空字串回前幾檔當熱門清單", () => {
    expect(searchStocks("", STOCKS, 3).map((s) => s.symbol)).toEqual(["2330", "2317", "2454"]);
  });

  test("輸入代號開頭：23 → 2303、2308、2317、2330 依代號排序", () => {
    expect(searchStocks("23", STOCKS).map((s) => s.symbol)).toEqual(["2303", "2308", "2317", "2330"]);
  });

  test("輸入完整代號排第一", () => {
    expect(searchStocks("2330", STOCKS)[0].name).toBe("台積電");
  });

  test("輸入公司名稱開頭：聯 → 聯發科、聯電", () => {
    expect(searchStocks("聯", STOCKS).map((s) => s.name)).toEqual(["聯電", "聯發科"]);
  });

  test("名稱包含也找得到：金 → 富邦金、國泰金", () => {
    expect(searchStocks("金", STOCKS).map((s) => s.name)).toEqual(["富邦金", "國泰金"]);
  });

  test("完全相同的名稱排在開頭相同之前", () => {
    const withLonger = [...STOCKS, info("9999", "台積電二號")];
    expect(searchStocks("台積電", withLonger).map((s) => s.symbol)).toEqual(["2330", "9999"]);
  });

  test("limit 生效", () => {
    expect(searchStocks("2", STOCKS, 2)).toHaveLength(2);
  });

  test("代號帶英文字母：00631l 找到 00631L（不分大小寫，照代號比對而不是名稱）", () => {
    const withLetter = [...STOCKS, info("00631L", "元大台灣50正2")];
    expect(searchStocks("00631l", withLetter).map((s) => s.symbol)).toEqual(["00631L"]);
    expect(searchStocks("00631", withLetter).map((s) => s.symbol)).toEqual(["00631L"]);
  });

  test("找不到回空陣列", () => {
    expect(searchStocks("9999", STOCKS)).toEqual([]);
    expect(searchStocks("不存在", STOCKS)).toEqual([]);
  });
});

describe("searchStocks：證券類型與上櫃（對應 docs/stories/007）", () => {
  const WITH_TPEX: StockInfo[] = [
    ...STOCKS,
    info("00878", "國泰永續高股息"),
    info("5347", "世界", "TPEx"),
    info("006201", "元大富櫃50", "TPEx"),
  ];

  test("輸入 0050 第一筆是 0050 元大台灣50，類型 ETF", () => {
    const [first] = searchStocks("0050", WITH_TPEX);
    expect(first).toEqual({ symbol: "0050", name: "元大台灣50", type: "etf", market: "TWSE" });
  });

  test("輸入台積包含 2330 台積電，類型個股", () => {
    expect(searchStocks("台積", WITH_TPEX)).toContainEqual(
      expect.objectContaining({ symbol: "2330", type: "stock" }),
    );
  });

  test("上櫃股票與上櫃 ETF 搜得到", () => {
    expect(searchStocks("世界", WITH_TPEX)).toEqual([
      { symbol: "5347", name: "世界", type: "stock", market: "TPEx" },
    ]);
    expect(searchStocks("006201", WITH_TPEX)[0]).toMatchObject({ name: "元大富櫃50", type: "etf" });
  });

  test("沒指定 limit 時最多 20 筆", () => {
    const many = Array.from({ length: 30 }, (_, i) => info(`${2000 + i}`, `測試${i}`));
    expect(MAX_SEARCH_RESULTS).toBe(20);
    expect(searchStocks("2", many)).toHaveLength(20);
    expect(searchStocks("", many)).toHaveLength(20);
  });
});

describe("resolveStock", () => {
  test("代號完全相同", () => {
    expect(resolveStock("2330", STOCKS)?.name).toBe("台積電");
  });

  test("代號帶英文字母，大小寫都能命中", () => {
    const withLetter = [...STOCKS, info("00631L", "元大台灣50正2")];
    expect(resolveStock("00631L", withLetter)?.name).toBe("元大台灣50正2");
    expect(resolveStock("00631l", withLetter)?.name).toBe("元大台灣50正2");
  });

  test("名稱完全相同（含全形空白）", () => {
    expect(resolveStock(" 台積電 ", STOCKS)?.symbol).toBe("2330");
  });

  test("候選只有一檔也算命中：鴻 → 鴻海", () => {
    expect(resolveStock("鴻", STOCKS)?.symbol).toBe("2317");
  });

  test("候選多檔不猜：聯 → null", () => {
    expect(resolveStock("聯", STOCKS)).toBeNull();
  });

  test("空字串與找不到都回 null", () => {
    expect(resolveStock("", STOCKS)).toBeNull();
    expect(resolveStock("9999", STOCKS)).toBeNull();
  });
});

describe("formatStockLabel", () => {
  test("名稱（代號）", () => {
    expect(formatStockLabel({ symbol: "2330", name: "台積電" })).toBe("台積電（2330）");
  });
});
