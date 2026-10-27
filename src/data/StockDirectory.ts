import type { StockInfo } from "@/domain/types";

/**
 * 股票清單來源。選擇器用它拿到「有哪些股票可以選」。
 * 清單拿不到（斷網等）丟 PriceLoadError。
 */
export interface StockDirectory {
  getAll(): Promise<StockInfo[]>;
}
