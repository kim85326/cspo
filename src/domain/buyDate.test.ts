import { formatIsoDate, localIsoDate, parseBuyDate } from "./buyDate";

const TODAY = new Date(2026, 9, 27); // 2026/10/27（本地時區）

describe("parseBuyDate", () => {
  test("空白代表沒填", () => {
    expect(parseBuyDate("", TODAY)).toEqual({ ok: true, iso: undefined });
    expect(parseBuyDate("   ", TODAY)).toEqual({ ok: true, iso: undefined });
  });

  test.each([
    ["2026/10/05", "2026-10-05"],
    ["2026-10-05", "2026-10-05"],
    ["2026.10.5", "2026-10-05"],
    ["2026/1/5", "2026-01-05"],
    ["２０２６／１０／０５", "2026-10-05"],
    [" 2026/10/27 ", "2026-10-27"],
  ])("%s → %s", (raw, iso) => {
    expect(parseBuyDate(raw, TODAY)).toEqual({ ok: true, iso });
  });

  test.each(["20261005", "10/05", "2026/10", "115/10/05", "abc"])("格式不對：%s", (raw) => {
    expect(parseBuyDate(raw, TODAY)).toEqual({ ok: false, error: "日期請用 2026/10/05 的格式" });
  });

  test.each(["2026/02/30", "2026/13/01", "2026/00/10"])("沒有這一天：%s", (raw) => {
    expect(parseBuyDate(raw, TODAY)).toEqual({ ok: false, error: "沒有這一天，請檢查日期" });
  });

  test("晚於今天不行，今天可以", () => {
    expect(parseBuyDate("2026/10/28", TODAY)).toEqual({ ok: false, error: "買入日期不能晚於今天" });
    expect(parseBuyDate("2026/10/27", TODAY).ok).toBe(true);
  });
});

describe("localIsoDate / formatIsoDate", () => {
  test("本地日期轉 ISO、ISO 轉顯示用", () => {
    expect(localIsoDate(TODAY)).toBe("2026-10-27");
    expect(formatIsoDate("2026-10-05")).toBe("2026/10/05");
  });
});
