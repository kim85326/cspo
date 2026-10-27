import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  candleSource,
  holdingRecognizer,
  holdingStore,
  InsightError,
  insightProvider,
  PriceLoadError,
  priceSource,
  RecognizeError,
  stockDirectory,
} from "@/data";
import { features } from "@/config/features";
import { FAKE_EXTRACTION } from "@/data/fakeHoldingRecognizer";
import type { StockInfo } from "@/domain/types";
import { FAKE_INSIGHT } from "@/data/fakeInsightProvider";
import { CHART_PREFS_KEY } from "@/hooks/useChartPrefs";
import { BUY_DATE_HINT, CANDLE_EMPTY } from "@/ui/PriceHistoryCard";
import CalculateScreen from "./CalculateScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

// 相簿與相機是原生功能，Jest 裡換成假的：預設有權限、選到一張 PNG。
// 個別測試可用 mocked(...).mockResolvedValueOnce 改成拒絕權限或取消。
jest.mock("expo-image-picker", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///holdings.png", base64: "aGk=", mimeType: "image/png", width: 1, height: 1 }],
  })),
  launchCameraAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///camera.jpg", base64: "aGk=", mimeType: "image/jpeg", width: 1, height: 1 }],
  })),
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
  await screen.findAllByLabelText("股票代號或名稱");
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
    expect(await screen.findByLabelText("選擇 聯電 2303 個股")).toBeTruthy();
    expect(screen.getByLabelText("選擇 聯發科 2454 個股")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("選擇 聯發科 2454 個股"));
    expect(screen.getByDisplayValue("聯發科（2454）")).toBeTruthy();
    expect(screen.queryByLabelText("選擇 聯電 2303 個股")).toBeNull();

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
    await fireEvent.press(screen.getByLabelText("選擇 鴻海 2317 個股"));
    expect(screen.getByDisplayValue("鴻海（2317）")).toBeTruthy();
  });

  test("清除鈕會清掉已選股票", async () => {
    await renderScreen();
    await typeStock("2330");
    await fireEvent.press(await screen.findByLabelText("選擇 台積電 2330 個股"));
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

describe("記住持股（對應 docs/stories/004）", () => {
  const TSMC = { symbol: "2330", buyPrice: "500", shares: "1000" };
  const HONHAI = { symbol: "2317", buyPrice: "200", shares: "1000" };

  test("重開 app：上次存的持股自動帶回三個欄位，按計算看到 +20,000", async () => {
    await holdingStore.save([TSMC]);
    await renderScreen();
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.getByDisplayValue("500")).toBeTruthy();
    expect(screen.getByDisplayValue("1000")).toBeTruthy();

    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
  });

  test("存了兩檔：重開會帶回兩個區塊，直接比較", async () => {
    await holdingStore.save([HONHAI, TSMC]);
    await renderScreen();
    expect(await screen.findByDisplayValue("鴻海（2317）")).toBeTruthy();
    expect(screen.getByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(2);
    expect(screen.getByText("第 2 檔")).toBeTruthy();

    await pressCalculate();
    expect(await screen.findByLabelText("比較結果")).toBeTruthy();
    expect(screen.getByLabelText("第 1 名 台積電 2330")).toBeTruthy();
  });

  test("按計算成功後，所有檔的輸入都會存進手機", async () => {
    await renderScreen();
    expect(screen.queryByLabelText("清除已儲存的資料")).toBeNull();

    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2317", "150", "2000");
    await fillHolding(2, "台積電", "500", "1000");
    await pressCalculate();
    expect(await screen.findByLabelText("比較結果")).toBeTruthy();

    await waitFor(async () => {
      expect(await holdingStore.load()).toEqual([
        { symbol: "2317", buyPrice: "150", shares: "2000" },
        { symbol: "2330", buyPrice: "500", shares: "1000" },
      ]);
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

  test("按「清除已儲存的資料」：回到只有一檔且欄位空白、手機裡的資料也清掉", async () => {
    await holdingStore.save([HONHAI, TSMC]);
    await renderScreen();
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(2);

    await fireEvent.press(screen.getByLabelText("清除已儲存的資料"));

    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(1);
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

describe("代號帶英文字母（槓桿／反向 ETF 等）", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function stubLetterSymbolStock() {
    jest.spyOn(stockDirectory, "getAll").mockResolvedValue([
      { symbol: "2330", name: "台積電", type: "stock", market: "TWSE" },
      { symbol: "00631L", name: "元大台灣50正2", type: "etf", market: "TWSE" },
    ]);
    jest.spyOn(priceSource, "getQuote").mockImplementation(async (symbol) =>
      symbol === "00631L" ? { symbol, name: "元大台灣50正2", price: 250 } : null,
    );
  }

  test("打代號 00631L 算得出盈虧，不會被代號格式擋掉", async () => {
    stubLetterSymbolStock();
    await renderScreen();
    await typeStock("00631L");
    await fillPriceAndShares("200", "1000");
    await pressCalculate();
    expect(await screen.findByText("+50,000")).toBeTruthy();
    expect(screen.queryByText(/請輸入正確的股票代號/)).toBeNull();
  });

  test("打小寫 00631l 也算得出來", async () => {
    stubLetterSymbolStock();
    await renderScreen();
    await typeStock("00631l");
    await fillPriceAndShares("200", "1000");
    await pressCalculate();
    expect(await screen.findByText("+50,000")).toBeTruthy();
  });
});

describe("真實行情（證交所）：載入失敗與資料日期", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("現價拿不到：顯示行情載入失敗，不顯示盈虧", async () => {
    jest.spyOn(priceSource, "getQuote").mockRejectedValueOnce(new PriceLoadError());
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("行情載入失敗，請檢查網路後重試")).toBeTruthy();
    expect(screen.queryByLabelText("盈虧結果")).toBeNull();
  });

  test("再按一次計算會重試，成功後錯誤消失", async () => {
    jest.spyOn(priceSource, "getQuote").mockRejectedValueOnce(new PriceLoadError());
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("行情載入失敗，請檢查網路後重試")).toBeTruthy();
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
    expect(screen.queryByText("行情載入失敗，請檢查網路後重試")).toBeNull();
  });

  test("股票清單載不到：顯示錯誤；按計算會重載清單再算", async () => {
    jest.spyOn(stockDirectory, "getAll").mockRejectedValueOnce(new PriceLoadError());
    await renderScreen();
    expect(await screen.findByText("行情載入失敗，請檢查網路後重試")).toBeTruthy();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
  });

  test("兩檔比較時其中一檔行情失敗：整體顯示載入失敗，不顯示比較結果", async () => {
    const real = priceSource.getQuote.bind(priceSource);
    jest.spyOn(priceSource, "getQuote").mockImplementation(async (symbol) => {
      if (symbol === "2317") throw new PriceLoadError();
      return real(symbol);
    });
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2330", "500", "1000");
    await fillHolding(2, "2317", "200", "1000");
    await pressCalculate();
    expect(await screen.findByText("行情載入失敗，請檢查網路後重試")).toBeTruthy();
    expect(screen.queryByLabelText("比較結果")).toBeNull();
  });

  test("清單還在載入時聚焦欄位，顯示載入中", async () => {
    let resolveList: (list: StockInfo[]) => void = () => {};
    jest.spyOn(stockDirectory, "getAll").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    await renderScreen();
    await fireEvent(screen.getByLabelText("股票代號或名稱"), "focus");
    expect(await screen.findByText("股票清單載入中…")).toBeTruthy();
    await act(async () => {
      resolveList([{ symbol: "2330", name: "台積電", type: "stock", market: "TWSE" }]);
    });
    expect(await screen.findByText("熱門股票")).toBeTruthy();
    expect(screen.queryByText("股票清單載入中…")).toBeNull();
  });

  test("結果卡顯示資料日期", async () => {
    jest
      .spyOn(priceSource, "getQuote")
      .mockResolvedValueOnce({ symbol: "2330", name: "台積電", price: 2385, asOf: "2026/10/22" });
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("2000", "1000");
    await pressCalculate();
    expect(await screen.findByText("+385,000")).toBeTruthy();
    expect(screen.getByText("收盤價 2026/10/22")).toBeTruthy();
  });
});

describe("截圖匯入的功能開關", () => {
  afterEach(() => {
    features.screenshotImport = false;
  });

  test("開關關閉（預設）：看不到「從截圖匯入」，其他功能照常", async () => {
    features.screenshotImport = false;
    await renderScreen();
    expect(screen.queryByLabelText("從截圖匯入")).toBeNull();
    expect(screen.getByLabelText("新增一檔比較")).toBeTruthy();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
  });

  test("開關打開：出現「從截圖匯入」", async () => {
    features.screenshotImport = true;
    await renderScreen();
    expect(screen.getByLabelText("從截圖匯入")).toBeTruthy();
  });
});

describe("從截圖匯入（對應 docs/stories/005）", () => {
  beforeEach(() => {
    features.screenshotImport = true;
  });

  afterEach(() => {
    features.screenshotImport = false;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  async function importFromLibrary() {
    await fireEvent.press(screen.getByLabelText("從截圖匯入"));
    await fireEvent.press(await screen.findByLabelText("從相簿選"));
  }

  test("匯入兩檔：表單出現兩檔已填好（鴻海 1 張換算成 1000 股），按計算看到比較結果", async () => {
    await renderScreen();
    await importFromLibrary();

    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.getByDisplayValue("鴻海（2317）")).toBeTruthy();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(2);
    expect(screen.getByDisplayValue("500")).toBeTruthy();
    expect(screen.getByDisplayValue("200")).toBeTruthy();
    expect(screen.getAllByDisplayValue("1000")).toHaveLength(2);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: true, mediaTypes: ["images"] }),
    );
    // 信心 high 又對到股票：沒有「請確認」
    expect(screen.queryByText("請確認")).toBeNull();

    await pressCalculate();
    expect(await screen.findByLabelText("比較結果")).toBeTruthy();
    expect(screen.getByLabelText("第 1 名 台積電 2330")).toBeTruthy();
    expect(screen.getByText("+20,000")).toBeTruthy();
    expect(screen.getByText("-20,000")).toBeTruthy();
  });

  test("拍照也能匯入", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("從截圖匯入"));
    await fireEvent.press(await screen.findByLabelText("拍照"));
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
  });

  test("辨識中顯示「辨識中…」，按鈕不能再按", async () => {
    let finish: (value: typeof FAKE_EXTRACTION) => void = () => {};
    jest.spyOn(holdingRecognizer, "recognize").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderScreen();
    await importFromLibrary();

    expect(await screen.findByText("辨識中…")).toBeTruthy();
    expect(screen.getByLabelText("從截圖匯入")).toBeDisabled();

    await act(async () => {
      finish(FAKE_EXTRACTION);
    });
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.queryByText("辨識中…")).toBeNull();
  });

  test("辨識失敗：顯示可重試的錯誤，原本輸入還在；重試成功後填入", async () => {
    const spy = jest
      .spyOn(holdingRecognizer, "recognize")
      .mockRejectedValueOnce(new RecognizeError("連不上辨識服務"));
    await renderScreen();
    await fillHolding(1, "2454", "1000", "100");
    await importFromLibrary();

    expect(await screen.findByText("連不上辨識服務")).toBeTruthy();
    expect(screen.getByDisplayValue("2454")).toBeTruthy();
    expect(screen.getByDisplayValue("1000")).toBeTruthy();
    expect(screen.getByDisplayValue("100")).toBeTruthy();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(1);

    spy.mockRestore(); // 回到假辨識器的固定結果
    await fireEvent.press(screen.getByLabelText("重試辨識"));
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.queryByText("連不上辨識服務")).toBeNull();
    // 已填的 2454 保留在第 1 檔，匯入的接在後面
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(3);
    expect(screen.getByDisplayValue("2454")).toBeTruthy();
  });

  test("辨識不到任何持股：顯示錯誤，欄位不變", async () => {
    jest.spyOn(holdingRecognizer, "recognize").mockResolvedValueOnce({ holdings: [], warnings: ["這不是持股畫面"] });
    await renderScreen();
    await importFromLibrary();
    expect(await screen.findByText(/辨識不到任何持股/)).toBeTruthy();
    expect(screen.getByText(/這不是持股畫面/)).toBeTruthy();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(1);
  });

  test("對不到的股票把名稱放進欄位並標「請確認」；low confidence 的欄位也標", async () => {
    jest.spyOn(holdingRecognizer, "recognize").mockResolvedValueOnce({
      holdings: [
        { name: "不存在公司", buyPrice: "10", shares: "100", confidence: "high" },
        { symbol: "2330", buyPrice: "500", shares: "1000", confidence: "low" },
      ],
      warnings: [],
    });
    await renderScreen();
    await importFromLibrary();

    expect(await screen.findByDisplayValue("不存在公司")).toBeTruthy();
    expect(screen.getByLabelText("股票代號或名稱 請確認")).toBeTruthy();
    expect(screen.getByLabelText("買入價 請確認")).toBeTruthy();
    expect(screen.getByLabelText("數量 請確認")).toBeTruthy();

    // 使用者改了買入價，那一欄的「請確認」就消失
    await fireEvent.changeText(screen.getAllByLabelText("買入價")[1], "510");
    expect(screen.queryByLabelText("買入價 請確認")).toBeNull();
    expect(screen.getByLabelText("數量 請確認")).toBeTruthy();
  });

  test("截圖超過 5 檔：只匯入 5 檔並提示", async () => {
    jest.spyOn(holdingRecognizer, "recognize").mockResolvedValueOnce({
      holdings: ["2330", "2317", "2454", "2303", "0050", "2603"].map((symbol) => ({
        symbol,
        buyPrice: "10",
        shares: "1000",
        confidence: "high" as const,
      })),
      warnings: [],
    });
    await renderScreen();
    await importFromLibrary();
    expect(await screen.findByText("截圖有 6 檔，只匯入前 5 檔")).toBeTruthy();
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(5);
  });

  test("相簿權限被拒：提示去設定開啟，不開相簿", async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValueOnce({
        granted: false,
        canAskAgain: false,
        status: ImagePicker.PermissionStatus.DENIED,
        expires: "never",
        accessPrivileges: "none",
      });
    await renderScreen();
    await importFromLibrary();
    expect(await screen.findByText(/沒有相簿權限/)).toBeTruthy();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  test("選圖時取消：什麼都不發生", async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null });
    await renderScreen();
    await importFromLibrary();
    await waitFor(() => expect(screen.queryByLabelText("從相簿選")).toBeNull());
    expect(screen.getAllByLabelText("股票代號或名稱")).toHaveLength(1);
    expect(screen.queryByTestId("import-error")).toBeNull();
  });
});

describe("證券類型與上櫃股票（對應 docs/stories/007）", () => {
  test("輸入 0050：第一筆是元大台灣50，標示 ETF", async () => {
    await renderScreen();
    await typeStock("0050");
    const rows = await screen.findAllByLabelText(/^選擇 /);
    expect(rows[0]).toHaveAccessibleName("選擇 元大台灣50 0050 ETF");
    expect(within(rows[0]).getByText("ETF")).toBeTruthy();
  });

  test("輸入台積：台積電標示個股", async () => {
    await renderScreen();
    await typeStock("台積");
    const row = await screen.findByLabelText("選擇 台積電 2330 個股");
    expect(within(row).getByText("個股")).toBeTruthy();
  });

  test("搜得到上櫃股票，選了就能用上櫃收盤價算盈虧", async () => {
    await renderScreen();
    await typeStock("世界");
    await fireEvent.press(await screen.findByLabelText("選擇 世界 5347 個股"));
    expect(screen.getByDisplayValue("世界（5347）")).toBeTruthy();
    // 假價表：世界 160
    await fillPriceAndShares("150", "1000");
    await pressCalculate();
    expect(await screen.findByText("+10,000")).toBeTruthy();
  });

  test("上櫃 ETF 006201 標示 ETF", async () => {
    await renderScreen();
    await typeStock("006201");
    expect(await screen.findByLabelText("選擇 元大富櫃50 006201 ETF")).toBeTruthy();
  });

  test("符合的超過 20 檔時只列 20 筆", async () => {
    await renderScreen();
    await typeStock("2");
    expect(await screen.findAllByLabelText(/^選擇 /)).toHaveLength(20);
  });
});

describe("走勢圖與買入點（對應 docs/stories/016）", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 2026/10/02（五）、10/05（一）、10/06（二）三根；10/03、10/04 是週末
  const CANDLES = [
    { date: "2026-10-02", open: 505, high: 515, low: 495, close: 500 },
    { date: "2026-10-05", open: 500, high: 530, low: 498, close: 525 },
    { date: "2026-10-06", open: 525, high: 528, low: 510, close: 520 },
  ];

  /** 點「買入日期」打開日曆，選 "2026/10/05" 這一天（測試環境是 iOS 的內嵌日曆） */
  async function pickBuyDate(date: string) {
    const [y, m, d] = date.split("/").map(Number);
    await fireEvent.press(screen.getByLabelText("買入日期"));
    await fireEvent(screen.getByTestId("input-buy-date-1-picker"), "valueChange", {}, new Date(y, m - 1, d));
  }

  async function calculateTsmc(buyDate?: string) {
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    if (buyDate !== undefined) await pickBuyDate(buyDate);
    await pressCalculate();
  }

  /** 量到寬度後才畫 SVG */
  async function layoutChart(width = 320) {
    const chart = screen.getByTestId("candle-chart");
    await fireEvent(chart, "layout", { nativeEvent: { layout: { width, height: 220 } } });
    return chart;
  }

  /** 買入日 2026/10/05 前連續 n 個工作日，收盤都是 close */
  function daysBefore(n: number, close: number) {
    const out = [];
    const d = new Date(Date.UTC(2026, 9, 5));
    while (out.length < n) {
      d.setUTCDate(d.getUTCDate() - 1);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      out.unshift({ date: d.toISOString().slice(0, 10), open: close, high: close, low: close, close });
    }
    return out;
  }

  test("算完單檔：走勢卡預設 1 年折線＋成本線；沒填日期時提示可以填", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc();
    expect(await screen.findByText("- - 成本 500")).toBeTruthy();
    expect(screen.getByText(BUY_DATE_HINT)).toBeTruthy();
    expect(screen.getByLabelText("期間：1 年").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText("圖表樣式：折線").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText("收盤價")).toBeTruthy();
    await layoutChart();
    expect(screen.getByTestId("chart-close-line")).toBeTruthy();
    expect(screen.getByTestId("chart-pnl-zones")).toBeTruthy();
  });

  test("第一次看到：自動打開看圖說明；按「知道了」收起，下次不再自動打開", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc();
    expect(await screen.findByTestId("chart-guide")).toBeTruthy();
    expect(screen.getByText(/紅 K/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("知道了，收起說明"));
    expect(screen.queryByTestId("chart-guide")).toBeNull();
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(CHART_PREFS_KEY)) ?? "{}")).toMatchObject({ guideSeen: true }),
    );
    // 標題列的「怎麼看？」可以再打開
    await fireEvent.press(screen.getByLabelText("怎麼看這張圖"));
    expect(screen.getByTestId("chart-guide")).toBeTruthy();
  });

  test("看過說明的人：不自動打開", async () => {
    await AsyncStorage.setItem(CHART_PREFS_KEY, JSON.stringify({ guideSeen: true }));
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc();
    await screen.findByText("- - 成本 500");
    expect(screen.queryByTestId("chart-guide")).toBeNull();
  });

  test("填了買入日期：圖上標買入點，圖例顯示日期", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc("2026/10/05");
    expect(await screen.findByText("● 買入 2026/10/05")).toBeTruthy();

    expect(screen.queryByTestId("candle-buy-marker")).toBeNull();
    const chart = await layoutChart();
    expect(screen.getByTestId("candle-buy-marker")).toBeTruthy();
    expect(chart.props.accessibilityLabel).toContain("買入 2026/10/05");
    expect(chart.props.accessibilityLabel).toContain("成本 500");
  });

  test("買入日是週末：標在下一個交易日並說明", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc("2026/10/03");
    expect(await screen.findByText("● 買入 2026/10/03（非交易日，標在 2026/10/05）")).toBeTruthy();
  });

  test("買入日早於圖表範圍：說明而不是亂標", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc("2025/01/02");
    expect(await screen.findByText("買入日 2025/01/02 早於圖表範圍（目前顯示近 1 年）")).toBeTruthy();
  });

  test("買在高點還是低點（P2-09）：一句話結論＋比較區間說明，切期間跟著更新", async () => {
    // 買入價 500，買入前每天收 600 → 0% 的交易日低於買入價 → 低檔
    const spy = jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue([...daysBefore(300, 600), ...CANDLES.slice(1)]);
    await calculateTsmc("2026/10/05");
    const verdict = await screen.findByTestId("buy-verdict");
    expect(within(verdict).getByText("你買在近 1 年的低檔，買入價高於 0% 的交易日")).toBeTruthy();
    expect(within(verdict).getByText(/比較買入日前 1 年（2025\/10\/06–2026\/10\/02）共/)).toBeTruthy();
    // 要了買入日前 1 年那段的月份
    expect(spy.mock.calls[0][1]).toContain("2025-10");

    await fireEvent.press(screen.getByLabelText("期間：1 個月"));
    expect(await screen.findByText("你買在近 1 個月的低檔，買入價高於 0% 的交易日")).toBeTruthy();
  });

  test("比較區間交易日不到 20 天：不下結論", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc("2026/10/05");
    expect(await screen.findByText("資料不足，無法判斷")).toBeTruthy();
    expect(screen.queryByText(/你買在/)).toBeNull();
  });

  test("切成 K 棒、打開均線：圖例跟著換，偏好記在手機", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc();
    await screen.findByText("收盤價");
    await fireEvent.press(screen.getByLabelText("圖表樣式：K 棒"));
    expect(screen.getByText("紅 K 漲")).toBeTruthy();
    expect(screen.getByText("綠 K 跌")).toBeTruthy();
    expect(screen.queryByText("收盤價")).toBeNull();

    await fireEvent.press(screen.getByLabelText("均線"));
    expect(screen.getByText("5 日均線")).toBeTruthy();
    expect(screen.getByText("20 日均線")).toBeTruthy();
    await layoutChart();
    expect(screen.getByTestId("chart-moving-averages")).toBeTruthy();
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(CHART_PREFS_KEY)) ?? "{}")).toMatchObject({
        mode: "candle",
        showMa: true,
      }),
    );
  });

  test("點圖上某一天：顯示那天的開高低收與漲跌；前後按鈕可換天", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc();
    const detail = await screen.findByTestId("day-detail");
    // 預設最新一天：10/06 收 520，前一天 525 → ▼5（-0.95%）
    expect(within(detail).getByText("2026/10/06（最新）")).toBeTruthy();
    expect(within(detail).getByText("▼5.00（-0.95%）")).toBeTruthy();

    const chart = await layoutChart(320);
    // 繪圖區寬 320 − 52 = 268，三根各約 89px：x = 10 是第一根
    await fireEvent(chart, "responderGrant", { nativeEvent: { locationX: 10 } });
    expect(within(detail).getByText("2026/10/02")).toBeTruthy();
    expect(within(detail).getByText(/開 505 · 高 515 · 低 495/)).toBeTruthy();
    expect(screen.getByTestId("chart-crosshair")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("後一個交易日"));
    expect(within(detail).getByText("2026/10/05")).toBeTruthy();
    expect(within(detail).getByText("▲25.00（+5.00%）")).toBeTruthy();
  });

  test("K 線載入失敗：盈虧照樣顯示，說明原因與技術細節，可重試", async () => {
    const spy = jest
      .spyOn(candleSource, "getDailyCandles")
      .mockRejectedValueOnce(new PriceLoadError("歷史資料載入失敗（FinMind 回應 HTTP 402：超過上限；證交所回應 HTTP 503）"))
      .mockResolvedValueOnce(CANDLES);
    await calculateTsmc();
    expect(await screen.findByText(/查詢次數用完/)).toBeTruthy();
    expect(screen.getByText(/技術細節：.*HTTP 402/)).toBeTruthy();
    expect(screen.getByText("+20,000")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("重新載入 K 線"));
    expect(await screen.findByText("- - 成本 500")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("查不到股價資料：說明", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue([]);
    await calculateTsmc();
    expect(await screen.findByText(CANDLE_EMPTY)).toBeTruthy();
  });

  test("上櫃股票也有走勢圖（Story 019 的 candleSource）", async () => {
    await renderScreen();
    await typeStock("6488");
    await fillPriceAndShares("800", "1000");
    await pressCalculate();
    expect(await screen.findByText("- - 成本 800")).toBeTruthy();
    expect(screen.getByTestId("candle-chart")).toBeTruthy();
  });

  test("買入日期用日曆選：選好就收起日曆，欄位顯示日期", async () => {
    await renderScreen();
    await pickBuyDate("2026/10/05");
    expect(screen.getByText("2026/10/05")).toBeTruthy();
    expect(screen.queryByTestId("input-buy-date-1-picker")).toBeNull();
  });

  test("清除買入日期：圖上不標買入點", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pickBuyDate("2026/10/05");
    await fireEvent.press(screen.getByLabelText("清除買入日期"));
    await pressCalculate();
    expect(await screen.findByText(BUY_DATE_HINT)).toBeTruthy();
  });

  test("多檔比較時不顯示 K 線圖", async () => {
    const spy = jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2330", "500", "1000");
    await fillHolding(2, "2317", "200", "1000");
    await pressCalculate();
    expect(await screen.findByLabelText("比較結果")).toBeTruthy();
    expect(screen.queryByLabelText("K 線圖")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  test("買入日期會被記住：按計算後存起來", async () => {
    jest.spyOn(candleSource, "getDailyCandles").mockResolvedValue(CANDLES);
    await calculateTsmc("2026/10/05");
    await screen.findByText("● 買入 2026/10/05");
    expect(await holdingStore.load()).toEqual([
      { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/10/05" },
    ]);
  });

  test("重開 app：存過的買入日期帶回欄位", async () => {
    await holdingStore.save([{ symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/10/05" }]);
    await renderScreen();
    expect(await screen.findByText("2026/10/05")).toBeTruthy();
  });
});

describe("版本資訊（對應 docs/stories/018）", () => {
  test("最底部看得到版本，點開看得到詳細資訊與複製按鈕", async () => {
    await renderScreen();
    // Jest 跑的是 dev 模式，所以標示「開發版」；版本號由 jest-expo 的原生模組 mock 決定，不在這裡驗
    const badge = screen.getByLabelText("版本資訊");
    expect(within(badge).getByText(/^開發版（.+） · v/)).toBeTruthy();

    await fireEvent.press(badge);
    expect(screen.getByTestId("version-details")).toBeTruthy();
    expect(screen.getByText("執行環境")).toBeTruthy();
    expect(screen.getByLabelText("複製版本資訊")).toBeTruthy();
  });
});

describe("AI 解讀（對應 docs/stories/017）", () => {
  afterEach(() => {
    features.aiInsight = false;
    jest.restoreAllMocks();
  });

  async function calculateTsmcProfit() {
    await renderScreen();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByText("+20,000")).toBeTruthy();
  }

  test("開關關閉（預設）：算完也看不到「AI 解讀」按鈕", async () => {
    features.aiInsight = false;
    await calculateTsmcProfit();
    expect(screen.queryByLabelText("AI 解讀")).toBeNull();
    expect(screen.queryByTestId("insight-card")).toBeNull();
  });

  test("開關打開：還沒算之前沒有按鈕，算完才出現", async () => {
    features.aiInsight = true;
    await renderScreen();
    expect(screen.queryByLabelText("AI 解讀")).toBeNull();
    await typeStock("2330");
    await fillPriceAndShares("500", "1000");
    await pressCalculate();
    expect(await screen.findByLabelText("AI 解讀")).toBeTruthy();
  });

  test("按下「AI 解讀」：顯示解讀中，完成後顯示總結、觀察、風險提醒與免責聲明", async () => {
    features.aiInsight = true;
    let resolve: (value: typeof FAKE_INSIGHT) => void = () => {};
    const spy = jest
      .spyOn(insightProvider, "getInsight")
      .mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await calculateTsmcProfit();

    await fireEvent.press(screen.getByLabelText("AI 解讀"));
    expect(screen.getByTestId("insight-loading")).toBeTruthy();
    expect(screen.getByText("AI 解讀中…")).toBeTruthy();

    await act(async () => resolve(structuredClone(FAKE_INSIGHT)));
    expect(await screen.findByTestId("insight-card")).toBeTruthy();
    expect(screen.getByText(FAKE_INSIGHT.summary)).toBeTruthy();
    for (const text of FAKE_INSIGHT.observations) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(FAKE_INSIGHT.riskNote)).toBeTruthy();
    expect(screen.getByText("僅為數據解讀，不構成投資建議")).toBeTruthy();

    // 送出去的只有數字與代號、名稱
    const input = spy.mock.calls[0][0];
    expect(input.holdings).toEqual([
      { symbol: "2330", name: "台積電", shares: 1000, avgCost: 500, cost: 500_000, price: 520, pnl: 20_000, returnRate: 0.04 },
    ]);
    expect(input.total.pnl).toBe(20_000);
  });

  test("多檔比較：把每一檔與合計一起送去解讀", async () => {
    features.aiInsight = true;
    const spy = jest.spyOn(insightProvider, "getInsight");
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("新增一檔比較"));
    await fillHolding(1, "2317", "200", "1000");
    await fillHolding(2, "2330", "500", "1000");
    await pressCalculate();
    await fireEvent.press(await screen.findByLabelText("AI 解讀"));

    expect(await screen.findByTestId("insight-card")).toBeTruthy();
    const input = spy.mock.calls[0][0];
    expect(input.holdings.map((h) => h.symbol)).toEqual(["2330", "2317"]);
    expect(input.total).toEqual({ cost: 700_000, marketValue: 700_000, pnl: 0, returnRate: 0 });
  });

  test("後端沒開或連不到：顯示原因，按「重試 AI 解讀」成功後顯示解讀卡", async () => {
    features.aiInsight = true;
    jest
      .spyOn(insightProvider, "getInsight")
      .mockRejectedValueOnce(new InsightError("連不上 AI 解讀服務：提供服務的電腦可能還沒開（npm run backend:tunnel），請稍後再試"));
    await calculateTsmcProfit();

    await fireEvent.press(screen.getByLabelText("AI 解讀"));
    expect(await screen.findByText(/連不上 AI 解讀服務/)).toBeTruthy();
    expect(screen.queryByTestId("insight-card")).toBeNull();
    // 盈虧結果還在
    expect(screen.getByText("+20,000")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("重試 AI 解讀"));
    expect(await screen.findByTestId("insight-card")).toBeTruthy();
    expect(screen.queryByTestId("insight-error")).toBeNull();
  });

  test("太頻繁（429）：顯示後端給的訊息並可重試", async () => {
    features.aiInsight = true;
    jest
      .spyOn(insightProvider, "getInsight")
      .mockRejectedValueOnce(new InsightError("使用太頻繁，請 42 秒後再試"));
    await calculateTsmcProfit();
    await fireEvent.press(screen.getByLabelText("AI 解讀"));
    expect(await screen.findByText("使用太頻繁，請 42 秒後再試")).toBeTruthy();
    expect(screen.getByLabelText("重試 AI 解讀")).toBeTruthy();
  });

  test("重新計算：舊的解讀消失，要再按一次", async () => {
    features.aiInsight = true;
    await calculateTsmcProfit();
    await fireEvent.press(screen.getByLabelText("AI 解讀"));
    expect(await screen.findByTestId("insight-card")).toBeTruthy();

    await pressCalculate();
    expect(await screen.findByLabelText("AI 解讀")).toBeTruthy();
    expect(screen.queryByTestId("insight-card")).toBeNull();
  });
});
