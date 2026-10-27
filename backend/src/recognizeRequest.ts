/**
 * POST /recognize 的請求驗證：app 送 { imageBase64, mimeType? }。
 *
 * 圖片格式**看檔案內容（魔術位元組）決定，不信任 app 給的 mimeType**：
 * expo-image-picker 在 quality < 1 時，Android 與 iOS 的 base64 一律是 JPEG，
 * mimeType 卻是原檔的 image/png；有時還會拿不到（undefined）或是 image/heic。
 * 詳見 docs/research/screenshot-import.md §1.4。
 *
 * app 給的 mimeType 只用來提早擋掉明顯不是圖片的東西（例如 PDF、SVG）。
 */

/** Claude vision 收得下的格式；送給 Claude 的 media_type 一定是其中之一 */
export type ClaudeImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type RecognizeInput = {
  imageBase64: string;
  /** 依檔案內容判斷出來的真實格式 */
  mediaType: ClaudeImageType;
};

/** 驗證失敗：message 可直接給使用者看 */
export class InvalidRecognizeRequest extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "InvalidRecognizeRequest";
    this.status = status;
  }
}

/** app 可以宣告的格式（含 HEIC：相簿原檔常見，實際上傳的內容多半已被壓成 JPEG） */
const ACCEPTED_DECLARED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const UNSUPPORTED_FORMAT_MESSAGE = "不支援這種圖片格式，請用 JPEG、PNG 或 WebP 的截圖";
export const HEIC_MESSAGE = "HEIC 照片無法辨識，請改用手機的螢幕截圖（PNG 或 JPEG）";

export function parseRecognizeRequest(raw: unknown, maxImageBytes: number): RecognizeInput {
  if (!raw || typeof raw !== "object") throw new InvalidRecognizeRequest("請求格式錯誤");
  const { imageBase64, mimeType } = raw as Record<string, unknown>;
  if (typeof imageBase64 !== "string" || imageBase64.trim() === "") {
    throw new InvalidRecognizeRequest("缺少圖片內容");
  }
  if (mimeType !== undefined && mimeType !== null) {
    const declared = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
    if (!ACCEPTED_DECLARED_TYPES.has(declared)) {
      throw new InvalidRecognizeRequest(UNSUPPORTED_FORMAT_MESSAGE, 415);
    }
  }

  // 容許 data: 前綴與換行；其他非 base64 字元一律拒絕
  const cleaned = imageBase64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new InvalidRecognizeRequest("圖片內容不是有效的 base64");
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length > maxImageBytes) {
    const mb = (maxImageBytes / 1024 / 1024).toFixed(0);
    throw new InvalidRecognizeRequest(`圖片太大（上限 ${mb} MB），請裁切後再試`, 413);
  }

  const sniffed = sniffImageType(bytes);
  if (sniffed === "image/heic") throw new InvalidRecognizeRequest(HEIC_MESSAGE, 415);
  if (sniffed === null) throw new InvalidRecognizeRequest(UNSUPPORTED_FORMAT_MESSAGE, 415);
  return { imageBase64: cleaned, mediaType: sniffed };
}

/** 看檔頭判斷圖片格式；認不出來回 null */
export function sniffImageType(bytes: Uint8Array): ClaudeImageType | "image/heic" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // ISO BMFF：第 4～8 byte 是 ftyp，接著的品牌代表 HEIC／HEIF
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) {
    return "image/heic";
  }
  return null;
}
