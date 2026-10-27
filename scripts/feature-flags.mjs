#!/usr/bin/env node
// 遠端切換功能開關（Story 026）。改的是 GitHub 上 feature-flags 分支的 feature-flags.json，
// 已經裝好的 APK 不用重打、也不用發 OTA。用已經登入的 gh（gh auth status）寫入，不碰 iteration-1。
//
// 用法：
//   npm run flags -- list
//   npm run flags -- set aiInsight on|off
//   npm run flags -- set aiInsight on --dry-run   # 只印出會寫什麼，不動遠端
//
// 生效時間：raw.githubusercontent.com 的 CDN 快取最多 5 分鐘；之後同學把 app 切到背景再切回來（或重開）就會套用。
// 開關只控制畫面看不看得到，不是保護：repo 是公開的，任何人都能讀這份 JSON。
import { execFileSync } from "node:child_process";

const REPO = "kim85326/cspo";
const BRANCH = "feature-flags";
const FILE = "feature-flags.json";
// 要和 src/config/features.ts 的 FEATURE_NAMES 一致（src/config/features.test.ts 會比對）
const FEATURE_NAMES = ["screenshotImport", "aiInsight", "proPlan"];

const USAGE = `用法：
  npm run flags -- list
  npm run flags -- set <名稱> on|off [--dry-run]
認得的名稱：${FEATURE_NAMES.join("、")}`;

function gh(args, input) {
  return execFileSync("gh", ["api", ...args], {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

function isNotFound(error) {
  return /HTTP 404|Not Found/.test(String(error.stderr ?? error.message));
}

/** 讀遠端目前的內容。分支或檔案還沒建立回 null。 */
function readRemote() {
  try {
    const file = JSON.parse(gh([`repos/${REPO}/contents/${FILE}?ref=${BRANCH}`]));
    return { flags: JSON.parse(Buffer.from(file.content, "base64").toString("utf8")), sha: file.sha };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function branchExists() {
  try {
    gh([`repos/${REPO}/branches/${BRANCH}`]);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** 分支不存在時建立一個只有 feature-flags.json 的獨立分支（沒有父 commit，不帶任何程式碼）。 */
function createBranch(content, message) {
  const blob = JSON.parse(gh(["-X", "POST", `repos/${REPO}/git/blobs`, "--input", "-"], JSON.stringify({ content, encoding: "utf-8" })));
  const tree = JSON.parse(
    gh(["-X", "POST", `repos/${REPO}/git/trees`, "--input", "-"], JSON.stringify({ tree: [{ path: FILE, mode: "100644", type: "blob", sha: blob.sha }] })),
  );
  const commit = JSON.parse(
    gh(["-X", "POST", `repos/${REPO}/git/commits`, "--input", "-"], JSON.stringify({ message, tree: tree.sha, parents: [] })),
  );
  gh(["-X", "POST", `repos/${REPO}/git/refs`, "--input", "-"], JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }));
}

function list() {
  const remote = readRemote();
  if (!remote) {
    console.log(`遠端還沒有 ${BRANCH} 分支的 ${FILE}：全部用 APK 打包時的預設（目前都是關）。`);
    console.log("第一次 npm run flags -- set 會自動建立。");
    return;
  }
  console.log(`遠端設定（${REPO} 的 ${BRANCH} 分支）：`);
  for (const name of FEATURE_NAMES) {
    const value = remote.flags[name];
    const text = value === true ? "on" : value === false ? "off" : "（未設定，用 APK 預設）";
    console.log(`  ${name.padEnd(18)} ${text}`);
  }
  const unknown = Object.keys(remote.flags).filter((key) => !FEATURE_NAMES.includes(key));
  if (unknown.length) console.log(`  app 不認得、會忽略的欄位：${unknown.join("、")}`);
}

function set(name, state, dryRun) {
  if (!FEATURE_NAMES.includes(name) || !["on", "off"].includes(state)) {
    console.error(USAGE);
    process.exit(1);
  }
  const remote = readRemote();
  const flags = {};
  // 只保留認得的開關，順序固定，diff 好讀
  for (const key of FEATURE_NAMES) {
    if (typeof remote?.flags[key] === "boolean") flags[key] = remote.flags[key];
  }
  flags[name] = state === "on";
  const content = `${JSON.stringify(flags, null, 2)}\n`;
  const message = `feature-flags: ${name} ${state}`;

  if (dryRun) {
    console.log(`（--dry-run，不會寫入）會寫到 ${REPO} 的 ${BRANCH} 分支 ${FILE}：\n${content}`);
    return;
  }

  if (remote) {
    gh(
      ["-X", "PUT", `repos/${REPO}/contents/${FILE}`, "--input", "-"],
      JSON.stringify({ message, content: Buffer.from(content).toString("base64"), sha: remote.sha, branch: BRANCH }),
    );
  } else if (branchExists()) {
    gh(
      ["-X", "PUT", `repos/${REPO}/contents/${FILE}`, "--input", "-"],
      JSON.stringify({ message, content: Buffer.from(content).toString("base64"), branch: BRANCH }),
    );
  } else {
    createBranch(content, message);
  }
  console.log(`✓ ${name} → ${state}（${REPO} 的 ${BRANCH} 分支）`);
  console.log("raw.githubusercontent.com 的 CDN 快取最多 5 分鐘；之後同學把 app 切到背景再切回來就會套用。");
}

const [command, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
const args = rest.filter((arg) => arg !== "--dry-run");
try {
  if (command === "list") list();
  else if (command === "set" && args.length === 2) set(args[0], args[1], dryRun);
  else {
    console.error(USAGE);
    process.exit(1);
  }
} catch (error) {
  console.error(`✖ ${String(error.stderr || error.message).trim()}`);
  console.error("確認 gh 已登入（gh auth status），而且帳號有 kim85326/cspo 的寫入權限。");
  process.exit(1);
}
