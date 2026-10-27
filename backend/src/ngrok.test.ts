import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPublicUrl, hasAuthtoken, ngrokConfigPath, readEnvValue } from "./ngrok.ts";

describe("ngrokConfigPath", () => {
  it("uses the documented default locations", () => {
    assert.equal(ngrokConfigPath("darwin", "/Users/a"), "/Users/a/Library/Application Support/ngrok/ngrok.yml");
    assert.equal(ngrokConfigPath("linux", "/home/a"), "/home/a/.config/ngrok/ngrok.yml");
  });
});

describe("hasAuthtoken", () => {
  it("finds the token in a v3 (agent:) or v2 config file, or in NGROK_AUTHTOKEN", () => {
    assert.equal(hasAuthtoken('version: "3"\nagent:\n  authtoken: abc123\n', {}), true);
    assert.equal(hasAuthtoken('version: "2"\nauthtoken: abc123\n', {}), true);
    assert.equal(hasAuthtoken(null, { NGROK_AUTHTOKEN: "abc" }), true);
  });

  it("reports missing when there is no file or the token is empty", () => {
    assert.equal(hasAuthtoken(null, {}), false);
    assert.equal(hasAuthtoken('version: "3"\nagent:\n  authtoken:\n', {}), false);
  });
});

describe("findPublicUrl", () => {
  it("reads url from /api/endpoints and public_url from /api/tunnels, preferring https", () => {
    assert.equal(findPublicUrl({ endpoints: [{ url: "https://abc.ngrok-free.app" }] }), "https://abc.ngrok-free.app");
    assert.equal(
      findPublicUrl({ tunnels: [{ public_url: "http://abc.ngrok-free.app" }, { public_url: "https://abc.ngrok-free.app" }] }),
      "https://abc.ngrok-free.app",
    );
    assert.equal(findPublicUrl({ endpoints: [] }), null);
    assert.equal(findPublicUrl(null), null);
  });
});

describe("readEnvValue", () => {
  it("reads a value from a .env style file", () => {
    const text = "# 註解\nEXPO_PUBLIC_FEATURE_AI_INSIGHT=1\nEXPO_PUBLIC_INSIGHT_API_URL=\"https://abc.ngrok-free.app\"\n";
    assert.equal(readEnvValue(text, "EXPO_PUBLIC_INSIGHT_API_URL"), "https://abc.ngrok-free.app");
    assert.equal(readEnvValue(text, "MISSING"), null);
    assert.equal(readEnvValue(null, "X"), null);
  });
});
