import { createClaudeHoldingRecognizer, NETWORK_ERROR_MESSAGE } from "./claudeHoldingRecognizer";
import { RecognizeError } from "./HoldingRecognizer";
import { recognizeUrl } from "./recognizeEndpoint";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("claudeHoldingRecognizer（手機端）", () => {
  test("把圖片 POST 到 /recognize，回傳整理過的結果", async () => {
    const fetchFn = jest.fn(async () =>
      jsonResponse({
        holdings: [{ symbol: "2330", buyPrice: 500, quantity: 1000, quantityUnit: "shares", confidence: "high" }],
        warnings: [],
      }),
    );
    const recognizer = createClaudeHoldingRecognizer(fetchFn, () => "http://10.0.0.2:8081/recognize");

    const result = await recognizer.recognize("aGk=", "image/png");

    expect(result.holdings[0]).toMatchObject({ symbol: "2330", buyPrice: "500", shares: "1000" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://10.0.0.2:8081/recognize");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ imageBase64: "aGk=", mimeType: "image/png" });
  });

  test("伺服器回錯誤：把 error 訊息原樣丟出", async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ error: "伺服器沒有設定 ANTHROPIC_API_KEY" }, 503));
    const recognizer = createClaudeHoldingRecognizer(fetchFn, () => "/recognize");
    await expect(recognizer.recognize("aGk=", "image/png")).rejects.toThrow(
      "伺服器沒有設定 ANTHROPIC_API_KEY",
    );
  });

  test("伺服器回非 JSON 錯誤：顯示狀態碼", async () => {
    const fetchFn = jest.fn(async () => new Response("Internal Server Error", { status: 500 }));
    const recognizer = createClaudeHoldingRecognizer(fetchFn, () => "/recognize");
    await expect(recognizer.recognize("aGk=", "image/png")).rejects.toThrow("辨識服務回應錯誤（500）");
  });

  test("網路不通：丟 RecognizeError 並提示檢查 dev server", async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    const recognizer = createClaudeHoldingRecognizer(fetchFn, () => "/recognize");
    const error = await recognizer.recognize("aGk=", "image/png").catch((e) => e);
    expect(error).toBeInstanceOf(RecognizeError);
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });
});

describe("recognizeUrl", () => {
  test("有 hostUri（區網）：用 http 組成完整網址", () => {
    expect(recognizeUrl("192.168.1.5:8081")).toBe("http://192.168.1.5:8081/recognize");
  });

  test("tunnel 模式的 exp.direct 用 https", () => {
    expect(recognizeUrl("abc-anonymous-8081.exp.direct")).toBe(
      "https://abc-anonymous-8081.exp.direct/recognize",
    );
  });

  test("沒有 hostUri：回相對路徑", () => {
    expect(recognizeUrl(undefined)).toBe("/recognize");
  });
});
