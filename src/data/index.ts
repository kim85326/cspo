import { fakePriceSource } from "./fakePriceSource";
import { fakeStockDirectory } from "./fakeStockDirectory";
import type { PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";

/** 全 app 共用的資料來源。換資料源只改這裡。 */
export const priceSource: PriceSource = fakePriceSource;
export const stockDirectory: StockDirectory = fakeStockDirectory;
