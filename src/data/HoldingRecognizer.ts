import type { ExtractionResult } from "@/domain/holdingExtract";

/**
 * 持股截圖辨識：給一張券商 app 的持股截圖，回每一檔的股票、成本價、數量。
 * 辨識結果是「原始字串」，對到股票清單與換算單位在 src/domain/holdingExtract.ts。
 */
export interface HoldingRecognizer {
  /**
   * @param imageBase64 圖片內容（base64，不含 data: 前綴）
   * @param mimeType image/jpeg、image/png 等，只是提示（見 src/domain/imageMimeType.ts）；不知道就給 undefined
   * @throws RecognizeError 網路不通、後端沒開或沒設定 API key、辨識服務出錯
   */
  recognize(imageBase64: string, mimeType: string | undefined): Promise<ExtractionResult>;
}

/** 辨識失敗：message 是可以直接給使用者看的中文 */
export class RecognizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecognizeError";
  }
}
