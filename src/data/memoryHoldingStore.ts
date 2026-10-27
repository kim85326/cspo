import type { SavedHolding } from "@/domain/types";
import type { HoldingStore } from "./HoldingStore";

/** 記憶體版：測試用，每次 create 都是乾淨的。 */
export function createMemoryHoldingStore(initial: SavedHolding[] = []): HoldingStore {
  let items: SavedHolding[] = initial.map((item) => ({ ...item }));
  return {
    async load() {
      return items.map((item) => ({ ...item }));
    },
    async save(next) {
      items = next.map((item) => ({ ...item }));
    },
    async clear() {
      items = [];
    },
  };
}

export const memoryHoldingStore: HoldingStore = createMemoryHoldingStore();
