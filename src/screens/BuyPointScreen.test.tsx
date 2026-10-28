import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { CandleSource } from "@/data/CandleSource";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import type { Candle } from "@/domain/types";
import BuyPointScreen from "./BuyPointScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const BUY_DATE = "2026-10-05";

/** 買入日前連續 n 個工作日；越早越便宜：第 i 天收 50 + i（i = 0 最早），再接上買入當天。買入價 250 → 近期都是低檔、拉到 3 年是中段 */
function history(n: number): Candle[] {
  const out: Candle[] = [];
  const d = new Date(`${BUY_DATE}T00:00:00Z`);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.unshift({ date: d.toISOString().slice(0, 10), open: 0, high: 0, low: 0, close: 0 });
  }
  out.forEach((c, i) => Object.assign(c, { open: 50 + i, high: 50 + i, low: 50 + i, close: 50 + i }));
  return [...out, { date: BUY_DATE, open: 300, high: 300, low: 300, close: 300 }];
}

function fakeSources(candles: Candle[]) {
  const getDailyCandles = jest.fn(async (_symbol: string, months: string[]) =>
    candles.filter((c) => months.includes(c.date.slice(0, 7))),
  );
  const getActions = jest.fn(async () => []);
  return {
    sources: {
      candles: { getDailyCandles } as CandleSource,
      actions: { getActions } as CorporateActionSource,
    },
    getDailyCandles,
  };
}

async function renderScreen(props: Partial<Parameters<typeof BuyPointScreen>[0]> = {}, candles = history(800)) {
  const fake = fakeSources(candles);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <BuyPointScreen symbol="2330" name="台積電" date={BUY_DATE} price={250} sources={fake.sources} {...props} />
    </SafeAreaProvider>,
  );
  return fake;
}

describe("BuyPointScreen 買在高點還是低點（對應 docs/stories/016、規格 P2-09）", () => {
  beforeEach(() => jest.clearAllMocks());

  test("預設比較買入日前 1 年：結論、刻度、區間圖與高檔／低檔色帶", async () => {
    await renderScreen();
    expect(await screen.findByTestId("buy-verdict")).toHaveTextContent(/你買在近 1 年的/);
    expect(screen.getByLabelText("比較區間：1 年")).toBeChecked();
    const chart = screen.getByTestId("candle-chart");
    await fireEvent(chart, "layout", { nativeEvent: { layout: { width: 320, height: 220 } } });
    expect(screen.getByTestId("chart-level-bands")).toBeTruthy();
    expect(screen.queryByTestId("chart-pnl-zones")).toBeNull();
    expect(screen.getByTestId("candle-buy-marker")).toBeTruthy();
    expect(screen.getByText(/灰底：區間收盤價前 20%/)).toBeTruthy();
  });

  test("切到 3 個月、3 年：結論與資料跟著換", async () => {
    const fake = await renderScreen();
    await screen.findByTestId("buy-verdict");
    await fireEvent.press(screen.getByLabelText("比較區間：3 個月"));
    await waitFor(() => expect(screen.getByTestId("buy-verdict")).toHaveTextContent(/你買在近 3 個月的低檔/));
    await fireEvent.press(screen.getByLabelText("比較區間：3 年"));
    await waitFor(() => expect(screen.getByTestId("buy-verdict")).toHaveTextContent(/你買在近 3 年的中段/));
    const months = fake.getDailyCandles.mock.calls.at(-1)?.[1];
    expect(months?.[0]).toBe("2023-10");
  });

  test("自訂起始日：預設 1 年前、改了就照新的算；早於買入日前 3 年不可選", async () => {
    await renderScreen();
    await screen.findByTestId("buy-verdict");
    await fireEvent.press(screen.getByLabelText("比較區間：自訂"));
    expect(screen.getByText("2025/10/05")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("起始日"));
    const picker = screen.getByTestId("custom-start-picker");
    expect(new Date(picker.props.minimumDate).getTime()).toBe(new Date(2023, 9, 5).getTime());
    expect(new Date(picker.props.maximumDate).getTime()).toBe(new Date(2026, 9, 4).getTime());
    await fireEvent(picker, "valueChange", {}, new Date(2026, 6, 1));
    await waitFor(() => expect(screen.getByTestId("buy-verdict")).toHaveTextContent(/你買在 2026\/07\/01 以來的低檔/));
  });

  test("拍照匯入的期初持股：結論旁註明買入日為匯入日期", async () => {
    await renderScreen({ imported: true });
    expect(await screen.findByTestId("imported-note")).toHaveTextContent("買入日為匯入日期，結果僅供參考");
  });

  test("區間內交易日少於 20 天：不下結論、不畫色帶", async () => {
    await renderScreen({}, history(10));
    expect(await screen.findByText("資料不足，無法判斷")).toBeTruthy();
    const chart = screen.getByTestId("candle-chart");
    await fireEvent(chart, "layout", { nativeEvent: { layout: { width: 320, height: 220 } } });
    expect(screen.queryByTestId("chart-level-bands")).toBeNull();
  });

  test("剛存好新的買入：顯示已記下，按「完成」回上一頁", async () => {
    await renderScreen({ saved: true });
    expect(await screen.findByText(/已記下這筆買入/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "完成" }));
    expect(router.back).toHaveBeenCalled();
  });

  test("結論不含「建議」「應該」「買進」「賣出」", async () => {
    await renderScreen();
    const text = String((await screen.findByTestId("buy-verdict")).props.accessibilityLabel);
    expect(text).not.toMatch(/建議|應該|買進|賣出/);
  });
});
