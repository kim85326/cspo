import { asyncStorageHoldingStore } from "./asyncStorageHoldingStore";
import { claudeHoldingRecognizer } from "./claudeHoldingRecognizer";
import { fakeHoldingRecognizer } from "./fakeHoldingRecognizer";
import { fakePriceSource } from "./fakePriceSource";
import { fakeStockDirectory } from "./fakeStockDirectory";
import type { HoldingRecognizer } from "./HoldingRecognizer";
import type { HoldingStore } from "./HoldingStore";
import type { PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";

export { RecognizeError } from "./HoldingRecognizer";

/** Jest 裡（或設 EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1）用假辨識，結果固定、不打 API。 */
const useFakeRecognizer =
  process.env.JEST_WORKER_ID !== undefined || process.env.EXPO_PUBLIC_USE_FAKE_RECOGNIZER === "1";

/** 全 app 共用的資料來源。換資料源只改這裡。 */
export const priceSource: PriceSource = fakePriceSource;
export const stockDirectory: StockDirectory = fakeStockDirectory;
export const holdingStore: HoldingStore = asyncStorageHoldingStore;
export const holdingRecognizer: HoldingRecognizer = useFakeRecognizer
  ? fakeHoldingRecognizer
  : claudeHoldingRecognizer;
