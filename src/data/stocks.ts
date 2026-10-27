import type { Quote } from "@/domain/types";

/**
 * 第一迭代的股票清單與固定假價。
 * 順序就是「熱門清單」的順序（選擇器空白時顯示前幾檔）。
 * 第二迭代改接證交所全市場清單與收盤價時，這個檔案整個換掉即可。
 */
export const STOCKS: Quote[] = [
  { symbol: "2330", name: "台積電", price: 520 },
  { symbol: "2317", name: "鴻海", price: 180 },
  { symbol: "2454", name: "聯發科", price: 1200 },
  { symbol: "0050", name: "元大台灣50", price: 180 },
  { symbol: "0056", name: "元大高股息", price: 36 },
  { symbol: "00878", name: "國泰永續高股息", price: 22 },
  { symbol: "00919", name: "群益台灣精選高息", price: 24 },
  { symbol: "2303", name: "聯電", price: 48 },
  { symbol: "2308", name: "台達電", price: 380 },
  { symbol: "2382", name: "廣達", price: 280 },
  { symbol: "2357", name: "華碩", price: 560 },
  { symbol: "2412", name: "中華電", price: 125 },
  { symbol: "2881", name: "富邦金", price: 85 },
  { symbol: "2882", name: "國泰金", price: 60 },
  { symbol: "2891", name: "中信金", price: 38 },
  { symbol: "2886", name: "兆豐金", price: 42 },
  { symbol: "2884", name: "玉山金", price: 29 },
  { symbol: "2880", name: "華南金", price: 27 },
  { symbol: "2892", name: "第一金", price: 28 },
  { symbol: "5880", name: "合庫金", price: 26 },
  { symbol: "2603", name: "長榮", price: 200 },
  { symbol: "2609", name: "陽明", price: 70 },
  { symbol: "2615", name: "萬海", price: 75 },
  { symbol: "2002", name: "中鋼", price: 25 },
  { symbol: "1301", name: "台塑", price: 45 },
  { symbol: "1303", name: "南亞", price: 40 },
  { symbol: "6505", name: "台塑化", price: 75 },
  { symbol: "1216", name: "統一", price: 80 },
  { symbol: "2912", name: "統一超", price: 280 },
  { symbol: "2207", name: "和泰車", price: 650 },
  { symbol: "2327", name: "國巨", price: 600 },
  { symbol: "3008", name: "大立光", price: 2500 },
  { symbol: "3034", name: "聯詠", price: 500 },
  { symbol: "3231", name: "緯創", price: 110 },
  { symbol: "2376", name: "技嘉", price: 280 },
  { symbol: "2345", name: "智邦", price: 700 },
  { symbol: "3711", name: "日月光投控", price: 150 },
  { symbol: "2395", name: "研華", price: 380 },
  { symbol: "2371", name: "大同", price: 50 },
  { symbol: "2409", name: "友達", price: 16 },
];
