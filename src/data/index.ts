import { asyncStorageHoldingStore } from "./asyncStorageHoldingStore";
import type { CandleSource } from "./CandleSource";
import { fakeCandleSource } from "./fakeCandleSource";
import { twseCandleSource } from "./twseCandleSource";
import { claudeHoldingRecognizer } from "./claudeHoldingRecognizer";
import { fakeHoldingRecognizer } from "./fakeHoldingRecognizer";
import { fakePriceSource } from "./fakePriceSource";
import { fakeStockDirectory } from "./fakeStockDirectory";
import type { HoldingRecognizer } from "./HoldingRecognizer";
import type { HoldingStore } from "./HoldingStore";
import { createMarketSource } from "./marketSource";
import type { PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";
import { tpexSource } from "./tpexSource";
import { twseSource } from "./twseSource";

export { RecognizeError } from "./HoldingRecognizer";

/** Jest 裡（或設 EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1）用假辨識，結果固定、不打 API。 */
const useFakeRecognizer =
  process.env.JEST_WORKER_ID !== undefined || process.env.EXPO_PUBLIC_USE_FAKE_RECOGNIZER === "1";

/**
 * 全 app 共用的資料來源。換資料源只改這裡。
 *
 * - Jest（JEST_WORKER_ID 存在）或 EXPO_PUBLIC_USE_FAKE_PRICES=1：用 stocks.ts 的固定假價，結果可重現。
 * - 其他情況：證交所（上市）+ 櫃買中心（上櫃）最近一個交易日的收盤價，合成一個來源（marketSource）。
 *   一邊失敗另一邊照用，見 docs/stories/007。
 *   個股日 K（K 線圖）目前只有證交所（twseCandleSource），上櫃查不到，見 docs/stories/016。
 *
 * EXPO_PUBLIC_ 變數會在打包時被 Expo CLI 直接換成字串，所以必須整個寫死 `process.env.EXPO_PUBLIC_…`，
 * 不能用變數或解構拿。切法見 docs/architecture.md 第 7 節。
 */
const useFakeSources =
  process.env.JEST_WORKER_ID !== undefined || process.env.EXPO_PUBLIC_USE_FAKE_PRICES === "1";

const marketSource = createMarketSource([twseSource, tpexSource]);

export const priceSource: PriceSource = useFakeSources ? fakePriceSource : marketSource;
export const stockDirectory: StockDirectory = useFakeSources ? fakeStockDirectory : marketSource;
export const candleSource: CandleSource = useFakeSources ? fakeCandleSource : twseCandleSource;
export const holdingStore: HoldingStore = asyncStorageHoldingStore;
export const holdingRecognizer: HoldingRecognizer = useFakeRecognizer
  ? fakeHoldingRecognizer
  : claudeHoldingRecognizer;

export { PriceLoadError } from "./PriceSource";
