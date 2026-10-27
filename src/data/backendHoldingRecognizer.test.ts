import {
  createBackendHoldingRecognizer,
  NETWORK_ERROR_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
  TIMEOUT_MESSAGE,
} from "./backendHoldingRecognizer";
import { RecognizeError } from "./HoldingRecognizer";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function recognizer(fetchFn: jest.Mock, base: string | null = "https://abcd.ngrok-free.app") {
  return createBackendHoldingRecognizer(fetchFn as unknown as typeof fetch, () => base, () => "secret-token");
}

describe("backendHoldingRecognizer（手機端）", () => {
  test("把圖片 POST 到後端的 /recognize，帶存取碼，回傳整理過的結果", async () => {
    const fetchFn = jest.fn(async () =>
      jsonResponse({
        holdings: [{ symbol: "2330", buyPrice: 500, quantity: 1000, quantityUnit: "shares", confidence: "high" }],
        warnings: [],
      }),
    );

    const result = await recognizer(fetchFn).recognize("aGk=", "image/png");

    expect(result.holdings[0]).toMatchObject({ symbol: "2330", buyPrice: "500", shares: "1000" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abcd.ngrok-free.app/recognize");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect((init.headers as Record<string, string>)["ngrok-skip-browser-warning"]).toBe("1");
    expect(JSON.parse(init.body as string)).toEqual({ imageBase64: "aGk=", mimeType: "image/png" });
  });

  test("不知道格式時不送 mimeType，交給後端看檔頭判斷", async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ holdings: [], warnings: [] }));
    await recognizer(fetchFn).recognize("aGk=", undefined);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ imageBase64: "aGk=" });
  });

  test("沒設定後端網址：提示要設 EXPO_PUBLIC_INSIGHT_API_URL，不打網路", async () => {
    const fetchFn = jest.fn();
    await expect(recognizer(fetchFn, null).recognize("aGk=", "image/png")).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("後端回錯誤：把 error 訊息原樣丟出", async () => {
    const fetchFn = jest.fn(async () => jsonResponse({ error: "後端沒有設定 ANTHROPIC_API_KEY" }, 503));
    await expect(recognizer(fetchFn).recognize("aGk=", "image/png")).rejects.toThrow(
      "後端沒有設定 ANTHROPIC_API_KEY",
    );
  });

  test("後端回非 JSON 錯誤：依狀態碼給一句中文", async () => {
    const status = (code: number) => jest.fn(async () => new Response("oops", { status: code }));
    await expect(recognizer(status(500)).recognize("aGk=", "image/png")).rejects.toThrow("辨識服務回應錯誤（500）");
    await expect(recognizer(status(429)).recognize("aGk=", "image/png")).rejects.toThrow(/太頻繁/);
    await expect(recognizer(status(413)).recognize("aGk=", "image/png")).rejects.toThrow(/圖片太大/);
  });

  test("網路不通：丟 RecognizeError 並提示電腦可能還沒開", async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    const error = await recognizer(fetchFn).recognize("aGk=", "image/png").catch((e) => e);
    expect(error).toBeInstanceOf(RecognizeError);
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  test("等太久：中止請求並提示重試", async () => {
    jest.useFakeTimers();
    try {
      const fetchFn = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      );
      const pending = recognizer(fetchFn).recognize("aGk=", "image/png").catch((e) => e);
      jest.advanceTimersByTime(75_000);
      expect((await pending).message).toBe(TIMEOUT_MESSAGE);
    } finally {
      jest.useRealTimers();
    }
  });
});
