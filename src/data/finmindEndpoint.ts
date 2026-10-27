/**
 * FinMind v4 資料 API：台股歷史收盤價、除權息、分割都在同一個網址，用 dataset 參數區分。
 * - 不帶 token：每個 IP 每小時 300 次。token 不能放進 APK，所以 app 一律不帶。
 * - 有開 CORS（Access-Control-Allow-Origin: *），網頁版也直接打，不用代理。
 * - 每週日 00:00–07:00 維護，這段時間會失敗 → 退回官方來源（src/data/index.ts）。
 * - FinMind 聲明資料用於教育、非商業用途；開始收費前要另談授權（docs/research/history-and-dividend-sources.md）。
 */
export const FINMIND_DATA_URL = "https://api.finmindtrade.com/api/v4/data";

export type FinmindDataset = "TaiwanStockPrice" | "TaiwanStockDividend" | "TaiwanStockSplitPrice";

/** 組出查詢網址。日期都是 ISO（"2026-10-01"） */
export function finmindUrl(
  dataset: FinmindDataset,
  params: { symbol: string; start: string; end?: string },
  baseUrl: string = FINMIND_DATA_URL,
): string {
  const query = new URLSearchParams({ dataset, data_id: params.symbol, start_date: params.start });
  if (params.end) query.set("end_date", params.end);
  return `${baseUrl}?${query.toString()}`;
}
