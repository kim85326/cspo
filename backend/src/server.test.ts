import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import type { CreateMessage } from "./claudeInsight.ts";
import { loadConfig, type InsightConfig } from "./config.ts";
import {
  createInsightServer,
  MISSING_API_KEY_MESSAGE,
  MISSING_TOKEN_MESSAGE,
  originAllowed,
} from "./server.ts";
import { CLEAN_REPLY, fakeClaude, fakeImageBase64, RECOGNIZE_REPLY, sampleInput } from "./testHelpers.ts";

const TOKEN = "test-token-123";

const servers: Array<{ close: () => void }> = [];
after(() => servers.forEach((s) => s.close()));

/** 開一台測試用後端（port 0 = 隨機），回傳 base URL 與假 Claude 的呼叫紀錄 */
async function start(
  env: Record<string, string> = {},
  createMessage: CreateMessage = fakeClaude([CLEAN_REPLY]).createMessage,
) {
  const config: InsightConfig = loadConfig({
    ANTHROPIC_API_KEY: "sk-ant-test",
    INSIGHT_ACCESS_TOKEN: TOKEN,
    ...env,
  });
  const server = createInsightServer(config, { createMessage, log: () => {} });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function postInsight(base: string, body: unknown = sampleInput(), headers: Record<string, string> = {}) {
  return fetch(`${base}/insight`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function postRecognize(
  base: string,
  body: unknown = { imageBase64: fakeImageBase64("jpeg"), mimeType: "image/png" },
  headers: Record<string, string> = {},
) {
  return fetch(`${base}/recognize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /health", () => {
  it("returns 200 and whether the key and token are configured, without their values", async () => {
    const base = await start({ ANTHROPIC_API_KEY: "" });
    const response = await fetch(`${base}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.apiKeyConfigured, false);
    assert.equal(body.accessTokenConfigured, true);
    assert.equal(JSON.stringify(body).includes(TOKEN), false);
  });
});

describe("POST /insight", () => {
  it("returns the insight with the disclaimer when everything is valid", async () => {
    const base = await start();
    const response = await postInsight(base);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.summary, CLEAN_REPLY.summary);
    assert.equal(body.disclaimer, "僅為數據解讀，不構成投資建議");
    assert.equal(body.filtered, false);
  });

  it("returns 401 when the access token is missing or wrong", async () => {
    const claude = fakeClaude([CLEAN_REPLY]);
    const base = await start({}, claude.createMessage);
    const missing = await fetch(`${base}/insight`, { method: "POST", body: JSON.stringify(sampleInput()) });
    const wrong = await postInsight(base, sampleInput(), { Authorization: "Bearer nope" });
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.match((await wrong.json()).error, /存取碼/);
    assert.equal(claude.calls.length, 0);
  });

  it("returns 503 when the backend has no access token configured", async () => {
    const base = await start({ INSIGHT_ACCESS_TOKEN: "" });
    const response = await postInsight(base);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, MISSING_TOKEN_MESSAGE);
  });

  it("returns 503 with a clear message when ANTHROPIC_API_KEY is not set", async () => {
    const claude = fakeClaude([CLEAN_REPLY]);
    const base = await start({ ANTHROPIC_API_KEY: "" }, claude.createMessage);
    const response = await postInsight(base);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, MISSING_API_KEY_MESSAGE);
    assert.equal(claude.calls.length, 0);
  });

  it("returns 429 with Retry-After after the per-minute limit, even for wrong tokens", async () => {
    const base = await start({ INSIGHT_RATE_LIMIT_PER_MINUTE: "2" });
    assert.equal((await postInsight(base)).status, 200);
    assert.equal((await postInsight(base, sampleInput(), { Authorization: "Bearer nope" })).status, 401);
    const limited = await postInsight(base);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.match((await limited.json()).error, /秒後再試/);
  });

  it("returns 429 once the daily limit is used up", async () => {
    const base = await start({ INSIGHT_DAILY_LIMIT: "1" });
    assert.equal((await postInsight(base)).status, 200);
    const response = await postInsight(base);
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /今天/);
  });

  it("returns 413 when the body is larger than the limit", async () => {
    const claude = fakeClaude([CLEAN_REPLY]);
    const base = await start({ INSIGHT_MAX_BODY_BYTES: "1024" }, claude.createMessage);
    const response = await postInsight(base, { ...sampleInput(), padding: "x".repeat(5_000) });
    assert.equal(response.status, 413);
    assert.equal(claude.calls.length, 0);
  });

  it("returns 400 for malformed JSON or an invalid shape", async () => {
    const base = await start();
    assert.equal((await postInsight(base, "{not json")).status, 400);
    const invalid = await postInsight(base, { ...sampleInput(), holdings: [] });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, "沒有持股資料");
  });

  it("returns the filtered safe version when Claude keeps using banned terms", async () => {
    const banned = { ...CLEAN_REPLY, summary: "合計小賺，建議續抱。" };
    const base = await start({}, fakeClaude([banned, banned]).createMessage);
    const body = await (await postInsight(base)).json();
    assert.equal(body.filtered, true);
    assert.equal(body.summary.includes("建議"), false);
  });

  it("returns 429 when too many requests are already waiting for Claude", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const slow: CreateMessage = async (params) => {
      await gate;
      return fakeClaude([CLEAN_REPLY]).createMessage(params);
    };
    const base = await start({ INSIGHT_MAX_CONCURRENT: "1", INSIGHT_TRUST_PROXY: "1" }, slow);
    const first = postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.1" });
    await new Promise((r) => setTimeout(r, 50));
    const second = await postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.2" });
    assert.equal(second.status, 429);
    assert.match((await second.json()).error, /忙碌/);
    release();
    assert.equal((await first).status, 200);
  });
});

describe("POST /recognize", () => {
  it("returns the model's holdings, sending the type sniffed from the content", async () => {
    const claude = fakeClaude([RECOGNIZE_REPLY]);
    const base = await start({}, claude.createMessage);
    const response = await postRecognize(base);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), RECOGNIZE_REPLY);
    assert.match(JSON.stringify(claude.calls[0].messages), /"media_type":"image\/jpeg"/);
  });

  it("requires the same access token, and fails closed without the token or the API key", async () => {
    const claude = fakeClaude([RECOGNIZE_REPLY]);
    const base = await start({}, claude.createMessage);
    assert.equal((await postRecognize(base, undefined, { Authorization: "Bearer nope" })).status, 401);
    assert.equal((await postRecognize(await start({ INSIGHT_ACCESS_TOKEN: "" }))).status, 503);
    const noKey = await postRecognize(await start({ ANTHROPIC_API_KEY: "" }));
    assert.equal(noKey.status, 503);
    assert.equal((await noKey.json()).error, MISSING_API_KEY_MESSAGE);
    assert.equal(claude.calls.length, 0);
  });

  it("accepts images far larger than the /insight body limit, up to its own limit", async () => {
    const base = await start({ INSIGHT_MAX_BODY_BYTES: "1024", INSIGHT_RECOGNIZE_MAX_IMAGE_BYTES: "204800" }, fakeClaude([RECOGNIZE_REPLY]).createMessage);
    const ok = await postRecognize(base, { imageBase64: fakeImageBase64("png", 200_000), mimeType: "image/png" });
    assert.equal(ok.status, 200);
    const tooBig = await postRecognize(base, { imageBase64: fakeImageBase64("png", 300_000), mimeType: "image/png" });
    assert.equal(tooBig.status, 413);
    assert.match((await tooBig.json()).error, /圖片太大/);
  });

  it("defaults the image limit to 5 MB", () => {
    assert.equal(loadConfig({}).recognizeMaxImageBytes, 5 * 1024 * 1024);
  });

  it("returns 415 for content that is not a supported image, without calling Claude", async () => {
    const claude = fakeClaude([RECOGNIZE_REPLY]);
    const base = await start({}, claude.createMessage);
    const pdf = await postRecognize(base, { imageBase64: fakeImageBase64("pdf"), mimeType: "image/png" });
    assert.equal(pdf.status, 415);
    const declared = await postRecognize(base, { imageBase64: fakeImageBase64("png"), mimeType: "text/html" });
    assert.equal(declared.status, 415);
    assert.equal((await postRecognize(base, { mimeType: "image/png" })).status, 400);
    assert.equal(claude.calls.length, 0);
  });

  it("shares the per-minute and daily limits with /insight", async () => {
    const perMinute = await start({ INSIGHT_RATE_LIMIT_PER_MINUTE: "1" });
    assert.equal((await postInsight(perMinute)).status, 200);
    assert.equal((await postRecognize(perMinute)).status, 429);

    const daily = await start({ INSIGHT_DAILY_LIMIT: "1" }, fakeClaude([RECOGNIZE_REPLY]).createMessage);
    assert.equal((await postRecognize(daily)).status, 200);
    const limited = await postInsight(daily);
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /今天/);
  });

  it("answers the CORS preflight", async () => {
    const base = await start();
    const response = await fetch(`${base}/recognize`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8081", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:8081");
  });
});

describe("only /health, /insight and /recognize are exposed", () => {
  it("returns 404 for any other path, including preflight", async () => {
    const base = await start();
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 404);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    const preflight = await fetch(`${base}/admin`, { method: "OPTIONS", headers: { Origin: "http://localhost:8081" } });
    assert.equal(preflight.status, 404);
  });

  it("returns 405 for the wrong method", async () => {
    const base = await start();
    assert.equal((await fetch(`${base}/health`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${base}/insight`)).status, 405);
    assert.equal((await fetch(`${base}/recognize`)).status, 405);
  });
});

describe("source IP behind a tunnel", () => {
  it("counts each CF-Connecting-IP separately when INSIGHT_TRUST_PROXY=1 and the connection is local", async () => {
    const base = await start({ INSIGHT_RATE_LIMIT_PER_MINUTE: "1", INSIGHT_TRUST_PROXY: "1" });
    assert.equal((await postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.1" })).status, 200);
    assert.equal((await postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.1" })).status, 429);
    assert.equal((await postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.2" })).status, 200);
  });

  it("uses the last X-Forwarded-For entry (the one ngrok appends), so a forged first entry does not help", async () => {
    const base = await start({ INSIGHT_RATE_LIMIT_PER_MINUTE: "1", INSIGHT_TRUST_PROXY: "1" });
    assert.equal((await postInsight(base, sampleInput(), { "X-Forwarded-For": "9.9.9.9, 198.51.100.7" })).status, 200);
    // 同一個真實 IP，前面換成別的假 IP 也一樣被擋
    assert.equal((await postInsight(base, sampleInput(), { "X-Forwarded-For": "8.8.8.8, 198.51.100.7" })).status, 429);
    assert.equal((await postInsight(base, sampleInput(), { "X-Forwarded-For": "8.8.8.8, 198.51.100.8" })).status, 200);
  });

  it("ignores the headers when INSIGHT_TRUST_PROXY is off, so they cannot be used to dodge the limit", async () => {
    const base = await start({ INSIGHT_RATE_LIMIT_PER_MINUTE: "1" });
    assert.equal((await postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.1" })).status, 200);
    assert.equal((await postInsight(base, sampleInput(), { "CF-Connecting-IP": "203.0.113.2" })).status, 429);
  });
});

describe("CORS", () => {
  it("answers the preflight for an allowed web origin", async () => {
    const base = await start();
    const response = await fetch(`${base}/insight`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8081",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:8081");
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /Authorization/);
  });

  it("supports subdomain wildcards such as https://*.exp.direct", () => {
    const allowed = ["http://localhost:8081", "https://*.exp.direct"];
    assert.equal(originAllowed("https://abc-anonymous-8081.exp.direct", allowed), true);
    assert.equal(originAllowed("http://abc-anonymous-8081.exp.direct", allowed), false);
    assert.equal(originAllowed("https://evilexp.direct", allowed), false);
    assert.equal(originAllowed("https://exp.direct.evil.com", allowed), false);
    assert.equal(originAllowed("http://localhost:8081", allowed), true);
    assert.equal(originAllowed("http://localhost:3000", allowed), false);
  });

  it("sends no CORS headers to an origin that is not allowed", async () => {
    const base = await start();
    const response = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
