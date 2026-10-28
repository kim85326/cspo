import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  createClaudeCreateMessage,
  generateInsight,
  INSIGHT_MODEL,
  InsightServerError,
  type CreateMessage,
} from "./claudeInsight.ts";
import { recognizeHoldings } from "./claudeRecognize.ts";
import { recognizeMaxBodyBytes, type InsightConfig } from "./config.ts";
import { InvalidInsightRequest, parseInsightRequest, type InsightInput } from "./insightRequest.ts";
import { createDailyQuota, createPerMinuteLimiter } from "./rateLimit.ts";
import { InvalidRecognizeRequest, parseRecognizeRequest, type RecognizeInput } from "./recognizeRequest.ts";

/**
 * 路由（只開這三條，其他一律 404）：
 * - GET  /health     → 200，回報 key／token 有沒有設（不回值）
 * - POST /insight    → AI 解讀（Story 031）
 * - POST /recognize  → 截圖匯入的辨識（Story 005）；大小上限另外設（INSIGHT_RECOGNIZE_MAX_IMAGE_BYTES）
 *   兩條 POST 依序檢查：頻率 → 存取碼 → API key → 大小 → 格式 → 每日上限 → 同時處理數 → 呼叫 Claude，
 *   而且共用同一份頻率限制、每日上限與同時處理數（整台後端一個預算）。
 * - OPTIONS 上面三條 → CORS preflight（只有網頁版會送）
 * 錯誤一律回 { error: 中文訊息 }，app 原樣顯示。
 * 會透過 tunnel 公開到網路上，所以每一關都假設呼叫者不可信。
 */

export const MISSING_API_KEY_MESSAGE =
  "後端沒有設定 ANTHROPIC_API_KEY：請在 backend/.env 填入後重新執行 npm run backend";
export const MISSING_TOKEN_MESSAGE =
  "後端沒有設定 INSIGHT_ACCESS_TOKEN：請在 backend/.env 填入後重新執行 npm run backend";

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
  let inFlight = 0;
  let createMessage = deps.createMessage;
  const getCreateMessage = (): CreateMessage =>
    (createMessage ??= createClaudeCreateMessage(config.apiKey));

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log(`[backend] 未處理的錯誤 ${String(error)}`);
      if (!res.headersSent) sendJson(res, 500, { error: "後端發生未知錯誤，請重試" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const path = (req.url ?? "/").split("?")[0];
    if (path !== "/health" && path !== "/insight" && path !== "/recognize") {
      sendJson(res, 404, { error: "找不到這個路徑" });
      return;
    }
    applyCors(req, res, config.allowedOrigins);

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
    if (path === "/health" || req.method !== "POST") {
      res.setHeader("Allow", path === "/health" ? "GET" : "POST");
      sendJson(res, 405, { error: "不支援這個方法" });
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

    // 4. 大小上限（圖片另外設）
    const isRecognize = path === "/recognize";
    let raw: string;
    try {
      raw = await readBody(req, isRecognize ? recognizeMaxBodyBytes(config) : config.maxBodyBytes);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        const mb = (config.recognizeMaxImageBytes / 1024 / 1024).toFixed(0);
        sendJson(res, 413, { error: isRecognize ? `圖片太大（上限 ${mb} MB），請裁切後再試` : "資料太大" }, true);
        return;
      }
      throw error;
    }

    // 5. 格式
    let job: { kind: "insight"; input: InsightInput } | { kind: "recognize"; input: RecognizeInput };
    try {
      const json: unknown = JSON.parse(raw);
      job = isRecognize
        ? { kind: "recognize", input: parseRecognizeRequest(json, config.recognizeMaxImageBytes) }
        : { kind: "insight", input: parseInsightRequest(json) };
    } catch (error) {
      if (error instanceof InvalidRecognizeRequest) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      const message = error instanceof InvalidInsightRequest ? error.message : "請求格式錯誤";
      sendJson(res, 400, { error: message });
      return;
    }

    // 6. 每日上限（只算真的要呼叫 Claude 的請求）
    if (!daily.take(now())) {
      sendJson(res, 429, { error: "今天的 AI 使用次數已達上限，明天再試" });
      return;
    }

    // 7. 同時處理數：一個請求要等 Claude 幾秒，同時湧入太多就先擋
    if (inFlight >= config.maxConcurrent) {
      sendJson(res, 429, { error: "AI 服務忙碌中，請稍後再試" });
      return;
    }

    // 8. 呼叫 Claude
    inFlight += 1;
    const tag = `[${job.kind}]`;
    const onUsage = (usage: { input_tokens: number; output_tokens: number }) =>
      log(`${tag} usage input=${usage.input_tokens} output=${usage.output_tokens}`);
    try {
      const started = now();
      if (job.kind === "recognize") {
        const result = await recognizeHoldings(job.input, { createMessage: getCreateMessage(), onUsage });
        log(`${tag} ok type=${job.input.mediaType} holdings=${result.holdings.length} ms=${now() - started}`);
        sendJson(res, 200, result);
      } else {
        const result = await generateInsight(job.input, {
          createMessage: getCreateMessage(),
          maxTokens: config.maxTokens,
          onUsage,
        });
        log(`${tag} ok holdings=${job.input.holdings.length} filtered=${result.filtered} ms=${now() - started}`);
        sendJson(res, 200, result);
      }
    } catch (error) {
      if (error instanceof InsightServerError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      throw error;
    } finally {
      inFlight -= 1;
    }
  }
}

/**
 * 允許清單的寫法：完整來源（http://localhost:8081）、*（全部），
 * 或子網域萬用字元（https://*.exp.direct，Expo tunnel 的網頁版網址每次不同時用）。
 */
export function originAllowed(origin: string, allowed: string[]): boolean {
  return allowed.some((rule) => {
    if (rule === "*" || rule === origin) return true;
    const wildcard = /^(https?):\/\/\*\.(.+)$/.exec(rule);
    if (!wildcard) return false;
    const [, scheme, suffix] = wildcard;
    return origin.startsWith(`${scheme}://`) && origin.endsWith(`.${suffix}`) && !origin.includes("/", scheme.length + 3);
  });
}

function applyCors(req: IncomingMessage, res: ServerResponse, allowed: string[]): void {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(origin, allowed)) return;
  res.setHeader("Access-Control-Allow-Origin", allowed.includes("*") ? "*" : origin);
  if (!allowed.includes("*")) res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // ngrok-skip-browser-warning：走 ngrok 免費網域時，瀏覽器版要帶這個 header 才不會拿到 ngrok 的提示頁（app 一律帶）
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning");
  res.setHeader("Access-Control-Max-Age", "600");
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * 頻率限制用的來源 IP。
 * 只有在 INSIGHT_TRUST_PROXY=1 **而且連線來自本機**（也就是 ngrok／cloudflared 轉進來的）時才看 header，
 * 直接連進來的人偽造 header 沒有用：
 * - X-Forwarded-For（ngrok）：ngrok 會把真正的來源 IP **接在最後面**，前面的值可能是使用者自己塞的，所以取最後一個。
 * - CF-Connecting-IP（Cloudflare tunnel）：由 Cloudflare 設定。
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const remote = req.socket.remoteAddress ?? "unknown";
  if (!trustProxy || !LOOPBACK.has(remote)) return remote;
  const forwarded = req.headers["x-forwarded-for"];
  const last = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)
    ?.split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
    .pop();
  if (last) return last;
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim() !== "") return cf.trim();
  return remote;
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
