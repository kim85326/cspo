import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEIC_MESSAGE,
  InvalidRecognizeRequest,
  parseRecognizeRequest,
  sniffImageType,
  UNSUPPORTED_FORMAT_MESSAGE,
} from "./recognizeRequest.ts";
import { fakeImageBase64, IMAGE_HEADERS } from "./testHelpers.ts";

const MAX = 1024;

function rejects(raw: unknown, status: number, message?: string | RegExp) {
  assert.throws(
    () => parseRecognizeRequest(raw, MAX),
    (error: unknown) => {
      assert.ok(error instanceof InvalidRecognizeRequest);
      assert.equal(error.status, status);
      if (typeof message === "string") assert.equal(error.message, message);
      else if (message) assert.match(error.message, message);
      return true;
    },
  );
}

describe("sniffImageType", () => {
  it("recognises each supported format from its header", () => {
    assert.equal(sniffImageType(Uint8Array.from(IMAGE_HEADERS.jpeg)), "image/jpeg");
    assert.equal(sniffImageType(Uint8Array.from(IMAGE_HEADERS.png)), "image/png");
    assert.equal(sniffImageType(Uint8Array.from(IMAGE_HEADERS.gif)), "image/gif");
    assert.equal(sniffImageType(Uint8Array.from(IMAGE_HEADERS.webp)), "image/webp");
    assert.equal(sniffImageType(Uint8Array.from(IMAGE_HEADERS.heic)), "image/heic");
  });

  it("returns null for non-images and truncated data", () => {
    assert.equal(sniffImageType(Uint8Array.from(IMAGE_HEADERS.pdf)), null);
    assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8])), null);
    assert.equal(sniffImageType(new Uint8Array()), null);
  });
});

describe("parseRecognizeRequest", () => {
  it("uses the type from the file content, not the declared mimeType (picker sends JPEG labelled image/png)", () => {
    const input = parseRecognizeRequest({ imageBase64: fakeImageBase64("jpeg"), mimeType: "image/png" }, MAX);
    assert.equal(input.mediaType, "image/jpeg");
  });

  it("accepts a missing mimeType and a HEIC label when the content is a real JPEG", () => {
    assert.equal(parseRecognizeRequest({ imageBase64: fakeImageBase64("png") }, MAX).mediaType, "image/png");
    assert.equal(
      parseRecognizeRequest({ imageBase64: fakeImageBase64("jpeg"), mimeType: "image/heic" }, MAX).mediaType,
      "image/jpeg",
    );
    assert.equal(
      parseRecognizeRequest({ imageBase64: fakeImageBase64("webp"), mimeType: null }, MAX).mediaType,
      "image/webp",
    );
  });

  it("strips a data: prefix and whitespace", () => {
    const base64 = fakeImageBase64("png");
    const input = parseRecognizeRequest({ imageBase64: `data:image/png;base64,${base64.slice(0, 10)}\n${base64.slice(10)}` }, MAX);
    assert.equal(input.imageBase64, base64);
  });

  it("rejects declared types that are not images with 415", () => {
    rejects({ imageBase64: fakeImageBase64("png"), mimeType: "application/pdf" }, 415, UNSUPPORTED_FORMAT_MESSAGE);
    rejects({ imageBase64: fakeImageBase64("png"), mimeType: "image/svg+xml" }, 415);
    rejects({ imageBase64: fakeImageBase64("png"), mimeType: 42 }, 415);
  });

  it("rejects content that is not a supported image with 415, and real HEIC with its own message", () => {
    rejects({ imageBase64: fakeImageBase64("pdf"), mimeType: "image/png" }, 415, UNSUPPORTED_FORMAT_MESSAGE);
    rejects({ imageBase64: fakeImageBase64("heic"), mimeType: "image/heic" }, 415, HEIC_MESSAGE);
  });

  it("rejects images over the size limit with 413", () => {
    rejects({ imageBase64: fakeImageBase64("png", MAX + 1) }, 413, /上限/);
    assert.doesNotThrow(() => parseRecognizeRequest({ imageBase64: fakeImageBase64("png", MAX) }, MAX));
  });

  it("rejects missing or invalid base64 with 400", () => {
    rejects(null, 400);
    rejects({}, 400, "缺少圖片內容");
    rejects({ imageBase64: "   " }, 400, "缺少圖片內容");
    rejects({ imageBase64: "not base64!!" }, 400, /base64/);
  });
});
