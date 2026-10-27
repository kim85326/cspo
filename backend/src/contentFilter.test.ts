import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BANNED_TERMS, DISCLAIMER, findBannedTerms, sanitizeInsight } from "./contentFilter.ts";
import { CLEAN_REPLY, sampleInput } from "./testHelpers.ts";

describe("findBannedTerms", () => {
  it("returns nothing when the text only describes numbers", () => {
    assert.deepEqual(findBannedTerms(CLEAN_REPLY), []);
  });

  it("finds every banned term across summary, observations and risk note", () => {
    const hits = findBannedTerms({
      summary: "整體小賺，建議續抱。",
      observations: ["台積電可以考慮加碼。"],
      riskNote: "記得設停損。",
    });
    assert.deepEqual(hits.sort(), ["停損", "加碼", "建議"].sort());
  });

  it("covers the words the spec forbids", () => {
    for (const term of ["建議", "應該", "買進", "賣出", "加碼", "減碼", "停損", "目標價"]) {
      assert.ok((BANNED_TERMS as readonly string[]).includes(term), term);
    }
  });
});

describe("sanitizeInsight", () => {
  it("drops only the sentences that contain banned terms", () => {
    const result = sanitizeInsight(
      {
        summary: "合計賺 10,000 元，報酬率 +1.43%。你應該繼續持有。",
        observations: ["台積電報酬率 +4.00%。", "鴻海可以賣出。"],
        riskNote: "股價會變動。",
      },
      sampleInput(),
    );
    assert.equal(result.summary, "合計賺 10,000 元，報酬率 +1.43%。");
    assert.deepEqual(result.observations, ["台積電報酬率 +4.00%。"]);
    assert.equal(result.riskNote, "股價會變動。");
    assert.deepEqual(findBannedTerms(result), []);
  });

  it("fills in neutral sentences built from the numbers when everything is removed", () => {
    const result = sanitizeInsight(
      { summary: "建議買進。", observations: ["應該加碼。"], riskNote: "設好停損。" },
      sampleInput(),
    );
    assert.equal(result.summary, "這 2 檔持股合計賺 10,000 元，報酬率 +1.43%。");
    assert.deepEqual(result.observations, [
      "報酬率最高的是 台積電（2330），+4.00%。",
      "報酬率最低的是 鴻海（2317），-5.00%。",
    ]);
    assert.notEqual(result.riskNote, "");
    assert.deepEqual(findBannedTerms(result), []);
  });
});

describe("DISCLAIMER", () => {
  it("is the fixed sentence from the spec", () => {
    assert.equal(DISCLAIMER, "僅為數據解讀，不構成投資建議");
  });
});
