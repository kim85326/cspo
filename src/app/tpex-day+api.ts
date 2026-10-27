import { TPEX_TRADING_STOCK_URL } from "@/data/tpexEndpoint";
import { SYMBOL_PATTERN } from "@/domain/pnl";

/**
 * 網頁版用的同源代理：GET /tpex-day?code=6488&date=2026/10/01 → 轉給櫃買中心 tradingStock（個股一個月日 K）。
 * 櫃買中心沒開 CORS，瀏覽器不能直接打；手機 app 不經過這裡。
 * 參數先驗過才轉，避免被當成任意代理。
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const code = params.get("code") ?? "";
  const date = params.get("date") ?? "";
  if (!SYMBOL_PATTERN.test(code) || !/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
    return Response.json({ error: "參數格式錯誤" }, { status: 400 });
  }

  const url = `${TPEX_TRADING_STOCK_URL}?code=${code}&date=${date}&response=json`;
  const upstream = await fetch(url, { headers: { Accept: "application/json" } });
  if (!upstream.ok) {
    return Response.json({ error: `櫃買中心回應 HTTP ${upstream.status}` }, { status: 502 });
  }
  return new Response(await upstream.text(), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
