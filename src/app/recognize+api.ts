import { recognizeHoldingsWithClaude, RecognizeServerError } from "@/server/recognizeHoldings";

/**
 * POST /recognize：手機把持股截圖（base64）送來，這裡用伺服器端的 ANTHROPIC_API_KEY 呼叫 Claude。
 * 只有 dev server（npx expo start）或部署後的 server 會跑這個檔；邏輯都在 src/server/recognizeHoldings.ts。
 * 成功：200 + ExtractionResult；失敗：{ error: 中文訊息 } + 對應狀態碼，手機端會原樣顯示。
 */
export async function POST(request: Request): Promise<Response> {
  let body: { imageBase64?: unknown; mimeType?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const { imageBase64, mimeType } = body ?? {};
  if (typeof imageBase64 !== "string" || imageBase64 === "" || typeof mimeType !== "string") {
    return Response.json({ error: "缺少圖片內容" }, { status: 400 });
  }

  try {
    const result = await recognizeHoldingsWithClaude(imageBase64, mimeType);
    return Response.json(result);
  } catch (error) {
    if (error instanceof RecognizeServerError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[recognize] unexpected error", error);
    return Response.json({ error: "辨識時發生未知錯誤，請重試" }, { status: 500 });
  }
}
