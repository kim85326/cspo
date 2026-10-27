import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateInsight, INSIGHT_MODEL, InsightServerError } from "./claudeInsight.ts";
import { findBannedTerms } from "./contentFilter.ts";
import { CLEAN_REPLY, fakeClaude, sampleInput } from "./testHelpers.ts";

const BANNED_REPLY = {
  summary: "合計小賺，建議續抱。",
  observations: ["台積電報酬率 +4.00%。", "鴻海可以考慮停損。"],
  riskNote: "股價會變動。",
};

describe("generateInsight", () => {
  it("returns the reply with the disclaimer when it has no banned terms", async () => {
    const claude = fakeClaude([CLEAN_REPLY]);
    const result = await generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 });

    assert.equal(claude.calls.length, 1);
    assert.equal(result.summary, CLEAN_REPLY.summary);
    assert.deepEqual(result.observations, CLEAN_REPLY.observations);
    assert.equal(result.disclaimer, "僅為數據解讀，不構成投資建議");
    assert.equal(result.filtered, false);
  });

  it("asks for JSON via structured outputs with the configured max_tokens", async () => {
    const claude = fakeClaude([CLEAN_REPLY]);
    await generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 1500 });

    const params = claude.calls[0];
    assert.equal(params.model, INSIGHT_MODEL);
    assert.equal(params.max_tokens, 1500);
    assert.equal(params.output_config?.format?.type, "json_schema");
    assert.match(String(params.system), /不能提供投資建議/);
  });

  it("retries once and returns the second reply when the first has banned terms", async () => {
    const claude = fakeClaude([BANNED_REPLY, CLEAN_REPLY]);
    const result = await generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 });

    assert.equal(claude.calls.length, 2);
    const retryPrompt = JSON.stringify(claude.calls[1].messages);
    assert.match(retryPrompt, /建議/);
    assert.match(retryPrompt, /停損/);
    assert.equal(result.filtered, false);
    assert.equal(result.summary, CLEAN_REPLY.summary);
  });

  it("strips banned sentences and flags filtered when both attempts have banned terms", async () => {
    const claude = fakeClaude([BANNED_REPLY, BANNED_REPLY]);
    const result = await generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 });

    assert.equal(claude.calls.length, 2);
    assert.equal(result.filtered, true);
    assert.deepEqual(findBannedTerms(result), []);
    assert.deepEqual(result.observations, ["台積電報酬率 +4.00%。"]);
    assert.equal(result.disclaimer, "僅為數據解讀，不構成投資建議");
  });

  it("keeps at most 4 observations", async () => {
    const claude = fakeClaude([{ ...CLEAN_REPLY, observations: ["一。", "二。", "三。", "四。", "五。"] }]);
    const result = await generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 });
    assert.equal(result.observations.length, 4);
  });

  it("throws a 502 when the reply is not valid JSON", async () => {
    const claude = fakeClaude(["not json"]);
    await assert.rejects(
      generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 }),
      (error: unknown) => error instanceof InsightServerError && error.status === 502,
    );
  });

  it("throws a 503 with a Chinese message when the API key is rejected", async () => {
    const claude = fakeClaude([new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers())]);
    await assert.rejects(
      generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 }),
      (error: unknown) =>
        error instanceof InsightServerError && error.status === 503 && /ANTHROPIC_API_KEY/.test(error.message),
    );
  });

  it("throws a 429 when Claude is rate limited", async () => {
    const claude = fakeClaude([new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers())]);
    await assert.rejects(
      generateInsight(sampleInput(), { createMessage: claude.createMessage, maxTokens: 2048 }),
      (error: unknown) => error instanceof InsightServerError && error.status === 429,
    );
  });
});
