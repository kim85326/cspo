import { TPEX_EX_DAILY_URL } from "@/data/tpexEndpoint";

/**
 * 網頁版用的同源代理：GET /tpex-ex?startDate=2026/01/01&endDate=2026/10/27 → 轉給櫃買中心 exDailyQ（除權除息計算結果）。
 * 櫃買中心沒開 CORS，瀏覽器不能直接打；手機 app 不經過這裡。
 * 參數先驗過才轉，避免被當成任意代理。
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const startDate = params.get("startDate") ?? "";
  const endDate = params.get("endDate") ?? "";
  const datePattern = /^\d{4}\/\d{2}\/\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    return Response.json({ error: "參數格式錯誤" }, { status: 400 });
  }

  const url = `${TPEX_EX_DAILY_URL}?startDate=${startDate}&endDate=${endDate}&response=json`;
  const upstream = await fetch(url, { headers: { Accept: "application/json" } });
  if (!upstream.ok) {
    return Response.json({ error: `櫃買中心回應 HTTP ${upstream.status}` }, { status: 502 });
  }
  return new Response(await upstream.text(), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}
