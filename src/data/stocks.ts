import { securityTypeOf } from "@/domain/security";
import type { Market, StockInfo } from "@/domain/types";

/** 假資料一檔：證券基本資料 + 固定假價 */
export type FakeStock = StockInfo & { price: number };

function stock(market: Market, symbol: string, name: string, price: number): FakeStock {
  return { symbol, name, type: securityTypeOf(symbol), market, price };
}
const listed = (symbol: string, name: string, price: number) => stock("TWSE", symbol, name, price);
const otc = (symbol: string, name: string, price: number) => stock("TPEx", symbol, name, price);

/**
 * 股票清單與固定假價（Jest、Maestro、EXPO_PUBLIC_USE_FAKE_PRICES=1 用）。
 * 順序就是「熱門清單」的順序（選擇器空白時顯示前幾檔），真實行情的熱門排序也照這個順序（directoryOrder.ts）。
 * 前 40 檔是第一迭代的上市股票／ETF；後面是 Story 007 加的上櫃股票與上櫃 ETF。
 * 類型（個股／ETF）一律由代號判斷（securityTypeOf），不手寫。
 */
export const STOCKS: FakeStock[] = [
  listed("2330", "台積電", 520),
  listed("2317", "鴻海", 180),
  listed("2454", "聯發科", 1200),
  listed("0050", "元大台灣50", 180),
  listed("0056", "元大高股息", 36),
  listed("00878", "國泰永續高股息", 22),
  listed("00919", "群益台灣精選高息", 24),
  listed("2303", "聯電", 48),
  listed("2308", "台達電", 380),
  listed("2382", "廣達", 280),
  listed("2357", "華碩", 560),
  listed("2412", "中華電", 125),
  listed("2881", "富邦金", 85),
  listed("2882", "國泰金", 60),
  listed("2891", "中信金", 38),
  listed("2886", "兆豐金", 42),
  listed("2884", "玉山金", 29),
  listed("2880", "華南金", 27),
  listed("2892", "第一金", 28),
  listed("5880", "合庫金", 26),
  listed("2603", "長榮", 200),
  listed("2609", "陽明", 70),
  listed("2615", "萬海", 75),
  listed("2002", "中鋼", 25),
  listed("1301", "台塑", 45),
  listed("1303", "南亞", 40),
  listed("6505", "台塑化", 75),
  listed("1216", "統一", 80),
  listed("2912", "統一超", 280),
  listed("2207", "和泰車", 650),
  listed("2327", "國巨", 600),
  listed("3008", "大立光", 2500),
  listed("3034", "聯詠", 500),
  listed("3231", "緯創", 110),
  listed("2376", "技嘉", 280),
  listed("2345", "智邦", 700),
  listed("3711", "日月光投控", 150),
  listed("2395", "研華", 380),
  listed("2371", "大同", 50),
  listed("2409", "友達", 16),
  // 上櫃（櫃買中心）
  otc("5347", "世界", 160),
  otc("6488", "環球晶", 800),
  otc("8069", "元太", 150),
  otc("006201", "元大富櫃50", 42),
  otc("00679B", "元大美債20年", 26),
];
