import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";
import { holdingRecognizer } from "@/data";
import { RecognizeError, type HoldingRecognizer } from "@/data/HoldingRecognizer";
import type { ExtractionResult } from "@/domain/holdingExtract";
import { guessImageMimeType } from "@/domain/imageMimeType";

export type ImportSource = "library" | "camera";

export const IMPORT_MESSAGES = {
  libraryDenied: "沒有相簿權限，請到手機「設定」允許本 app 讀取照片後再試",
  cameraDenied: "沒有相機權限，請到手機「設定」允許本 app 使用相機後再試",
  noImage: "讀不到這張圖片，請換一張再試",
  empty: "截圖裡辨識不到任何持股，請確認是券商 app 的持股畫面，或換一張更清楚的截圖",
  unknown: "辨識失敗，請重試",
} as const;

/** 圖片縮到這個品質再上傳：截圖多半仍清楚，但 base64 小很多 */
const IMAGE_QUALITY = 0.6;

export type ScreenshotImport = {
  /** 正在上傳辨識中 */
  recognizing: boolean;
  /** 最近一次失敗的原因；null 表示沒有錯 */
  error: string | null;
  /** 從相簿選或拍照，然後辨識 */
  importFrom: (source: ImportSource) => Promise<void>;
  /** 用上一次的來源再做一次 */
  retry: () => Promise<void>;
  dismissError: () => void;
};

/**
 * 「從截圖匯入」的流程：要權限 → 選圖／拍照 → 送辨識 → 把結果交給 onRecognized。
 * 選圖與辨識的細節都在這裡，畫面只要處理「結果怎麼套進欄位」。
 * 辨識失敗只設 error，不動畫面上已填的內容。
 */
export function useScreenshotImport(
  onRecognized: (result: ExtractionResult) => void,
  recognizer: HoldingRecognizer = holdingRecognizer,
): ScreenshotImport {
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSource = useRef<ImportSource | null>(null);
  const busy = useRef(false);

  const importFrom = useCallback(
    async (source: ImportSource) => {
      if (busy.current) return;
      busy.current = true;
      lastSource.current = source;
      setError(null);
      try {
        const asset = await pickImage(source);
        if (!asset) return; // 使用者取消
        if (!asset.base64) {
          setError(IMPORT_MESSAGES.noImage);
          return;
        }
        setRecognizing(true);
        const result = await recognizer.recognize(asset.base64, guessImageMimeType(asset));
        if (result.holdings.length === 0) {
          setError([IMPORT_MESSAGES.empty, ...result.warnings].join("\n"));
          return;
        }
        onRecognized(result);
      } catch (e) {
        setError(e instanceof RecognizeError || e instanceof PermissionDeniedError ? e.message : IMPORT_MESSAGES.unknown);
      } finally {
        setRecognizing(false);
        busy.current = false;
      }
    },
    [onRecognized, recognizer],
  );

  const retry = useCallback(async () => {
    if (lastSource.current) await importFrom(lastSource.current);
  }, [importFrom]);

  const dismissError = useCallback(() => setError(null), []);

  return { recognizing, error, importFrom, retry, dismissError };
}

class PermissionDeniedError extends Error {}

/** 要權限並開相簿或相機；取消回 null、沒權限丟 PermissionDeniedError */
async function pickImage(source: ImportSource): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    base64: true,
    quality: IMAGE_QUALITY,
    allowsEditing: false,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PermissionDeniedError(IMPORT_MESSAGES.cameraDenied);
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new PermissionDeniedError(IMPORT_MESSAGES.libraryDenied);
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled) return null;
  return result.assets[0] ?? null;
}
