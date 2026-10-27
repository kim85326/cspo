#!/usr/bin/env node
// 一鍵發版：EAS 打好的 APK → GitHub Release → 下載頁（docs/index.html）加一筆 → commit + push。
//
// 用法：
//   npm run release -- <EAS build ID> "<這版改了什麼>"
//   例：npm run release -- 71d5a8c3-3e2c-4afa-a375-c3029d03f6e3 "APK 瘦身到 24 MB、加 OTA 更新"
//
// 版本名稱自動取下一號（build 1、build 2 → build 3），GitHub tag 是 v<app 版本>-build<N>。
// 需要：已登入的 gh（gh auth status）與 eas-cli（npx eas-cli whoami）。
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "docs/index.html");
const REPO = "kim85326/cspo";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });
}
function step(msg) {
  console.log(`\n▶ ${msg}`);
}
function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

const [buildId, notes] = process.argv.slice(2);
if (!buildId || !notes) {
  fail('用法：npm run release -- <EAS build ID> "<這版改了什麼>"');
}

step("確認工作目錄乾淨（下載頁要 commit）");
if (run("git", ["status", "--porcelain", "--", "docs/index.html"]).trim()) {
  fail("docs/index.html 有未 commit 的修改，先處理掉再發版。");
}

step(`查 EAS build ${buildId}`);
const build = JSON.parse(run("npx", ["eas-cli", "build:view", buildId, "--json"]));
if (build.status !== "FINISHED") fail(`這個 build 的狀態是 ${build.status}，要等 FINISHED 才能發版。`);
if (build.platform !== "ANDROID") fail(`這個 build 是 ${build.platform}，不是 Android。`);
const apkUrl = build.artifacts?.applicationArchiveUrl ?? build.artifacts?.buildUrl;
if (!apkUrl) fail("找不到 APK 下載網址。");
const appVersion = build.appVersion ?? "1.0.0";
const commit = build.gitCommitHash;

const html = readFileSync(INDEX, "utf8");
const used = [...html.matchAll(/name: "build (\d+)"/g)].map((m) => Number(m[1]));
const n = (used.length ? Math.max(...used) : 0) + 1;
const tag = `v${appVersion}-build${n}`;
const fileName = `zhuanlema-${appVersion}-build${n}.apk`;

step(`下載 APK → ${fileName}`);
const dir = mkdtempSync(path.join(tmpdir(), "cspo-release-"));
const apkPath = path.join(dir, fileName);
run("curl", ["-fsSL", "-o", apkPath, apkUrl]);
const sizeMb = Math.round(statSync(apkPath).size / 1024 / 1024);
console.log(`  ${sizeMb} MB`);

step(`建立 GitHub Release ${tag}（標為最新）`);
const ghArgs = [
  "release", "create", tag, apkPath,
  "--repo", REPO,
  "--title", `賺了嗎 ${appVersion} build ${n}（Android APK）`,
  "--notes", `${notes}\n\nEAS build：${buildId}\n\n其他版本：https://github.com/${REPO}/releases`,
  "--latest",
];
if (commit) ghArgs.push("--target", commit);
run("gh", ghArgs, { stdio: ["ignore", "inherit", "inherit"] });
const releaseUrl = `https://github.com/${REPO}/releases/download/${tag}/${fileName}`;

step("下載頁加上這一版（放在最上面＝最新）");
const today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
const entry = `        {
          name: "build ${n}",
          date: "${today}",
          size: "約 ${sizeMb} MB",
          notes: ${JSON.stringify(notes)},
          url: "${releaseUrl}",
        },
`;
const marker = "      var VERSIONS = [\n";
if (!html.includes(marker)) fail("docs/index.html 裡找不到 VERSIONS 清單。");
writeFileSync(INDEX, html.replace(marker, marker + entry));

step("commit + push 下載頁");
run("git", ["add", "docs/index.html"]);
run("git", ["commit", "-q", "-m", `下載頁加上 build ${n}\n\n${notes}`]);
run("git", ["push", "-q"], { stdio: ["ignore", "inherit", "inherit"] });

console.log(`
✔ 發版完成
  Release：https://github.com/${REPO}/releases/tag/${tag}
  APK：    ${releaseUrl}
  下載頁： https://kim85326.github.io/cspo/  （GitHub Pages 約 1 分鐘後更新，瀏覽器快取最多 10 分鐘）`);
