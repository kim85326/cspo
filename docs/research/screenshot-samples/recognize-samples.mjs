// 把這個資料夾的模擬截圖逐張 POST 到 /recognize，印出結果。研究用，不是 app 的一部分。
//
// 用法（先在專案根目錄建立 .env 放 ANTHROPIC_API_KEY，再 npx expo start）：
//   node docs/research/screenshot-samples/recognize-samples.mjs                 # 打 http://localhost:8081/recognize
//   node docs/research/screenshot-samples/recognize-samples.mjs --url https://xxx.expo.app/recognize
//   node docs/research/screenshot-samples/recognize-samples.mjs --mislabel      # JPEG 標成 image/png，重現手機上傳的 mimeType 問題
//
// 每打一張就會花一次 Claude API 的錢（約 US$0.03～0.06，見 ../screenshot-import.md 第 4 節）。
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const url = urlIndex >= 0 ? args[urlIndex + 1] : "http://localhost:8081/recognize";
const mislabel = args.includes("--mislabel");

const files = mislabel
  ? ["01-lots-cost.q60.jpg"]
  : (await readdir(here)).filter((f) => f.endsWith(".png")).sort();

for (const file of files) {
  const imageBase64 = (await readFile(join(here, file))).toString("base64");
  const mimeType = mislabel || file.endsWith(".png") ? "image/png" : "image/jpeg";
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  const body = await response.text();
  console.log(`\n== ${file}（${mimeType}，${Math.round(imageBase64.length / 1024)} KB base64）→ ${response.status}，${Date.now() - started} ms`);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
}
