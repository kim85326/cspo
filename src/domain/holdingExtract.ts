import { MAX_COMPARE_HOLDINGS } from "./compare";
import { formatStockLabel, normalizeQuery, resolveStock } from "./stockSearch";
import type { StockInfo } from "./types";

/**
 * 截圖匯入（Story 005）的純邏輯：辨識結果 → 對到股票清單 → 套進畫面的持股欄位。
 * 這個檔不碰 UI、不碰網路；辨識本身在 src/data/HoldingRecognizer.ts。
 */

/** 辨識信心：high 代表辨識模型看得清楚；low 代表看不清楚或對不到股票，畫面要提示「請確認」 */
export type ExtractionConfidence = "high" | "low";

/** 辨識模型從截圖讀出的一檔持股（原始字串，還沒驗證） */
export type ExtractedHolding = {
  /** 股票代號，例如 2330；看不到就留空 */
  symbol?: string;
  /** 股票名稱，例如 台積電；看不到就留空 */
  name?: string;
  /** 成本價／均價（每股） */
  buyPrice?: string;
  /** 數量；單位看 unit，沒給 unit 視為「股」 */
  shares?: string;
  /** 截圖上的數量單位：張（1 張 = 1000 股）或股 */
  unit?: "shares" | "lots";
  confidence: ExtractionConfidence;
};

export type ExtractionResult = {
  holdings: ExtractedHolding[];
  /** 要提示使用者的事，例如「有兩檔看不清楚」 */
  warnings: string[];
};

/** 對到股票清單之後的一檔：數字已正規化成「股」與純數字字串 */
export type MatchedHolding = {
  stock: StockInfo | null;
  /** 對不到股票時給使用者看的原始文字（名稱優先，其次代號） */
  rawText: string;
  buyPrice: string;
  shares: string;
  /** 整筆的信心：辨識模型說 low、或對不到股票，都算 low */
  confidence: ExtractionConfidence;
  /** 辨識模型自己對數字的信心（對不對得到股票不影響它） */
  sourceConfidence: ExtractionConfidence;
  /** 同一檔在截圖出現幾次（≥ 2 代表已合併） */
  mergedCount: number;
};

/** 哪些欄位的辨識信心低、要請使用者確認 */
export type ReviewFlags = {
  stock?: boolean;
  buyPrice?: boolean;
  shares?: boolean;
};

/**
 * 畫面上一檔持股的輸入草稿。
 * src/ui/HoldingForm.tsx 的 HoldingFormState 擴充自它（多了 errors）；domain 只認這個最小形狀。
 */
export type HoldingDraft = {
  id: number;
  query: string;
  selected: StockInfo | null;
  buyPrice: string;
  shares: string;
  /** 買入日期原始字串，選填（截圖匯入不會填） */
  buyDate?: string;
  review?: ReviewFlags;
};

export type ApplyExtractionResult<T extends HoldingDraft> = {
  forms: T[];
  warnings: string[];
};

const SHARES_PER_LOT = 1000;

/** 去掉全形、千分位逗號、貨幣符號與空白，留下數字與小數點 */
export function normalizeNumber(raw: string | undefined): string {
  if (!raw) return "";
  const half = raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, ".")
    .replace(/[，,]/g, "")
    .replace(/[^\d.]/g, "");
  if (half === "" || !/^\d*\.?\d*$/.test(half) || half === ".") return "";
  const n = Number(half);
  if (!Number.isFinite(n)) return "";
  return formatPlain(n);
}

/** 不用科學記號、去掉多餘的小數零 */
function formatPlain(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/** 張 → 股；「2」張 = 2000 股、「1.5」張 = 1500 股 */
function toShares(raw: string | undefined, unit: ExtractedHolding["unit"]): string {
  const normalized = normalizeNumber(raw);
  if (normalized === "") return "";
  if (unit !== "lots") return normalized;
  return formatPlain(Number(normalized) * SHARES_PER_LOT);
}

/** 代號：全形轉半形、去掉 .TW / .TWO 之類的後綴與空白 */
function normalizeSymbol(raw: string | undefined): string {
  if (!raw) return "";
  return normalizeQuery(raw)
    .replace(/\.(tw|two)$/i, "")
    .toUpperCase();
}

/**
 * 把辨識到的代號／名稱對到股票清單。
 * - 代號先試完全相同（resolveStock 對純數字只在唯一時才猜，但代號看錯一碼就會猜到別檔，所以代號要求完全相同）。
 * - 代號對不到再用名稱 resolveStock。
 * - 都對不到 → stock 為 null、confidence 降成 low，rawText 給使用者自己選。
 * - 同一檔出現兩次 → 合併：股數相加、成本價取加權平均；任一筆缺價或缺量就不合併，保留兩筆。
 */
export function matchExtractedToStocks(
  items: ExtractedHolding[],
  stocks: StockInfo[],
): MatchedHolding[] {
  const matched: MatchedHolding[] = items.map((item) => {
    const symbol = normalizeSymbol(item.symbol);
    const name = item.name?.trim() ?? "";
    let stock: StockInfo | null = null;
    if (symbol !== "") {
      stock = stocks.find((s) => s.symbol.toUpperCase() === symbol) ?? null;
    }
    if (!stock && name !== "") stock = resolveStock(name, stocks);
    return {
      stock,
      rawText: name !== "" ? name : symbol,
      buyPrice: normalizeNumber(item.buyPrice),
      shares: toShares(item.shares, item.unit),
      confidence: stock ? item.confidence : "low",
      sourceConfidence: item.confidence,
      mergedCount: 1,
    };
  });

  const merged: MatchedHolding[] = [];
  for (const item of matched) {
    const existing = item.stock
      ? merged.find((m) => m.stock?.symbol === item.stock?.symbol)
      : undefined;
    if (!existing || !canMerge(existing, item)) {
      merged.push(item);
      continue;
    }
    const aShares = Number(existing.shares);
    const bShares = Number(item.shares);
    const totalShares = aShares + bShares;
    const totalCost = Number(existing.buyPrice) * aShares + Number(item.buyPrice) * bShares;
    existing.shares = formatPlain(totalShares);
    existing.buyPrice = formatPlain(totalCost / totalShares);
    existing.mergedCount += 1;
    if (item.confidence === "low") existing.confidence = "low";
    if (item.sourceConfidence === "low") existing.sourceConfidence = "low";
  }
  return merged;
}

function canMerge(a: MatchedHolding, b: MatchedHolding): boolean {
  return [a.buyPrice, a.shares, b.buyPrice, b.shares].every((v) => v !== "" && Number(v) > 0);
}

/** 什麼都沒填的空白筆（可以被匯入結果直接覆蓋） */
export function isBlankDraft(form: HoldingDraft): boolean {
  return (
    form.selected === null &&
    form.query.trim() === "" &&
    form.buyPrice.trim() === "" &&
    form.shares.trim() === ""
  );
}

/** 一檔對好的結果要帶給使用者確認的欄位：對不到股票只標股票欄；數字看不清楚才標數字欄 */
function reviewFlagsFor(item: MatchedHolding): ReviewFlags {
  const low = item.sourceConfidence === "low";
  return {
    stock: item.stock === null,
    buyPrice: low || item.buyPrice === "",
    shares: low || item.shares === "",
  };
}

/**
 * 把辨識結果套進持股欄位。
 * - 空白筆直接被覆蓋，使用者已填的筆保留在原位，剩下的辨識結果接在後面。
 * - 總數最多 MAX_COMPARE_HOLDINGS；放不下的丟掉並加 warning「截圖有 N 檔，只匯入前 5 檔」。
 * - 對到的股票設 selected；對不到的把名稱放進 query，讓使用者自己從清單選。
 * - low confidence 或缺值的欄位標在 review，畫面顯示「請確認」。
 * nextId 由畫面提供（每呼叫一次給一個新 id）。
 */
export function applyExtraction<T extends HoldingDraft>(
  forms: T[],
  result: ExtractionResult,
  stocks: StockInfo[],
  nextId: () => number,
  createDraft: (id: number) => T,
): ApplyExtractionResult<T> {
  const warnings = [...result.warnings];
  const matched = matchExtractedToStocks(result.holdings, stocks);
  const kept = forms.filter((f) => !isBlankDraft(f));
  const capacity = Math.max(0, MAX_COMPARE_HOLDINGS - kept.length);
  const toImport = matched.slice(0, capacity);
  if (matched.length > capacity) {
    warnings.push(`截圖有 ${matched.length} 檔，只匯入前 ${capacity} 檔`);
  }

  for (const item of toImport) {
    if (item.stock && item.mergedCount > 1) {
      warnings.push(
        `${formatStockLabel(item.stock)} 在截圖出現 ${item.mergedCount} 次，已合併（股數相加、成本價取加權平均）`,
      );
    }
  }

  const queue = [...toImport];
  const fill = (base: T, item: MatchedHolding): T => ({
    ...base,
    selected: item.stock,
    query: item.stock ? "" : item.rawText,
    buyPrice: item.buyPrice,
    shares: item.shares,
    review: reviewFlagsFor(item),
  });

  const next: T[] = [];
  for (const form of forms) {
    if (isBlankDraft(form) && queue.length > 0) {
      next.push(fill(form, queue.shift() as MatchedHolding));
    } else if (!isBlankDraft(form)) {
      next.push(form);
    }
  }
  while (queue.length > 0) {
    next.push(fill(createDraft(nextId()), queue.shift() as MatchedHolding));
  }
  if (next.length === 0) next.push(createDraft(nextId()));

  return { forms: next, warnings };
}

/**
 * 把來路不明的 JSON（辨識模型輸出或 HTTP 回應）整理成 ExtractionResult。
 * 不合格的欄位丟掉、數字轉成字串、confidence 不是 high 就當 low；整體不是物件就回空結果。
 */
export function parseExtractionResult(raw: unknown): ExtractionResult {
  if (!raw || typeof raw !== "object") return { holdings: [], warnings: [] };
  const obj = raw as Record<string, unknown>;
  const holdings: ExtractedHolding[] = [];
  if (Array.isArray(obj.holdings)) {
    for (const entry of obj.holdings) {
      if (!entry || typeof entry !== "object") continue;
      const h = entry as Record<string, unknown>;
      const item: ExtractedHolding = {
        symbol: asText(h.symbol),
        name: asText(h.name),
        buyPrice: asText(h.buyPrice),
        shares: asText(h.shares ?? h.quantity),
        unit: h.unit === "lots" || h.quantityUnit === "lots" ? "lots" : "shares",
        confidence: h.confidence === "high" ? "high" : "low",
      };
      if (item.symbol || item.name || item.buyPrice || item.shares) holdings.push(item);
    }
  }
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string" && w.trim() !== "")
    : [];
  return { holdings, warnings };
}

function asText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return undefined;
}
