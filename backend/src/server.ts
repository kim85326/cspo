import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  createClaudeCreateMessage,
  generateInsight,
  INSIGHT_MODEL,
  InsightServerError,
  type CreateMessage,
} from "./claudeInsight.ts";
import type { InsightConfig } from "./config.ts";
import { InvalidInsightRequest, parseInsightRequest } from "./insightRequest.ts";
import { createDailyQuota, createPerMinuteLimiter } from "./rateLimit.ts";

/**
 * 路由：
 * - GET  /health   → 200，回報 key／token 有沒有設（不回值）
 * - POST /insight  → 依序檢查：頻率 → 存取碼 → API key → 大小 → 格式 → 每日上限 → 呼叫 Claude
 * - OPTIONS *      → CORS preflight（只有網頁版會送）
 * 錯誤一律回 { error: 中文訊息 }，app 原樣顯示。
 */

export const MISSING_API_KEY_MESSAGE =
  "AI 解讀後端沒有設定 ANTHROPIC_API_KEY：請在 backend/.env 填入後重新執行 npm run backend";
export const MISSING_TOKEN_MESSAGE =
  "AI 解讀後端沒有設定 INSIGHT_ACCESS_TOKEN：請在 backend/.env 填入後重新執行 npm run backend";

export type ServerDeps = {
  /** 沒給就用 config.apiKey 建真的 Claude client；測試給假的 */
  createMessage?: CreateMessage;
  now?: () => number;
  log?: (line: string) => void;
};

export function createInsightServer(config: InsightConfig, deps: ServerDeps = {}): Server {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const perMinute = createPerMinuteLimiter(config.rateLimitPerMinute);
  const daily = createDailyQuota(config.dailyLimit);
  let createMessage = deps.createMessage;
  const getCreateMessage = (): CreateMessage =>
    (createMessage ??= createClaudeCreateMessage(config.apiKey));

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log(`[insight] 未處理的錯誤 ${String(error)}`);
      if (!res.headersSent) sendJson(res, 500, { error: "後端發生未知錯誤，請重試" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    applyCors(req, res, config.allowedOrigins);
    const path = (req.url ?? "/").split("?")[0];

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (path === "/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        model: INSIGHT_MODEL,
        apiKeyConfigured: config.apiKey !== "",
        accessTokenConfigured: config.accessToken !== "",
      });
      return;
    }
    if (path !== "/insight") {
      sendJson(res, 404, { error: "找不到這個路徑" });
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      sendJson(res, 405, { error: "請用 POST" });
      return;
    }

    // 1. 頻率限制先做：猜存取碼也會被擋
    const ip = clientIp(req, config.trustProxy);
    const limited = perMinute.check(ip, now());
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSeconds));
      sendJson(res, 429, { error: `使用太頻繁，請 ${limited.retryAfterSeconds} 秒後再試` });
      return;
    }

    // 2. 存取碼：後端沒設就一律拒絕（fail closed），避免忘了設就裸奔
    if (config.accessToken === "") {
      sendJson(res, 503, { error: MISSING_TOKEN_MESSAGE });
      return;
    }
    if (!tokenMatches(req.headers.authorization, config.accessToken)) {
      sendJson(res, 401, { error: "存取碼不正確：請確認 app 的 EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN 與後端一致" });
      return;
    }

    // 3. API key
    if (config.apiKey === "") {
      sendJson(res, 503, { error: MISSING_API_KEY_MESSAGE });
      return;
    }

    // 4. 大小上限
    let raw: string;
    try {
      raw = await readBody(req, config.maxBodyBytes);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        sendJson(res, 413, { error: "資料太大" }, true);
        return;
      }
      throw error;
    }

    // 5. 格式
    let input;
    try {
      input = parseInsightRequest(JSON.parse(raw));
    } catch (error) {
      const message = error instanceof InvalidInsightRequest ? error.message : "請求格式錯誤";
      sendJson(res, 400, { error: message });
      return;
    }

    // 6. 每日上限（只算真的要呼叫 Claude 的請求）
    if (!daily.take(now())) {
      sendJson(res, 429, { error: "今天的 AI 解讀次數已達上限，明天再試" });
      return;
    }

    // 7. 呼叫 Claude
    try {
      const started = now();
      const result = await generateInsight(input, {
        createMessage: getCreateMessage(),
        maxTokens: config.maxTokens,
        onUsage: (usage) =>
          log(`[insight] usage input=${usage.input_tokens} output=${usage.output_tokens}`),
      });
      log(
        `[insight] ok holdings=${input.holdings.length} filtered=${result.filtered} ms=${now() - started}`,
      );
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof InsightServerError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      throw error;
    }
  }
}

function applyCors(req: IncomingMessage, res: ServerResponse, allowed: string[]): void {
  const origin = req.headers.origin;
  if (!origin) return;
  if (allowed.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    return;
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf !== "") return cf;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function tokenMatches(header: string | undefined, expected: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1].trim());
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown, close = false): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // 沒讀完的大 body 不再收，回完就斷線
  if (close) res.setHeader("Connection", "close");
  res.end(JSON.stringify(body));
}
