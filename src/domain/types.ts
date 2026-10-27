/** 一筆持股：代號 + 買入價 + 數量（股） */
export type Holding = {
  symbol: string;
  buyPrice: number;
  shares: number;
  /** 買入日期（ISO："2026-10-05"），選填；有填才在 K 線圖標買入點 */
  buyDate?: string;
};

/** 一天的 K 棒（日 K）。date 為 ISO："2026-10-05" */
export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * 一次除權息（同一個除權息交易日的現金與配股合成一筆）。日期都是 ISO。
 * 來源：FinMind TaiwanStockDividend，或證交所／櫃買中心的除權除息計算結果表（見 docs/stories/019）。
 */
export type DividendEvent = {
  kind: "dividend";
  symbol: string;
  /** 除權息交易日：這天（含）之後買進的股數不參與這次配發 */
  exDate: string;
  /** 每股現金股利（元）。null = 已公告除息日、金額還沒公告（ETF 常見） */
  cashPerShare: number | null;
  /** 每千股無償配股（股）。玉山金 2025 年配 0.1 元股票股利 = 每千股 10 股 */
  stockPerThousand: number;
  /** 現金股利發放日。只有 FinMind 有；官方來源是 null */
  payDate: string | null;
  /** 除權息前一個交易日的收盤價、除權息參考價。只有官方來源有；算還原價時優先用 */
  closeBefore?: number;
  referencePrice?: number;
};

/**
 * 股票分割、反分割、面額變更：從 date 這天起，1 股變成 ratio 股、價格除以 ratio。
 * 0050 在 2025-06-18 一拆四 → ratio 4；00632R 七股併一股 → ratio 1/7。
 */
export type SplitEvent = {
  kind: "split";
  symbol: string;
  date: string;
  ratio: number;
};

export type CorporateAction = DividendEvent | SplitEvent;

/** 一檔股票的現價 */
export type Quote = {
  symbol: string;
  name: string;
  price: number;
  /** 資料日期（例如 "2026/10/22"，證交所收盤價的交易日）；假價沒有 */
  asOf?: string;
};

/** 盈虧計算結果 */
export type PnlResult = {
  /** 買入成本 = 買入價 × 數量 */
  cost: number;
  /** 現值 = 現價 × 數量 */
  marketValue: number;
  /** 盈虧 = 現值 − 成本 */
  pnl: number;
  /** 報酬率 = 盈虧 ÷ 成本（0.05 代表 5%） */
  returnRate: number;
};

export type PnlDirection = "up" | "down" | "flat";

/** 證券類型：個股或 ETF。判斷規則見 src/domain/security.ts */
export type SecurityType = "stock" | "etf";

/** 市場別：TWSE = 證交所（上市）、TPEx = 櫃買中心（上櫃） */
export type Market = "TWSE" | "TPEx";

/** 證券基本資料：代號、名稱、類型、市場（選擇器與搜尋用；對應 product-spec 第 4 章 Security） */
export type StockInfo = {
  symbol: string;
  name: string;
  type: SecurityType;
  market: Market;
};

/**
 * 已儲存的持股：存使用者輸入的「原始字串」，不存算好的結果。
 * 關掉 app 重開時帶回欄位用；真正算錢前仍要經過 validateHoldingInput。
 */
export type SavedHolding = {
  symbol: string;
  buyPrice: string;
  shares: string;
  /** 舊版存的資料沒有這欄 */
  buyDate?: string;
};
