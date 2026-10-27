/**
 * 交易日判斷。不另外抓休市日曆：某檔（通常是 0050）有收盤價的日子就是交易日。
 * tradingDates 是 ISO 日期、由舊到新（例如 candles.map((c) => c.date)）。
 */

/**
 * date 當天或之後的第一個交易日（P2-02 定期定額：扣款日遇假日順延）。
 * date 晚於最後一筆資料 → null：可能是今天還沒收盤、或資料還沒更新，spec 說先不產生、下次再補。
 */
export function tradingDayOnOrAfter(date: string, tradingDates: string[]): string | null {
  return tradingDates.find((d) => d >= date) ?? null;
}

/**
 * date 之前（不含當天）的最後一個交易日（P2-03 股利：參與股數 = 除息日前一個交易日收盤時的持股）。
 * 資料最早一天就在 date 當天或之後 → null（範圍不夠，判斷不了）。
 */
export function tradingDayBefore(date: string, tradingDates: string[]): string | null {
  for (let i = tradingDates.length - 1; i >= 0; i--) {
    if (tradingDates[i] < date) return tradingDates[i];
  }
  return null;
}
