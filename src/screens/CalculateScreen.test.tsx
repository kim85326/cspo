import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import CalculateScreen from "./CalculateScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

// 畫面用了 useSafeAreaInsets，測試要包 SafeAreaProvider 並給固定 inset。
const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CalculateScreen />
    </SafeAreaProvider>,
  );
  // 等股票清單載入完成（熱門清單會在聚焦時顯示）
  await screen.findByLabelText("股票代號或名稱");
}

// RNTL 14 起 render 與 fireEvent 都是非同步，要 await。
async function typeStock(text: string) {
  const input = screen.getByLabelText("股票代號或名稱");
  await fireEvent(input, "focus");
  await fireEvent.changeText(input, text);
}

async function fillPriceAndShares(buyPrice: string, shares: string) {
  await fireEvent.changeText(screen.getByLabelText("買入價"), buyPrice);
  await fireEvent.changeText(screen.getByLabelText("數量"), shares);
}

async function pressCalculate() {
  await fireEvent.press(screen.getByLabelText("計算"));
}

describe("CalculateScreen（對應 docs/stories/001）", () => {
  test("賺錢：顯示 +20,000", async () => {
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
    expect(screen.getByText("賺了")).toBeTruthy();
  });

  test("虧錢：顯示 -10,000", async () => {
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("540", "500");
    await pressCalculate();
    expect(await screen.findByText("-10,000")).toBeTruthy();
    expect(screen.getByText("虧了")).toBeTruthy();
  });

  test("代號不存在：顯示找不到", async () => {
    await renderScreen();
    await typeStock("9999");
    await fillPriceAndShares("100", "1");
    await pressCalculate();
    expect(await screen.findByText(/找不到這檔股票/)).toBeTruthy();
  });

  test("欄位空白：顯示錯誤，不顯示盈虧", async () => {
    await renderScreen();
    await pressCalculate();
    expect(await screen.findByText("請輸入代號或公司名稱，或從清單選擇")).toBeTruthy();
    expect(screen.getByText("買入價必須大於 0")).toBeTruthy();
    expect(screen.getByText("數量必須是大於 0 的整數（股）")).toBeTruthy();
    expect(screen.queryByLabelText("盈虧結果")).toBeNull();
  });
});

describe("StockPicker（對應 docs/stories/002）", () => {
  test("打公司名稱也能算：台積電 → +20,000", async () => {
    await renderScreen();
    await typeStock("台積電");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
    expect(screen.getByText("台積電（2330）")).toBeTruthy();
  });

  test("打部分名稱會出現候選，點選後欄位顯示名稱與代號", async () => {
    await renderScreen();
    await typeStock("聯");
    expect(await screen.findByLabelText("選擇 聯電 2303")).toBeTruthy();
    expect(screen.getByLabelText("選擇 聯發科 2454")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("選擇 聯發科 2454"));
    expect(screen.getByDisplayValue("聯發科（2454）")).toBeTruthy();
    expect(screen.queryByLabelText("選擇 聯電 2303")).toBeNull();

    await fillPriceAndShares("1000", "100");
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
  });

  test("多檔符合又沒選，提示請從清單選擇", async () => {
    await renderScreen();
    await typeStock("聯");
    await fillPriceAndShares("100", "1");
    await pressCalculate();
    expect(await screen.findByText("有多檔符合，請從清單選擇一檔")).toBeTruthy();
  });

  test("欄位空白時聚焦會列出熱門股票，可直接點選", async () => {
    await renderScreen();
    await fireEvent(screen.getByLabelText("股票代號或名稱"), "focus");
    expect(await screen.findByText("熱門股票")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("選擇 鴻海 2317"));
    expect(screen.getByDisplayValue("鴻海（2317）")).toBeTruthy();
  });

  test("清除鈕會清掉已選股票", async () => {
    await renderScreen();
    await typeStock("2330");
    await fireEvent.press(await screen.findByLabelText("選擇 台積電 2330"));
    expect(screen.getByDisplayValue("台積電（2330）")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("清除股票"));
    expect(screen.queryByDisplayValue("台積電（2330）")).toBeNull();
  });
});

/** 填第 n 檔（從 1 算）；多檔時 label 相同，用順序區分 */
async function fillHolding(n: number, stock: string, buyPrice: string, shares: string) {
  const stockInput = screen.getAllByLabelText("股票代號或名稱")[n - 1];
  await fireEvent(stockInput, "focus");
  await fireEvent.changeText(stockInput, stock);
  await fireEvent.changeText(screen.getAllByLabelText("買入價")[n - 1], buyPrice);
  await fireEvent.changeText(screen.getAllByLabelText("數量")[n - 1], shares);
}

describe("多檔比較（對應 docs/stories/003）", () => {
  test("一開始只有一檔，按「新增一檔比較」後出現第 2 檔與移除鈕", async () => {
    await renderScreen();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(1);
    expect(screen.queryByLabelText("移除第 1 檔")).toBeNull();

    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(2);
    expect(screen.getByText("第 2 檔")).toBeTruthy();
    expect(screen.getByLabelText("移除第 1 檔")).toBeTruthy();
    expect(screen.getByLabelText("移除第 2 檔")).toBeTruthy();
  });

  test("兩檔一賺一虧：賺的排第一並標「表現最好」，合計為 0", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2317", "200", "1000"); // 鴻海 現價 180 → -20,000（-10%）
    await fillHolding(2, "2330", "500", "1000"); // 台積電 現價 520 → +20,000（+4%）
    await pressCalculate();

    expect(await screen.findByLabelText("比較結果")).toBeTruthy();
    expect(screen.getByLabelText("第 1 名 台積電 2330")).toBeTruthy();
    expect(screen.getByLabelText("第 2 名 鴻海 2317")).toBeTruthy();
    expect(screen.getByText("表現最好")).toBeTruthy();
    expect(screen.getByText("表現最差")).toBeTruthy();
    expect(screen.getByText("+20,000")).toBeTruthy();
    expect(screen.getByText("-20,000")).toBeTruthy();
    expect(screen.getByText("+4.00%")).toBeTruthy();
    expect(screen.getByText("-10.00%")).toBeTruthy();
    expect(screen.getByLabelText("總盈虧")).toHaveTextContent("0");
    expect(screen.getByText("整體不賺不賠")).toBeTruthy();
    // 單檔結果卡不出現
    expect(screen.queryByLabelText("盈虧結果")).toBeNull();
  });

  test("只有一檔時維持單檔結果卡，不顯示比較", async () => {
    await renderScreen();
    await fillHolding(1, "2330", "500", "1000");
    await pressCalculate();
    expect(await screen.findByLabelText("盈虧結果")).toBeTruthy();
    expect(screen.queryByLabelText("比較結果")).toBeNull();
  });

  test("第 2 檔沒填，錯誤只出現在第 2 檔，不顯示結果", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2330", "500", "1000");
    await pressCalculate();

    expect(await screen.findByText("請輸入代號或公司名稱，或從清單選擇")).toBeTruthy();
    expect(screen.getAllByText("買入價必須大於 0")).toHaveLength(1);
    expect(screen.queryByLabelText("比較結果")).toBeNull();
    expect(screen.queryByLabelText("盈虧結果")).toBeNull();
  });

  test("移除第 2 檔後回到單檔，再算是單檔結果卡", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2330", "500", "1000");
    await fireEvent.press(screen.getByLabelText("移除第 2 檔"));
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(1);
    expect(screen.queryByLabelText("移除第 1 檔")).toBeNull();

    await pressCalculate();
    expect(await screen.findByLabelText("盈虧結果")).toBeTruthy();
    expect(screen.getByText("+20,000")).toBeTruthy();
  });

  test("最多 5 檔：第 5 檔之後新增鈕變成提示且不能再加", async () => {
    await renderScreen();
    for (let i = 0; i < 4; i++) {
      await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    }
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(5);
    expect(screen.getByText("最多比較 5 檔")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(5);
  });
});
