import { toStockInfo } from "@/domain/security";
import type { Market } from "@/domain/types";
import { orderForDirectory } from "./directoryOrder";

const info = (symbol: string, name: string, market: Market = "TWSE") => toStockInfo({ symbol, name }, market);

describe("orderForDirectory", () => {
  test("熱門清單在前（台積電第一），其餘依代號排序", () => {
    const list = orderForDirectory([
      info("1102", "亞泥"),
      info("2317", "鴻海"),
      info("1101", "台泥"),
      info("2330", "台積電"),
      info("0050", "元大台灣50"),
    ]);
    expect(list.map((s) => s.symbol)).toEqual(["2330", "2317", "0050", "1101", "1102"]);
  });

  test("上市上櫃混排：不在熱門清單的上櫃股依代號插在中間", () => {
    const list = orderForDirectory([
      info("1101", "台泥"),
      info("3105", "穩懋", "TPEx"),
      info("2330", "台積電"),
      info("1240", "茂生農經", "TPEx"),
    ]);
    expect(list.map((s) => s.symbol)).toEqual(["2330", "1101", "1240", "3105"]);
  });

  test("代號重複時留第一筆", () => {
    const list = orderForDirectory([info("9999", "上市那檔"), info("9999", "上櫃那檔", "TPEx")]);
    expect(list).toEqual([info("9999", "上市那檔")]);
  });
});
