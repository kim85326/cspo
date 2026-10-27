import { guessImageMimeType, mimeTypeFromBase64, mimeTypeFromFileName } from "./imageMimeType";

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC = b64([0, 0, 0, 0x18, ...[..."ftypheic"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);

describe("mimeTypeFromBase64", () => {
  test("看檔頭認出 JPEG、PNG、GIF、WebP、HEIC", () => {
    expect(mimeTypeFromBase64(JPEG)).toBe("image/jpeg");
    expect(mimeTypeFromBase64(PNG)).toBe("image/png");
    expect(mimeTypeFromBase64(btoa("GIF89a"))).toBe("image/gif");
    expect(mimeTypeFromBase64(btoa("RIFF\0\0\0\0WEBP"))).toBe("image/webp");
    expect(mimeTypeFromBase64(HEIC)).toBe("image/heic");
  });

  test("容許 data: 前綴；認不出來回 undefined", () => {
    expect(mimeTypeFromBase64(`data:image/png;base64,${JPEG}`)).toBe("image/jpeg");
    expect(mimeTypeFromBase64(btoa("%PDF-1.7"))).toBeUndefined();
  });
});

describe("mimeTypeFromFileName", () => {
  test("看副檔名（不分大小寫，忽略 query string）", () => {
    expect(mimeTypeFromFileName("Screenshot_2026.PNG")).toBe("image/png");
    expect(mimeTypeFromFileName("file:///cache/IMG_0001.HEIC")).toBe("image/heic");
    expect(mimeTypeFromFileName("https://x/y.jpeg?w=1")).toBe("image/jpeg");
    expect(mimeTypeFromFileName("noext")).toBeUndefined();
    expect(mimeTypeFromFileName(undefined)).toBeUndefined();
  });
});

describe("guessImageMimeType", () => {
  test("picker 壓成 JPEG 但 mimeType 寫 image/png：以檔案內容為準", () => {
    expect(guessImageMimeType({ base64: JPEG, mimeType: "image/png", fileName: "shot.png" })).toBe("image/jpeg");
  });

  test("HEIC 原檔壓成 JPEG：以檔案內容為準", () => {
    expect(guessImageMimeType({ base64: JPEG, mimeType: "image/heic", uri: "file:///IMG_1.heic" })).toBe("image/jpeg");
  });

  test("內容認不出來時看副檔名，再看 picker 的 mimeType", () => {
    expect(guessImageMimeType({ base64: "AAAA", mimeType: undefined, fileName: "a.webp" })).toBe("image/webp");
    expect(guessImageMimeType({ base64: "AAAA", uri: "content://media/42", mimeType: "image/png" })).toBe("image/png");
  });

  test("都猜不到就回 undefined，交給後端判斷", () => {
    expect(guessImageMimeType({ base64: "AAAA", uri: "content://media/42" })).toBeUndefined();
    expect(guessImageMimeType({ base64: "AAAA", mimeType: "application/octet-stream" })).toBeUndefined();
  });
});
