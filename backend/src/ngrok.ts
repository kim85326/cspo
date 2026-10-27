import { homedir } from "node:os";
import { join } from "node:path";

/**
 * npm run backend:tunnel 用到的 ngrok 小工具（純函式，方便測試）。
 * 依 ngrok 官方文件：
 * - 安裝 brew install ngrok；設定 ngrok config add-authtoken <token>（要先有 ngrok 帳號）
 * - ngrok http <port> 會用帳號的免費 dev domain（自動指派、固定不變）
 * - 本機 agent API：http://127.0.0.1:4040/api/endpoints（欄位 url），舊版 /api/tunnels（欄位 public_url）
 * - 設定檔：macOS ~/Library/Application Support/ngrok/ngrok.yml、Linux ~/.config/ngrok/ngrok.yml
 */

export const NGROK_AGENT_API = "http://127.0.0.1:4040/api";

export function ngrokConfigPath(platform: string = process.platform, home: string = homedir()): string {
  return platform === "darwin"
    ? join(home, "Library", "Application Support", "ngrok", "ngrok.yml")
    : join(home, ".config", "ngrok", "ngrok.yml");
}

/** 有沒有設 authtoken：環境變數 NGROK_AUTHTOKEN，或設定檔裡有 authtoken:（v2 在最外層、v3 在 agent: 底下） */
export function hasAuthtoken(configText: string | null, env: Record<string, string | undefined>): boolean {
  if (env.NGROK_AUTHTOKEN && env.NGROK_AUTHTOKEN.trim() !== "") return true;
  return configText !== null && /^\s*authtoken:\s*\S+/m.test(configText);
}

/** 從 agent API 的回應找公開網址；https 優先 */
export function findPublicUrl(body: unknown): string | null {
  const value = body as { endpoints?: { url?: unknown }[]; tunnels?: { public_url?: unknown }[] } | null;
  const urls = [
    ...(value?.endpoints ?? []).map((e) => e.url),
    ...(value?.tunnels ?? []).map((t) => t.public_url),
  ].filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  return urls.find((u) => u.startsWith("https://")) ?? urls[0] ?? null;
}

/** 讀 .env.local 這種 KEY=VALUE 檔裡某個變數的值；沒有就 null */
export function readEnvValue(text: string | null, key: string): string | null {
  if (text === null) return null;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && match[1] === key) return match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return null;
}

export const INSTALL_STEPS = `沒有找到 ngrok。請自己做下面三步（只要做一次），再重跑 npm run backend:tunnel：

  1. 註冊免費 ngrok 帳號：https://dashboard.ngrok.com/signup
  2. 安裝：brew install ngrok
  3. 在 ngrok dashboard 的「Your Authtoken」頁複製 token，然後執行：
       ngrok config add-authtoken <你的 token>

  免費方案會給這個帳號一個固定的網址（xxxx.ngrok-free.app 之類），之後每次啟動都是同一個。`;

export const AUTHTOKEN_STEPS = `ngrok 已安裝，但還沒設定 authtoken。請自己做（只要做一次）：

  1. 登入 https://dashboard.ngrok.com ，在「Your Authtoken」頁複製 token
  2. 執行：ngrok config add-authtoken <你的 token>

  然後重跑 npm run backend:tunnel。`;
