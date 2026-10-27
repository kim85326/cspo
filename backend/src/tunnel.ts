import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import {
  AUTHTOKEN_STEPS,
  findPublicUrl,
  hasAuthtoken,
  INSTALL_STEPS,
  NGROK_AGENT_API,
  ngrokConfigPath,
  readEnvValue,
} from "./ngrok.ts";

/**
 * npm run backend:tunnel：啟動 AI 解讀後端 + ngrok，讓別人的手機（不同網路、APK、Expo Go、網頁版）連得進來。
 *
 * 1. 檢查 ngrok 有沒有裝、有沒有設 authtoken；沒有就印出步驟讓使用者自己做（不會替你安裝或註冊）
 * 2. 啟動後端，只聽 127.0.0.1（區網的人不能繞過 ngrok 直接連），並開 INSIGHT_TRUST_PROXY 讓頻率限制看得到真實 IP
 * 3. 後端沒設 API key 或存取碼就停下來，不對外公開
 * 4. 啟動 ngrok http <port>，從本機 agent API 拿到公開網址，再從外面打一次 /health 確認連得到
 * 5. 對照 .env.local 的 EXPO_PUBLIC_INSIGHT_API_URL，提醒 app 端要設的值
 * Ctrl+C 會同時關掉 ngrok 與後端。測試時可用 NGROK_BIN 換成假的 ngrok。
 */

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(backendDir, "..");
const config = loadConfig(process.env);
const port = config.port;
const local = `http://127.0.0.1:${port}`;
const ngrokBin = process.env.NGROK_BIN ?? "ngrok";
const children: ChildProcess[] = [];
let stopping = false;

function fail(message: string): never {
  console.error(`\n${message}\n`);
  stop(1);
}

function stop(code = 0): never {
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => {
  console.log("\n[tunnel] 關閉 ngrok 與後端…");
  stop(0);
});
process.on("SIGTERM", () => stop(0));

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function poll<T>(seconds: number, attempt: () => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const value = await attempt();
      if (value !== null) return value;
    } catch {
      // 還沒好，等一下再試
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return null;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // 1. ngrok 裝了沒、authtoken 設了沒
  const version = spawnSync(ngrokBin, ["version"], { encoding: "utf8" });
  if (version.error) fail(INSTALL_STEPS);
  if (!hasAuthtoken(readText(ngrokConfigPath()), process.env)) fail(AUTHTOKEN_STEPS);

  // 已經有東西佔用後端埠號或 ngrok 的 4040，多半是另一個 npm run backend 或 ngrok 還開著
  if (await poll(1, () => getJson(`${local}/health`))) {
    fail(`${local} 已經有服務在跑（可能是另一個 npm run backend）。請先關掉它再執行 npm run backend:tunnel。`);
  }
  if (await poll(1, () => getJson(`${NGROK_AGENT_API}/endpoints`))) {
    fail("已經有另一個 ngrok 在跑（http://127.0.0.1:4040 有回應）。請先關掉它再執行。");
  }

  console.log(`[tunnel] ${String(version.stdout).trim()}`);
  console.log(`[tunnel] 即將對外公開：
  - 這台電腦的 AI 解讀後端（${local}）會透過 ngrok 變成一個公開的 https 網址，任何知道網址的人都連得到
  - 只有 GET /health（回報 key／存取碼有沒有設，不含值）與 POST /insight（要存取碼）兩條路，其他一律 404
  - 每次 /insight 都會用你的 Anthropic API key 花錢；限制：每 IP 每分鐘 ${config.rateLimitPerMinute} 次、
    全部每天 ${config.dailyLimit} 次、同時 ${config.maxConcurrent} 個、max_tokens ${config.maxTokens}
  - 請確認已在 Anthropic Console 為這把 key 設每月花費上限（docs/architecture.md 第 7 節）
`);

  // 2. 啟動後端：只聽本機，ngrok 轉進來的連線才看 X-Forwarded-For
  const backend = spawn(process.execPath, ["--env-file-if-exists=.env", "src/main.ts"], {
    cwd: backendDir,
    env: { ...process.env, INSIGHT_HOST: "127.0.0.1", INSIGHT_TRUST_PROXY: "1" },
    stdio: "inherit",
  });
  children.push(backend);
  backend.on("exit", (code) => {
    if (!stopping) fail(`[tunnel] 後端結束了（exit ${code}），ngrok 一起關閉。`);
  });

  // 3. 後端起來了沒、key 與存取碼設了沒
  const health = (await poll(15, () => getJson(`${local}/health`))) as
    | { apiKeyConfigured?: boolean; accessTokenConfigured?: boolean }
    | null;
  if (!health) fail("[tunnel] 後端 15 秒內沒有啟動，請看上面的錯誤訊息。");
  if (!health.apiKeyConfigured || !health.accessTokenConfigured) {
    fail(
      "[tunnel] backend/.env 還沒設好 ANTHROPIC_API_KEY 或 INSIGHT_ACCESS_TOKEN，先不對外公開。\n" +
        "         請照 backend/.env.example 填好後重跑。",
    );
  }

  // 4. 啟動 ngrok（免費帳號自動用固定的 dev domain）
  const ngrokOutput: string[] = [];
  const ngrok = spawn(ngrokBin, ["http", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(ngrok);
  const collect = (chunk: Buffer) => {
    ngrokOutput.push(chunk.toString());
    if (ngrokOutput.length > 50) ngrokOutput.shift();
  };
  ngrok.stdout?.on("data", collect);
  ngrok.stderr?.on("data", collect);
  ngrok.on("exit", (code) => {
    if (!stopping) {
      fail(`[tunnel] ngrok 結束了（exit ${code}），後端一起關閉。ngrok 最後的輸出：\n${ngrokOutput.join("").slice(-2_000)}`);
    }
  });

  const publicUrl = await poll(30, async () => {
    try {
      return findPublicUrl(await getJson(`${NGROK_AGENT_API}/endpoints`));
    } catch {
      return findPublicUrl(await getJson(`${NGROK_AGENT_API}/tunnels`));
    }
  });
  if (!publicUrl) fail("[tunnel] 30 秒內沒有從 ngrok 拿到公開網址。");

  // 從外面打一次 /health，確認真的連得到（帶 ngrok-skip-browser-warning，跟 app 一樣）
  const reachable = await poll(30, async () => {
    const body = (await getJson(`${publicUrl}/health`, { "ngrok-skip-browser-warning": "1" })) as { ok?: boolean };
    return body.ok === true ? true : null;
  });

  // 5. 對照 app 端設定
  const appUrl = readEnvValue(readText(join(repoRoot, ".env.local")), "EXPO_PUBLIC_INSIGHT_API_URL");
  const appHint =
    appUrl === publicUrl
      ? "app 端 .env.local 的 EXPO_PUBLIC_INSIGHT_API_URL 已經是這個網址 ✓"
      : `app 端請設定（.env.local，以及 APK 用的 EAS 環境變數）：
    EXPO_PUBLIC_INSIGHT_API_URL=${publicUrl}${appUrl ? `\n    （目前 .env.local 是 ${appUrl}）` : ""}
    npx eas-cli env:set --name EXPO_PUBLIC_INSIGHT_API_URL --value ${publicUrl} --environment preview --visibility plaintext`;

  console.log(`
================ AI 解讀後端已對外公開 ================
  公開網址：${publicUrl}
  外部連線檢查：${reachable ? "成功（/health 回 200）" : "失敗：30 秒內從公開網址打不到 /health，請看 ngrok 狀態"}
  請用「手機網路（關掉 Wi-Fi）」開 ${publicUrl}/health ，看到 {"ok":true,...} 就代表外面連得到。
  ${appHint}
  免費 dev domain 每次啟動都是同一個網址，設一次就好。
  按 Ctrl+C 關閉（ngrok 與後端一起關）。
=======================================================
`);
}

main().catch((error: unknown) => fail(`[tunnel] ${String(error)}`));
