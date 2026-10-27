import { TWSE_STOCK_DAY_ALL_URL } from "@/data/twseEndpoint";

/**
 * 網頁版用的同源代理：GET /twse → 原樣轉回證交所的 STOCK_DAY_ALL。
 * 證交所沒開 CORS，瀏覽器不能直接打；手機 app 不經過這裡。
 * 只在 `npx expo start`（dev server）或部署了 server 的網頁版有效，見 docs/architecture.md 第 7 節。
 */
export async function GET() {
  const upstream = await fetch(TWSE_STOCK_DAY_ALL_URL, { headers: { Accept: "application/json" } });
  if (!upstream.ok) {
    return Response.json({ error: `證交所回應 HTTP ${upstream.status}` }, { status: 502 });
  }
  return new Response(await upstream.text(), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
