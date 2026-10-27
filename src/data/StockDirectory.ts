import type { StockInfo } from "@/domain/types";

/** 股票清單來源。選擇器用它拿到「有哪些股票可以選」。 */
export interface StockDirectory {
  getAll(): Promise<StockInfo[]>;
}
