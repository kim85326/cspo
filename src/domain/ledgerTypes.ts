/**
 * 交易紀錄（記帳本）的資料型別，欄位照 docs/product-spec.md 第 4 章。
 * 日期一律是 ISO 字串：交易日、除權息日用 "YYYY-MM-DD"，createdAt／updatedAt 用完整 ISO 時間。
 */

/** 證券類型：個股或 ETF。決定預設證交稅率與核心／衛星 */
export type SecurityType = "stock" | "etf";

/** 核心（core）或衛星（satellite）部位 */
export type Bucket = "core" | "satellite";

export type TradeSide = "buy" | "sell";

/** 交易來源。MVP 只有 manual；其他是後面 Phase 預留 */
export type TransactionSource = "manual" | "dca" | "import" | "email";

/** 一筆買入或賣出 */
export type Transaction = {
  id: string;
  symbol: string;
  side: TradeSide;
  /** 交易日期 YYYY-MM-DD，不可晚於今天 */
  tradeDate: string;
  /** 成交價，> 0 */
  price: number;
  /** 股數，正整數 */
  shares: number;
  /** 手續費（自動計算，可覆寫） */
  fee: number;
  /** 證交稅（買入為 0） */
  tax: number;
  /** 使用者是否手動改過手續費或稅 */
  feeOverridden: boolean;
  source: TransactionSource;
  /** 券商委託書號 [P3] */
  brokerOrderRef?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type DividendType = "cash" | "stock";

/** 股利狀態。MVP 只有 received；estimated 是 Phase 2 預留 */
export type DividendStatus = "estimated" | "received";

/** 一筆現金股利或股票股利 */
export type Dividend = {
  id: string;
  symbol: string;
  type: DividendType;
  /** 除權息日 YYYY-MM-DD */
  exDate: string;
  /** 發放日，選填 */
  payDate?: string;
  /** 實際入帳金額（cash 用） */
  cashAmount?: number;
  /** 配發股數（stock 用） */
  stockShares?: number;
  status: DividendStatus;
  source: "manual" | "auto";
  note?: string;
  createdAt: string;
  updatedAt: string;
};

/** 使用者對某檔證券的設定。沒有設定時依類型決定（ETF → 核心，個股 → 衛星） */
export type HoldingSetting = {
  symbol: string;
  bucket: Bucket;
};

/** 手續費相關設定。改設定只影響之後新增的交易 */
export type UserSettings = {
  /** 手續費率，預設 0.001425 */
  feeRate: number;
  /** 手續費折扣，預設 1.0；0.28 代表 2.8 折 */
  feeDiscount: number;
  /** 整股（≥ 1000 股）最低手續費，預設 20 */
  minFeeBoardLot: number;
  /** 零股（< 1000 股）最低手續費，預設 1 */
  minFeeOddLot: number;
};

/** 整份記帳本：存在手機本機的就是這個 */
export type Ledger = {
  schemaVersion: 1;
  transactions: Transaction[];
  dividends: Dividend[];
  holdingSettings: HoldingSetting[];
  settings: UserSettings;
};
