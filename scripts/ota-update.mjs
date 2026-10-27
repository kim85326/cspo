#!/usr/bin/env node
// 只改了 JS／畫面／文案時，不用重打 APK：發一個 OTA 更新給已安裝 APK 的手機。
//
// 用法：
//   npm run ota -- "<這次改了什麼>"
//
// 會先用 fingerprint 比對「最新的 preview APK」：原生部分沒變才發 OTA；變了就停下來，請你重打 APK。
// 同學收到更新的方式：把 app 從最近使用清單滑掉再打開，第二次打開就是新版。
// 「說明」會寫進這次的 bundle（EXPO_PUBLIC_OTA_MESSAGE），app 底部的版本資訊點開就看得到（Story 018）。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const message = process.argv.slice(2).join(" ").trim();
if (!message) {
  console.error('用法：npm run ota -- "<這次改了什麼>"');
  process.exit(1);
}

// EXPO_PUBLIC_* 會在發佈當下被寫進 bundle：本機開著假價或開發中的功能開關，就會一起發出去。
const envLocal = path.join(ROOT, ".env.local");
if (existsSync(envLocal)) {
  const risky = readFileSync(envLocal, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^EXPO_PUBLIC_\w+=\s*1\s*$/.test(l));
  if (risky.length) {
    console.error(`✖ .env.local 有這些設定，會被一起發給所有人：\n  ${risky.join("\n  ")}\n先註解掉再發 OTA。`);
    process.exit(1);
  }
}

const run = (args, inherit = false, env = process.env) =>
  execFileSync("npx", ["eas-cli", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env,
    stdio: inherit ? "inherit" : ["ignore", "pipe", "inherit"],
  });

console.log("▶ 找最新的 preview APK");
const builds = JSON.parse(
  run(["build:list", "--platform", "android", "--build-profile", "preview", "--status", "finished", "--limit", "1", "--json", "--non-interactive"]),
);
const latest = builds[0];
if (!latest) {
  console.error("✖ 找不到已完成的 preview APK，先打一次 APK。");
  process.exit(1);
}

console.log(`▶ 比對原生部分（fingerprint）與 build ${latest.id}`);
let same = false;
try {
  // 輸出寫在 stderr 與 stdout 都有可能，合併後判斷；不同時會出現「... differs from fingerprint ...」
  const out = execFileSync(
    "npx",
    ["eas-cli", "fingerprint:compare", "--build-id", latest.id, "--environment", "preview", "--non-interactive"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  same = /Computed project fingerprint/i.test(out) ? !/differs/i.test(out) : false;
  if (!same) console.log(out);
} catch (e) {
  console.error("✖ fingerprint 比對失敗，不確定能不能 OTA，請改打 APK。");
  process.exit(1);
}
if (!same) {
  console.error("✖ 原生部分和手機上的 APK 不同（加了原生套件、改了 app.json 原生欄位等），OTA 送不過去，請重打 APK：");
  console.error("  npx eas-cli build -p android --profile preview");
  process.exit(1);
}

console.log("▶ 發佈 OTA 更新");
// eas update 在本機打包 JS，EXPO_PUBLIC_* 會在這時被換成字串；app 讀 process.env.EXPO_PUBLIC_OTA_MESSAGE 顯示說明
run(
  ["update", "--channel", "preview", "--environment", "preview", "-p", "android", "-m", message, "--non-interactive"],
  true,
  { ...process.env, EXPO_PUBLIC_OTA_MESSAGE: message },
);
console.log("\n✔ 已發佈。請同學把 app 從最近使用清單滑掉再打開，第二次打開就是新版。");
