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
