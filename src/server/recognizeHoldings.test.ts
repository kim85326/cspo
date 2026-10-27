import type Anthropic from "@anthropic-ai/sdk";
import {
  createClaudeClient,
  MISSING_API_KEY_MESSAGE,
  OUTPUT_SCHEMA,
  RecognizeServerError,
  recognizeHoldingsWithClaude,
  type CreateMessage,
} from "./recognizeHoldings";

function fakeMessage(
  text: string,
  stopReason: Anthropic.Beta.Messages.BetaMessage["stop_reason"] = "end_turn",
): Anthropic.Beta.Messages.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

describe("recognizeHoldingsWithClaude", () => {
  test("把 Claude 回的 JSON 整理成 ExtractionResult，且請求帶了圖片與 JSON schema", async () => {
    const create = jest.fn<ReturnType<CreateMessage>, Parameters<CreateMessage>>(async () =>
      fakeMessage(
        JSON.stringify({
          holdings: [
            { symbol: "2330", name: "台積電", buyPrice: 500, quantity: 1, quantityUnit: "lots", confidence: "high" },
            { symbol: null, name: "鴻海", buyPrice: null, quantity: 1000, quantityUnit: "shares", confidence: "low" },
          ],
          warnings: ["第二列成本被遮住"],
        }),
      ),
    );

    const result = await recognizeHoldingsWithClaude("aGk=", "image/png", create);

    expect(result.holdings).toEqual([
      { symbol: "2330", name: "台積電", buyPrice: "500", shares: "1", unit: "lots", confidence: "high" },
      { symbol: undefined, name: "鴻海", buyPrice: undefined, shares: "1000", unit: "shares", confidence: "low" },
    ]);
    expect(result.warnings).toEqual(["第二列成本被遮住"]);

    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config?.format).toEqual({ type: "json_schema", schema: OUTPUT_SCHEMA });
    const content = params.messages[0].content as Anthropic.Beta.Messages.BetaContentBlockParam[];
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aGk=" },
    });
  });

  test("不支援的圖片格式直接回 400，不打 API", async () => {
    const create = jest.fn();
    await expect(recognizeHoldingsWithClaude("aGk=", "image/heic", create)).rejects.toMatchObject({
      status: 400,
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("被安全分類器拒絕：回 422 與中文訊息", async () => {
    const create: CreateMessage = async () => fakeMessage("", "refusal");
    await expect(recognizeHoldingsWithClaude("aGk=", "image/jpeg", create)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("無法處理這張圖片"),
    });
  });

  test("回傳不是 JSON：回 502", async () => {
    const create: CreateMessage = async () => fakeMessage("not json");
    await expect(recognizeHoldingsWithClaude("aGk=", "image/jpeg", create)).rejects.toMatchObject({
      status: 502,
    });
  });

  test("API 丟出非 SDK 錯誤：包成 500", async () => {
    const create: CreateMessage = async () => {
      throw new Error("boom");
    };
    await expect(recognizeHoldingsWithClaude("aGk=", "image/jpeg", create)).rejects.toBeInstanceOf(
      RecognizeServerError,
    );
  });
});

describe("createClaudeClient", () => {
  test("沒有 API key：丟 503 並說明怎麼設定", () => {
    expect(() => createClaudeClient(undefined)).toThrow(MISSING_API_KEY_MESSAGE);
    expect(() => createClaudeClient("  ")).toThrow(RecognizeServerError);
  });

  test("有 API key：建出 client", () => {
    expect(createClaudeClient("sk-ant-test")).toBeTruthy();
  });
});
