import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { holdingStore } from "@/data";
import CalculateScreen from "./CalculateScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

// holdingStore 走 AsyncStorage（jest.setup.js 已換成記憶體 mock）。
// 按「計算」會把輸入存起來，所以每個測試前要清空，否則下一個測試一開畫面就被帶入資料。
beforeEach(async () => {
  await AsyncStorage.clear();
});

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

describe("記住持股（對應 docs/stories/004）", () => {
  const TSMC = { symbol: "2330", buyPrice: "500", shares: "1000" };

  test("重開 app：上次存的持股自動帶回三個欄位，按計算看到 +20,000", async () => {
    await holdingStore.save([TSMC]);
    await renderScreen();
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.getByDisplayValue("500")).toBeTruthy();
    expect(screen.getByDisplayValue("1000")).toBeTruthy();

    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
  });

  test("按計算成功後，輸入會存進手機", async () => {
    await renderScreen();
    expect(screen.queryByLabelText("清除已儲存的資料")).toBeNull();

    await typeStock("2317");
    await fillPriceAndShares("150", "2000");
    await pressCalculate();
    expect(await screen.findByText("+60,000")).toBeTruthy();

    await waitFor(async () => {
      expect(await holdingStore.load()).toEqual([{ symbol: "2317", buyPrice: "150", shares: "2000" }]);
    });
    expect(screen.getByLabelText("清除已儲存的資料")).toBeTruthy();
  });

  test("欄位有錯時不會存", async () => {
    await renderScreen();
    await typeStock("2330");
    await pressCalculate();
    expect(await screen.findByText("買入價必須大於 0")).toBeTruthy();
    expect(await holdingStore.load()).toEqual([]);
    expect(screen.queryByLabelText("清除已儲存的資料")).toBeNull();
  });

  test("按「清除已儲存的資料」：欄位清空、手機裡的資料也清掉", async () => {
    await holdingStore.save([TSMC]);
    await renderScreen();
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("清除已儲存的資料"));

    expect(screen.queryByDisplayValue("台積電（2330）")).toBeNull();
    expect(screen.getByLabelText("買入價").props.value).toBe("");
    expect(screen.getByLabelText("數量").props.value).toBe("");
    await waitFor(async () => {
      expect(await holdingStore.load()).toEqual([]);
    });
    expect(screen.queryByLabelText("清除已儲存的資料")).toBeNull();
  });

  test("存的代號不在清單裡：代號原樣放回欄位，不會 crash", async () => {
    await holdingStore.save([{ symbol: "9999", buyPrice: "10", shares: "1" }]);
    await renderScreen();
    expect(await screen.findByDisplayValue("9999")).toBeTruthy();
    expect(screen.getByDisplayValue("10")).toBeTruthy();
  });
});
