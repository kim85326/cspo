/**
 * 截圖匯入：猜上傳圖片的 mimeType。
 *
 * expo-image-picker 的 asset.mimeType 不可靠（docs/research/screenshot-import.md §1.4）：
 * quality < 1 時 Android／iOS 回來的 base64 一律是 JPEG，mimeType 卻是原檔的 image/png 或 image/heic，
 * 有時還是 undefined。所以依序看：檔案內容（base64 開頭）→ 副檔名 → picker 給的值。
 *
 * 這只是給後端的提示；後端（backend/src/recognizeRequest.ts）一律再看檔頭決定，不信任這個值。
 * 都猜不到就回 undefined，讓後端自己判斷。
 */

export type ImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/heic";

/** base64 開頭 → 格式。JPEG FF D8 FF、PNG 89 50 4E 47、GIF "GIF8"、WebP "RIFF" */
const BASE64_PREFIXES: [string, ImageMimeType][] = [
  ["/9j/", "image/jpeg"],
  ["iVBORw0KGgo", "image/png"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
];

/** HEIC 的檔頭是 [4 bytes 長度]"ftyp"+品牌；base64 第 8～16 字元剛好對到第 6～12 byte（"yp"+品牌） */
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];
const HEIC_BASE64 = new Set(HEIC_BRANDS.map((brand) => btoa(`yp${brand}`)));

const EXTENSIONS: Record<string, ImageMimeType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
};

export function mimeTypeFromBase64(base64: string): ImageMimeType | undefined {
  const data = base64.replace(/^data:[^,]*,/, "");
  const hit = BASE64_PREFIXES.find(([prefix]) => data.startsWith(prefix));
  if (hit) return hit[1];
  if (HEIC_BASE64.has(data.slice(8, 16))) return "image/heic";
  return undefined;
}

export function mimeTypeFromFileName(name: string | null | undefined): ImageMimeType | undefined {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(name ?? "");
  return match ? EXTENSIONS[match[1].toLowerCase()] : undefined;
}

export function guessImageMimeType(asset: {
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  uri?: string | null;
}): string | undefined {
  return (
    (asset.base64 ? mimeTypeFromBase64(asset.base64) : undefined) ??
    mimeTypeFromFileName(asset.fileName) ??
    mimeTypeFromFileName(asset.uri) ??
    (asset.mimeType?.startsWith("image/") ? asset.mimeType : undefined)
  );
}
