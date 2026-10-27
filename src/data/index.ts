import { asyncStorageHoldingStore } from "./asyncStorageHoldingStore";
import { claudeHoldingRecognizer } from "./claudeHoldingRecognizer";
import { fakeHoldingRecognizer } from "./fakeHoldingRecognizer";
import { fakePriceSource } from "./fakePriceSource";
import { fakeStockDirectory } from "./fakeStockDirectory";
import type { HoldingRecognizer } from "./HoldingRecognizer";
import type { HoldingStore } from "./HoldingStore";
import type { PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";
import { twseSource } from "./twseSource";

export { RecognizeError } from "./HoldingRecognizer";

/** Jest 裡（或設 EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1）用假辨識，結果固定、不打 API。 */
const useFakeRecognizer =
  process.env.JEST_WORKER_ID !== undefined || process.env.EXPO_PUBLIC_USE_FAKE_RECOGNIZER === "1";

/**
 * 全 app 共用的資料來源。換資料源只改這裡。
 *
 * - Jest（JEST_WORKER_ID 存在）或 EXPO_PUBLIC_USE_FAKE_PRICES=1：用 stocks.ts 的固定假價，結果可重現。
 * - 其他情況：證交所前一交易日收盤價（twseSource）。
 *
 * EXPO_PUBLIC_ 變數會在打包時被 Expo CLI 直接換成字串，所以必須整個寫死 `process.env.EXPO_PUBLIC_…`，
 * 不能用變數或解構拿。切法見 docs/architecture.md 第 7 節。
 */
const useFakeSources =
  process.env.JEST_WORKER_ID !== undefined || process.env.EXPO_PUBLIC_USE_FAKE_PRICES === "1";

export const priceSource: PriceSource = useFakeSources ? fakePriceSource : twseSource;
export const stockDirectory: StockDirectory = useFakeSources ? fakeStockDirectory : twseSource;
export const holdingStore: HoldingStore = asyncStorageHoldingStore;
export const holdingRecognizer: HoldingRecognizer = useFakeRecognizer
  ? fakeHoldingRecognizer
  : claudeHoldingRecognizer;

export { PriceLoadError } from "./PriceSource";
