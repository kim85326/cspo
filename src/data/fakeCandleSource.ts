import type { Candle } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import { STOCKS } from "./stocks";

/**
 * 假日 K：demo 與自動化測試用。依日期算出來，同一天永遠同一根，結果可重現。
 * 每個工作日一根，價格在 stocks.ts 的假現價上下 8% 波動；不在清單的代號回空陣列。
 */
export const fakeCandleSource: CandleSource = {
  async getDailyCandles(symbol, months) {
    const stock = STOCKS.find((s) => s.symbol === symbol);
    if (!stock) return [];
    return months.flatMap((month) => fakeMonth(stock.price, month));
  },
};

function fakeMonth(basePrice: number, month: string): Candle[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const candles: Candle[] = [];
  for (let day = 1; day <= days; day++) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const t = date.getTime() / 86_400_000;
    const open = round2(basePrice * (1 + 0.08 * Math.sin(t / 9)));
    const close = round2(basePrice * (1 + 0.08 * Math.sin((t + 0.8) / 9)));
    const high = round2(Math.max(open, close) * 1.012);
    const low = round2(Math.min(open, close) * 0.988);
    candles.push({ date: date.toISOString().slice(0, 10), open, high, low, close });
  }
  return candles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
