import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InsightServerError } from "./claudeInsight.ts";
import { parseRecognizeText, RECOGNIZE_MODEL, recognizeHoldings } from "./claudeRecognize.ts";
import { fakeClaude, fakeImageBase64, RECOGNIZE_REPLY } from "./testHelpers.ts";

const INPUT = { imageBase64: fakeImageBase64("jpeg"), mediaType: "image/jpeg" as const };

async function rejectsWith(promise: Promise<unknown>, status: number, message: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof InsightServerError);
    assert.equal(error.status, status);
    assert.match(error.message, message);
    return true;
  });
}

describe("recognizeHoldings", () => {
  it("sends the image with the sniffed media type and asks for JSON via structured outputs", async () => {
    const claude = fakeClaude([RECOGNIZE_REPLY]);
    await recognizeHoldings(INPUT, { createMessage: claude.createMessage });

    const params = claude.calls[0];
    assert.equal(params.model, RECOGNIZE_MODEL);
    assert.equal(params.output_config?.format?.type, "json_schema");
    const content = params.messages[0].content as Anthropic.Beta.Messages.BetaContentBlockParam[];
    const image = content.find((block) => block.type === "image");
    assert.deepEqual(image?.type === "image" && image.source, {
      type: "base64",
      media_type: "image/jpeg",
      data: INPUT.imageBase64,
    });
  });

  it("returns the model's holdings and warnings as-is for the app to normalise", async () => {
    let usage = 0;
    const result = await recognizeHoldings(INPUT, {
      createMessage: fakeClaude([RECOGNIZE_REPLY]).createMessage,
      onUsage: (u) => (usage = u.input_tokens),
    });
    assert.deepEqual(result, RECOGNIZE_REPLY);
    assert.equal(usage, 1200);
  });

  it("turns an invalid API key into a Chinese 503 without leaking the English error", async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers());
    await rejectsWith(recognizeHoldings(INPUT, { createMessage: fakeClaude([auth]).createMessage }), 503, /ANTHROPIC_API_KEY/);
  });

  it("returns 422 when the model refuses or runs out of tokens", async () => {
    for (const stop_reason of ["refusal", "max_tokens"] as const) {
      const { createMessage } = fakeClaude([RECOGNIZE_REPLY]);
      const stopped = async (params: Parameters<typeof createMessage>[0]) => ({ ...(await createMessage(params)), stop_reason });
      await rejectsWith(recognizeHoldings(INPUT, { createMessage: stopped }), 422, /截圖|圖片/);
    }
  });
});

describe("parseRecognizeText", () => {
  it("returns 502 for non-JSON or a reply without a holdings array", () => {
    assert.throws(() => parseRecognizeText("oops"), (e: unknown) => e instanceof InsightServerError && e.status === 502);
    assert.throws(() => parseRecognizeText('{"warnings":[]}'), (e: unknown) => e instanceof InsightServerError && e.status === 502);
  });

  it("drops non-object rows and non-string warnings", () => {
    assert.deepEqual(parseRecognizeText('{"holdings":[1,null,{"name":"台積電"}],"warnings":["a",2]}'), {
      holdings: [{ name: "台積電" }],
      warnings: ["a"],
    });
  });
});
