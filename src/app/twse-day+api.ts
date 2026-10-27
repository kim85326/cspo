import { TWSE_STOCK_DAY_URL } from "@/data/twseEndpoint";
import { SYMBOL_PATTERN } from "@/domain/pnl";

/**
 * 網頁版用的同源代理：GET /twse-day?date=YYYYMMDD&stockNo=2330 → 轉給證交所 STOCK_DAY（個股一個月日 K）。
 * 證交所沒開 CORS，瀏覽器不能直接打；手機 app 不經過這裡。
 * 參數先驗過才轉，避免被當成任意代理。
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  const stockNo = params.get("stockNo") ?? "";
  if (!/^\d{8}$/.test(date) || !SYMBOL_PATTERN.test(stockNo)) {
    return Response.json({ error: "參數格式錯誤" }, { status: 400 });
  }

  const url = `${TWSE_STOCK_DAY_URL}?date=${date}&stockNo=${stockNo}&response=json`;
  const upstream = await fetch(url, { headers: { Accept: "application/json" } });
  if (!upstream.ok) {
    return Response.json({ error: `證交所回應 HTTP ${upstream.status}` }, { status: 502 });
  }
  return new Response(await upstream.text(), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
