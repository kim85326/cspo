/**
 * 記憶體內的次數限制。後端只有一個 process、重啟就歸零，對「一台電腦給測試同學用」夠了；
 * 擋不住的分散式濫用由 Anthropic Console 的花費上限兜底。時間由呼叫端傳入，方便測試。
 */

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** 每個 key（來源 IP）每分鐘最多 limit 次，固定時間窗 */
export function createPerMinuteLimiter(limit: number) {
  const WINDOW_MS = 60_000;
  const windows = new Map<string, { start: number; count: number }>();

  return {
    check(key: string, now: number): LimitResult {
      // 順手清掉過期的，避免很多不同 IP 讓 Map 一直長大
      if (windows.size > 1_000) {
        for (const [k, w] of windows) if (now - w.start >= WINDOW_MS) windows.delete(k);
      }
      const current = windows.get(key);
      if (!current || now - current.start >= WINDOW_MS) {
        windows.set(key, { start: now, count: 1 });
        return { ok: true };
      }
      if (current.count >= limit) {
        return { ok: false, retryAfterSeconds: Math.ceil((current.start + WINDOW_MS - now) / 1000) };
      }
      current.count += 1;
      return { ok: true };
    },
  };
}

/** 整台後端每天（依電腦本地日期）最多呼叫 Claude 幾次 */
export function createDailyQuota(limit: number) {
  let day = "";
  let used = 0;

  return {
    take(now: number): boolean {
      const today = new Date(now).toDateString();
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}
