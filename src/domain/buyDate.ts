/**
 * 買入日期：使用者手打的字串 → ISO 日期（"2026-10-05"）。
 * 選填；填了才會在 K 線圖上標出買入點。
 */

export type BuyDateResult = { ok: true; iso: string | undefined } | { ok: false; error: string };

/** 接受 2026/10/05、2026-10-05、2026.10.5、全形數字；空白代表沒填 */
export function parseBuyDate(raw: string, today: Date = new Date()): BuyDateResult {
  const cleaned = raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[／－．]/g, "/")
    .trim();
  if (cleaned === "") return { ok: true, iso: undefined };

  const match = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(cleaned);
  if (!match) return { ok: false, error: "日期請用 2026/10/05 的格式" };

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, error: "沒有這一天，請檢查日期" };
  }

  const iso = toIsoDate(year, month, day);
  if (iso > localIsoDate(today)) return { ok: false, error: "買入日期不能晚於今天" };
  return { ok: true, iso };
}

/** 本地時區的今天，ISO 格式 */
export function localIsoDate(date: Date): string {
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 顯示用："2026-10-05" → "2026/10/05" */
export function formatIsoDate(iso: string): string {
  return iso.replace(/-/g, "/");
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
