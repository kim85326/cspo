import { FAKE_INSIGHT } from "./fakeInsightProvider";
import {
  createBackendInsightProvider,
  NETWORK_ERROR_MESSAGE,
  NOT_CONFIGURED_MESSAGE,
  parseInsight,
} from "./backendInsightProvider";
import { insightBaseUrl } from "./insightEndpoint";
import { InsightError } from "./InsightProvider";
import { insightInputFromQuotes } from "@/domain/insightInput";

const INPUT = insightInputFromQuotes([
  { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: { symbol: "2330", name: "台積電", price: 520 } },
]);

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function provider(fetchFn: jest.Mock, base: string | null = "http://192.168.1.5:8787") {
  return createBackendInsightProvider(fetchFn as unknown as typeof fetch, () => base, () => "secret-token");
}

describe("backendInsightProvider", () => {
  test("POST 到 /insight，帶存取碼與持股摘要，回傳解讀", async () => {
    const fetchFn = jest.fn(async () => jsonResponse(200, FAKE_INSIGHT));
    const insight = await provider(fetchFn).getInsight(INPUT);

    expect(insight).toEqual(FAKE_INSIGHT);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.1.5:8787/insight");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(init.body))).toEqual(INPUT);
  });

  test("沒設定網址：提示要設 EXPO_PUBLIC_INSIGHT_API_URL，不打網路", async () => {
    const fetchFn = jest.fn();
    await expect(provider(fetchFn, null).getInsight(INPUT)).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("連不到（後端沒開、網路不通）：提示啟動 npm run backend", async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(provider(fetchFn).getInsight(INPUT)).rejects.toThrow(NETWORK_ERROR_MESSAGE);
  });

  test("503／429／401：顯示後端回的中文訊息", async () => {
    for (const [status, error] of [
      [503, "AI 解讀後端沒有設定 ANTHROPIC_API_KEY"],
      [429, "使用太頻繁，請 30 秒後再試"],
      [401, "存取碼不正確"],
    ] as const) {
      const fetchFn = jest.fn(async () => jsonResponse(status, { error }));
      await expect(provider(fetchFn).getInsight(INPUT)).rejects.toThrow(error);
    }
  });

  test("回應不是 JSON（例如 tunnel 自己回的 429）：依狀態碼給中文訊息", async () => {
    const fetchFn = jest.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }));
    await expect(provider(fetchFn).getInsight(INPUT)).rejects.toThrow("AI 解讀使用太頻繁，請稍候一分鐘再試");
  });
});

describe("parseInsight", () => {
  test("缺總結或觀察：當成錯誤", () => {
    expect(() => parseInsight({ observations: ["a"] })).toThrow(InsightError);
    expect(() => parseInsight({ summary: "a", observations: [] })).toThrow(InsightError);
  });

  test("沒有免責聲明時補上固定文字", () => {
    expect(parseInsight({ summary: "a", observations: ["b"] }).disclaimer).toBe("僅為數據解讀，不構成投資建議");
  });
});

describe("insightBaseUrl", () => {
  test("有設網址就用它（去掉結尾斜線）", () => {
    expect(insightBaseUrl("https://abc.trycloudflare.com/", "192.168.1.5:8081", "android")).toBe(
      "https://abc.trycloudflare.com",
    );
  });

  test("Expo Go 區網：用 dev server 的 IP 換成 8787", () => {
    expect(insightBaseUrl("", "192.168.1.5:8081", "android")).toBe("http://192.168.1.5:8787");
  });

  test("網頁版：用網頁的主機名", () => {
    expect(insightBaseUrl(undefined, undefined, "web", "localhost")).toBe("http://localhost:8787");
  });

  test("Expo tunnel 或 APK：猜不到，回 null", () => {
    expect(insightBaseUrl(undefined, "abc-anonymous-8081.exp.direct", "ios")).toBeNull();
    expect(insightBaseUrl(undefined, undefined, "web", "abc-anonymous-8081.exp.direct")).toBeNull();
    expect(insightBaseUrl(undefined, undefined, "android")).toBeNull();
  });
});
