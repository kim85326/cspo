import { PriceLoadError } from "@/data";
import { describeLoadError } from "./usePriceHistory";

describe("describeLoadError：載入失敗講白話，技術細節照實列出", () => {
  test("FinMind 額度用完、官方也失敗", () => {
    const error = new PriceLoadError("歷史資料載入失敗（FinMind 回應 HTTP 402：超過上限；證交所回應 HTTP 503）");
    const { message, detail } = describeLoadError(error);
    expect(message).toContain("查詢次數用完");
    expect(detail).toContain("HTTP 402");
  });

  test("斷網：iPhone Safari 的 fetch 錯誤是 TypeError「Load failed」", () => {
    const error = new PriceLoadError("歷史資料載入失敗（FinMind 載入失敗：Load failed）", {
      cause: new PriceLoadError("FinMind 載入失敗", { cause: new TypeError("Load failed") }),
    });
    const { message, detail } = describeLoadError(error);
    expect(message).toBe("K 線載入失敗：連不上資料來源，請檢查網路後重試");
    expect(detail).toContain("Load failed");
  });

  test("其他原因：說三個來源都沒回應", () => {
    expect(describeLoadError(new PriceLoadError("歷史資料載入失敗（證交所回應 HTTP 500）")).message).toBe(
      "K 線載入失敗：FinMind、證交所、櫃買中心都沒有回應，請稍後重試",
    );
  });

  test("不是 Error 也不會壞", () => {
    expect(describeLoadError("oops").detail).toBe("oops");
  });
});
