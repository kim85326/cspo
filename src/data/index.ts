import { asyncStorageHoldingStore } from "./asyncStorageHoldingStore";
import type { CandleSource } from "./CandleSource";
import { claudeHoldingRecognizer } from "./claudeHoldingRecognizer";
import type { CorporateActionSource } from "./CorporateActionSource";
import { fakeCandleSource } from "./fakeCandleSource";
import { fakeCorporateActionSource } from "./fakeCorporateActionSource";
import { createFallbackActionSource, createFallbackCandleSource } from "./fallbackSource";
import { finmindSource } from "./finmindSource";
import { createCachedActionSource, createCachedCandleSource } from "./historyCache";
import { fakeHoldingRecognizer } from "./fakeHoldingRecognizer";
import { fakePriceSource } from "./fakePriceSource";
import { fakeStockDirectory } from "./fakeStockDirectory";
import type { HoldingRecognizer } from "./HoldingRecognizer";
import type { HoldingStore } from "./HoldingStore";
import { createMarketSource } from "./marketSource";
import { createOfficialActionSource, createOfficialCandleSource, type MarketOf } from "./officialSources";
import type { PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";
import { tpexCandleSource } from "./tpexCandleSource";
import { tpexSource } from "./tpexSource";
import { twseCandleSource } from "./twseCandleSource";
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
 * - 歷史日 K（K 線圖、走勢、定期定額）與除權息、分割：FinMind 為主，失敗（含超過次數上限、週日維護）
 *   自動退回證交所／櫃買中心；外面包一層 AsyncStorage 快取，抓過的月份不再抓。見 docs/stories/019。
 *
 * EXPO_PUBLIC_ 變數會在打包時被 Expo CLI 直接換成字串，所以必須整個寫死 `process.env.EXPO_PUBLIC_…`，
 * 不能用變數或解構拿。切法見 docs/architecture.md 第 7 節。
 */
const useFakeSources =
  process.env.JEST_WORKER_ID !== undefined || process.env.EXPO_PUBLIC_USE_FAKE_PRICES === "1";

const marketSource = createMarketSource([twseSource, tpexSource]);

export const priceSource: PriceSource = useFakeSources ? fakePriceSource : marketSource;
export const stockDirectory: StockDirectory = useFakeSources ? fakeStockDirectory : marketSource;

/** 官方來源要知道某檔是上市還是上櫃；清單就是 marketSource 那份（有快取，不會多打） */
const marketOf: MarketOf = async (symbol) =>
  (await marketSource.getAll()).find((s) => s.symbol === symbol)?.market;

const liveCandleSource = createCachedCandleSource(
  createFallbackCandleSource([
    finmindSource,
    createOfficialCandleSource({ twse: twseCandleSource, tpex: tpexCandleSource, marketOf }),
  ]),
);
const liveActionSource = createCachedActionSource(
  createFallbackActionSource([finmindSource, createOfficialActionSource({ marketOf })]),
);

export const candleSource: CandleSource = useFakeSources ? fakeCandleSource : liveCandleSource;
export const corporateActionSource: CorporateActionSource = useFakeSources
  ? fakeCorporateActionSource
  : liveActionSource;
export const holdingStore: HoldingStore = asyncStorageHoldingStore;
export const holdingRecognizer: HoldingRecognizer = useFakeRecognizer
  ? fakeHoldingRecognizer
  : claudeHoldingRecognizer;

export { PriceLoadError } from "./PriceSource";
