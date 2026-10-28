// 這個測試用 node:fs 讀 scripts/feature-flags.mjs；app 的 tsconfig 只載入 jest 的型別
/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { FEATURE_NAMES, parseFlags, resolveFeatures, type Features } from "./features";

const OFF: Features = { screenshotImport: false, aiInsight: false, proPlan: false };

describe("parseFlags（對應 docs/stories/033）", () => {
  test("只留下認得的名稱、值是 true／false 的開關", () => {
    expect(
      parseFlags({ aiInsight: true, proPlan: false, screenshotImport: "true", unknownFlag: true, updatedAt: "2026-10-27" }),
    ).toEqual({ aiInsight: true, proPlan: false });
  });

  test("1／0、null 這類不是 boolean 的值一律忽略", () => {
    expect(parseFlags({ aiInsight: 1, proPlan: 0, screenshotImport: null })).toEqual({});
  });

  test("整份不是物件：回 null", () => {
    for (const json of [null, undefined, "on", 42, true, [{ aiInsight: true }]]) {
      expect(parseFlags(json)).toBeNull();
    }
  });
});

describe("resolveFeatures 優先順序：開發時 .env.local > 遠端 > 上次存的 > 打包預設", () => {
  const defaults: Features = { ...OFF, screenshotImport: true };

  test("什麼都沒有：用打包預設", () => {
    expect(resolveFeatures({ defaults, overrides: {} })).toEqual(defaults);
  });

  test("有存過、這次沒抓到：用存的，沒寫到的用預設", () => {
    expect(resolveFeatures({ stored: { aiInsight: true }, remote: null, defaults, overrides: {} })).toEqual({
      ...defaults,
      aiInsight: true,
    });
  });

  test("抓到遠端：整份取代存的值，遠端沒寫到的回到預設", () => {
    expect(
      resolveFeatures({ remote: { proPlan: true }, stored: { aiInsight: true }, defaults, overrides: {} }),
    ).toEqual({ ...defaults, proPlan: true });
  });

  test("遠端可以把預設開著的關掉", () => {
    expect(resolveFeatures({ remote: { screenshotImport: false }, defaults, overrides: {} }).screenshotImport).toBe(false);
  });

  test("開發時 .env.local 明確設的值蓋過遠端", () => {
    expect(
      resolveFeatures({ remote: { aiInsight: true, proPlan: true }, defaults, overrides: { aiInsight: false } }),
    ).toEqual({ ...defaults, aiInsight: false, proPlan: true });
  });
});

test("scripts/feature-flags.mjs 認得的開關名稱和 app 一致", () => {
  const script = readFileSync(path.join(__dirname, "../../scripts/feature-flags.mjs"), "utf8");
  const match = script.match(/const FEATURE_NAMES = \[([^\]]*)\]/);
  expect(match).not.toBeNull();
  const names = [...match![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  expect(names).toEqual([...FEATURE_NAMES]);
});
