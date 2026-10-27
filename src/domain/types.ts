/** 一筆持股：代號 + 買入價 + 數量（股） */
export type Holding = {
  symbol: string;
  buyPrice: number;
  shares: number;
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

/** 股票基本資料：代號 + 名稱（選擇器與搜尋用） */
export type StockInfo = {
  symbol: string;
  name: string;
};
