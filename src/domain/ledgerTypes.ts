import type { Market } from "./types";

/**
 * 交易紀錄（記帳本）的資料型別，欄位照 docs/product-spec.md 第 4 章。
 * 日期一律是 ISO 字串：交易日、除權息日用 "YYYY-MM-DD"，createdAt／updatedAt 用完整 ISO 時間。
 */

/** 證券類型：個股或 ETF。決定預設證交稅率與核心／衛星 */
export type SecurityType = "stock" | "etf";

/** 核心（core）或衛星（satellite）部位 */
export type Bucket = "core" | "satellite";

export type TradeSide = "buy" | "sell";

/**
 * 交易幣別 [多幣別預留]（product-spec 3.8、第 4 章；docs/stories/025）。
 * Tech Day 期間一律 TWD；沒填的舊資料視為 TWD。
 */
export type Currency = "TWD" | "USD";

/**
 * 記帳本上的市場別 [多幣別預留]：上市、上櫃、美股。沒填的舊資料視為台股。
 * 證券主檔的 Market（types.ts）目前只有台股兩種，美股功能做的時候再合併。
 */
export type LedgerMarket = Market | "US";

/** 交易來源。MVP 只有 manual；其他是後面 Phase 預留 */
export type TransactionSource = "manual" | "dca" | "import" | "email";

/** 一筆買入或賣出 */
export type Transaction = {
  id: string;
  symbol: string;
  side: TradeSide;
  /** 交易日期 YYYY-MM-DD，不可晚於今天 */
  tradeDate: string;
  /**
   * 不知道真正的交易日期：舊版資料沒填買入日期（或填的認不出來），tradeDate 暫用轉入當天。
   * 畫面可以提醒使用者補上日期；持有天數、年化報酬率在補上之前都不準。見 docs/stories/008。
   */
  tradeDateUnknown?: boolean;
  /** 成交價，> 0 */
  price: number;
  /**
   * 股數，> 0。型別上可為小數（美股碎股，例如 0.37 股）[多幣別預留]；
   * 台股的輸入驗證仍限制整數（validateTransaction，之後依 market 判斷）。
   */
  shares: number;
  /** 手續費（自動計算，可覆寫） */
  fee: number;
  /** 證交稅（買入為 0） */
  tax: number;
  /** 使用者是否手動改過手續費或稅 */
  feeOverridden: boolean;
  /** 選填，沒填視為台股 [多幣別預留] */
  market?: LedgerMarket;
  /** 選填，沒填視為 TWD。price、fee、tax 都以這個幣別記錄 [多幣別預留] */
  currency?: Currency;
  /** 選填，沒填視為 1。成交當下 1 單位外幣等於多少台幣 [多幣別預留] */
  fxRate?: number;
  source: TransactionSource;
  /** 券商委託書號 [P3] */
  brokerOrderRef?: string;
  /** source = "dca" 時：由哪一條定期定額規則產生（規則刪掉後仍保留，只是找不到規則）。見 docs/stories/024 */
  dcaRuleId?: string;
  /** source = "dca" 時：哪一期，"YYYY-MM"（扣款日所在的月份，順延到下個月也算原本那期） */
  dcaPeriod?: string;
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
  /** 實際入帳金額（cash 用），以 currency 計；有預扣稅時是扣完之後的金額 */
  cashAmount?: number;
  /** 配發股數（stock 用）。型別上可為小數 [多幣別預留]；台股驗證仍限制整數 */
  stockShares?: number;
  /** 選填，沒填視為台股 [多幣別預留] */
  market?: LedgerMarket;
  /** 選填，沒填視為 TWD。cashAmount、withholdingTax 以這個幣別記錄 [多幣別預留] */
  currency?: Currency;
  /** 選填，沒填視為 1。入帳當下 1 單位外幣等於多少台幣 [多幣別預留] */
  fxRate?: number;
  /** 預扣稅額（美股股利預扣 30%），以 currency 計。只供顯示，報酬只計 cashAmount。台股不使用 [多幣別預留] */
  withholdingTax?: number;
  status: DividendStatus;
  source: "manual" | "auto";
  /**
   * 自動帶入（source = auto）的紀錄被使用者改過金額或按過「確認入帳」：之後不再自動更新金額（P2-03）。
   * 手動紀錄不用這個欄位。見 docs/stories/012。
   */
  userModified?: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

/** 使用者對某檔證券的設定。沒有設定時依類型決定（ETF → 核心，個股 → 衛星） */
export type HoldingSetting = {
  /** 主鍵（之後支援美股時改為 market + symbol） */
  symbol: string;
  /** 選填，沒填視為台股 [多幣別預留] */
  market?: LedgerMarket;
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

/**
 * 定期定額規則（P2-02，docs/stories/024）。App 開啟時依規則補產生到期的買入交易。
 * 去重靠 handledPeriods：同一規則同一期只處理一次，使用者刪掉自動產生的交易也不會補回。
 */
export type DcaRule = {
  id: string;
  symbol: string;
  /** 每期金額（元），正整數 */
  amount: number;
  /** 每月扣款日 1–28；遇到非交易日順延到下一個交易日 */
  dayOfMonth: number;
  /** 開始日期 YYYY-MM-DD；扣款日早於這天的那期不產生 */
  startDate: string;
  /** 結束日期 YYYY-MM-DD，選填；扣款日晚於這天的那期不產生 */
  endDate?: string;
  /** false = 暫停：不產生新的交易 */
  enabled: boolean;
  /** 最近一次從暫停恢復的日期 YYYY-MM-DD；扣款日早於這天的期數（暫停期間）不補 */
  resumedAt?: string;
  /** 已處理過的期數 "YYYY-MM"：已產生交易，或金額不足買 1 股而略過。刪掉交易也不移除 */
  handledPeriods: string[];
  createdAt: string;
  updatedAt: string;
};

/** 整份記帳本：存在手機本機的就是這個 */
export type Ledger = {
  schemaVersion: 1;
  transactions: Transaction[];
  dividends: Dividend[];
  holdingSettings: HoldingSetting[];
  settings: UserSettings;
  /**
   * 使用者刪掉的自動帶入股利（autoDividendKey：代號|除權息日|類型），之後自動帶入不再建立（P2-03）。
   * 選填，舊資料沒有視為空陣列。見 docs/stories/012。
   */
  dismissedAutoDividends?: string[];
  /**
   * 定期定額規則（Story 024）。選填：舊資料沒有這個欄位，讀到時當成沒有規則，不用升 schemaVersion、不用搬移。
   */
  dcaRules?: DcaRule[];
  // 多幣別欄位（market、currency、fxRate、withholdingTax）都在各筆紀錄上、都是選填，同樣不升 schemaVersion（Story 025）
};
