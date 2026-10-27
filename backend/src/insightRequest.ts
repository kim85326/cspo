/**
 * POST /insight 的請求格式（第 1 版）。app 端由 src/domain/insightInput.ts 產生，兩邊要一起改。
 *
 * 只收算好的數字與股票代號／名稱，沒有任何個人資料。驗證後會「重新組一份」只含白名單欄位的物件
 * 才交給 Claude，多送的欄位一律丟掉，避免夾帶文字進 prompt。
 */
export type InsightHolding = {
  symbol: string;
  name: string;
  /** 持有股數 */
  shares: number;
  /** 每股平均成本 */
  avgCost: number;
  /** 持有成本（元） */
  cost: number;
  /** 現價（收盤價） */
  price: number;
  /** 未實現盈虧（元） */
  pnl: number;
  /** 報酬率，0.05 代表 5% */
  returnRate: number;
};

export type InsightTotal = {
  cost: number;
  marketValue: number;
  pnl: number;
  returnRate: number;
};

export type InsightInput = {
  version: 1;
  /** 現價的資料日期，例如 "2026/10/22"；沒有就省略 */
  priceDate?: string;
  /** 成本與盈虧是否已含手續費與交易稅（目前的計算畫面不含；記帳本會含） */
  feesIncluded: boolean;
  holdings: InsightHolding[];
  total: InsightTotal;
};

/** 一次最多幾檔；記帳本的持股可能比比較畫面的 5 檔多 */
export const MAX_HOLDINGS = 30;

const SYMBOL = /^[0-9A-Z]{1,10}$/;
const MAX_NAME_LENGTH = 40;
const MAX_DATE_LENGTH = 20;

export class InvalidInsightRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInsightRequest";
  }
}

/** 驗證並回傳乾淨的 InsightInput；格式不對就丟 InvalidInsightRequest（訊息可直接給使用者看） */
export function parseInsightRequest(body: unknown): InsightInput {
  if (!isObject(body)) throw new InvalidInsightRequest("請求格式錯誤");
  if (body.version !== 1) throw new InvalidInsightRequest("請求版本不支援，請更新 app");

  const { holdings, total } = body;
  if (!Array.isArray(holdings) || holdings.length === 0) {
    throw new InvalidInsightRequest("沒有持股資料");
  }
  if (holdings.length > MAX_HOLDINGS) {
    throw new InvalidInsightRequest(`一次最多解讀 ${MAX_HOLDINGS} 檔`);
  }

  const input: InsightInput = {
    version: 1,
    feesIncluded: body.feesIncluded === true,
    holdings: holdings.map(parseHolding),
    total: parseTotal(total),
  };
  if (body.priceDate !== undefined) {
    if (typeof body.priceDate !== "string" || body.priceDate.length > MAX_DATE_LENGTH) {
      throw new InvalidInsightRequest("資料日期格式錯誤");
    }
    input.priceDate = body.priceDate;
  }
  return input;
}

function parseHolding(raw: unknown): InsightHolding {
  if (!isObject(raw)) throw new InvalidInsightRequest("持股資料格式錯誤");
  const { symbol, name } = raw;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol)) {
    throw new InvalidInsightRequest("股票代號格式錯誤");
  }
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_NAME_LENGTH) {
    throw new InvalidInsightRequest("股票名稱格式錯誤");
  }
  const shares = num(raw.shares);
  if (!Number.isInteger(shares) || shares <= 0) throw new InvalidInsightRequest("股數格式錯誤");
  return {
    symbol,
    name: name.trim(),
    shares,
    avgCost: num(raw.avgCost),
    cost: num(raw.cost),
    price: num(raw.price),
    pnl: num(raw.pnl),
    returnRate: num(raw.returnRate),
  };
}

function parseTotal(raw: unknown): InsightTotal {
  if (!isObject(raw)) throw new InvalidInsightRequest("缺少合計");
  return {
    cost: num(raw.cost),
    marketValue: num(raw.marketValue),
    pnl: num(raw.pnl),
    returnRate: num(raw.returnRate),
  };
}

function num(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidInsightRequest("數字欄位格式錯誤");
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
