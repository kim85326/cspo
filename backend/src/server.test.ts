import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import type { CreateMessage } from "./claudeInsight.ts";
import { loadConfig, type InsightConfig } from "./config.ts";
import { createInsightServer, MISSING_API_KEY_MESSAGE, MISSING_TOKEN_MESSAGE } from "./server.ts";
import { CLEAN_REPLY, fakeClaude, sampleInput } from "./testHelpers.ts";

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

  it("returns 404 for unknown paths", async () => {
    const base = await start();
    assert.equal((await fetch(`${base}/nope`)).status, 404);
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

  it("sends no CORS headers to an origin that is not allowed", async () => {
    const base = await start();
    const response = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
