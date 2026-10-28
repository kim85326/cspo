import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Features } from "@/config/features";
import { createFakeHoldingRecognizer, FAKE_EXTRACTION } from "@/data/fakeHoldingRecognizer";
import { fakeStockDirectory } from "@/data/fakeStockDirectory";
import type { StockDirectory } from "@/data/StockDirectory";
import { RecognizeError, type HoldingRecognizer } from "@/data/HoldingRecognizer";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import type { ExtractionResult } from "@/domain/holdingExtract";
import { IMPORT_NOTE } from "@/domain/importTransactions";
import { makeTx } from "@/domain/ledgerTestData";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import ImportScreen, { PRIVACY_NOTE } from "./ImportScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  // 導頁在測試裡看不到，改成畫出目的地，方便斷言
  Redirect: ({ href }: { href: string }) => {
    const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>{`redirect:${href}`}</MockText>;
  },
}));

// 相簿與相機是原生功能，Jest 裡換成假的：預設有權限、選到一張 PNG。
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

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

/** 固定「今天」：建倉日期預設值與「不可晚於今天」都用這天 */
const now = () => new Date(2026, 9, 28, 10, 0, 0);

let features: Partial<Features> = {};

beforeEach(() => {
  jest.clearAllMocks();
  features = { screenshotImport: true };
});

function makeRepository(ledger = emptyLedger()): LedgerRepository {
  let seq = 0;
  return createMemoryLedgerRepository(ledger, { now, newId: () => `new-${++seq}` });
}

async function renderScreen(
  repository: LedgerRepository,
  recognizer: HoldingRecognizer = createFakeHoldingRecognizer(),
) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <StaticFeatureFlags flags={features}>
        <ImportScreen repository={repository} recognizer={recognizer} stockDirectory={fakeStockDirectory} now={now} />
      </StaticFeatureFlags>
    </SafeAreaProvider>,
  );
}

async function importFromLibrary() {
  await fireEvent.press(screen.getByTestId("button-import-screenshot"));
  await fireEvent.press(await screen.findByLabelText("從相簿選"));
}

function row(n: number) {
  return within(screen.getByTestId(`import-row-${n}`));
}

function transactions(repository: LedgerRepository) {
  return repository.getSnapshot()?.transactions ?? [];
}

describe("從截圖匯入成交易（對應 docs/stories/015）", () => {
  test("匯入兩檔：核對畫面列出兩檔（1 張換成 1000 股），按匯入建立兩筆買入，回首頁", async () => {
    const repository = makeRepository();
    await renderScreen(repository);
    expect(screen.getByText(PRIVACY_NOTE)).toBeTruthy();
    await importFromLibrary();

    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(row(2).getByDisplayValue("鴻海（2317）")).toBeTruthy();
    expect(row(1).getByDisplayValue("500")).toBeTruthy();
    expect(row(2).getByDisplayValue("200")).toBeTruthy();
    expect(row(2).getByDisplayValue("1000")).toBeTruthy();
    expect(row(1).getByText("2026/10/28")).toBeTruthy();
    expect(screen.queryByText("請確認")).toBeNull();

    await fireEvent.press(screen.getByLabelText("匯入 2 筆交易"));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith("/"));
    expect(transactions(repository).map((t) => [t.symbol, t.side, t.tradeDate, t.price, t.shares, t.fee, t.source, t.note])).toEqual([
      ["2330", "buy", "2026-10-28", 500, 1000, 0, "import", IMPORT_NOTE],
      ["2317", "buy", "2026-10-28", 200, 1000, 0, "import", IMPORT_NOTE],
    ]);
    expect(transactions(repository).every((t) => t.feeOverridden)).toBe(true);
  });

  test("辨識比股票清單先完成：等清單到了再對，不會每一檔都對不到", async () => {
    let listReady: () => void = () => {};
    const slowDirectory: StockDirectory = {
      getAll: () =>
        new Promise((resolve) => {
          listReady = () => void fakeStockDirectory.getAll().then(resolve);
        }),
    };
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <StaticFeatureFlags flags={features}>
          <ImportScreen repository={makeRepository()} recognizer={createFakeHoldingRecognizer()} stockDirectory={slowDirectory} now={now} />
        </StaticFeatureFlags>
      </SafeAreaProvider>,
    );
    await importFromLibrary();
    await act(async () => {
      listReady();
    });
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.getByDisplayValue("鴻海（2317）")).toBeTruthy();
    expect(screen.queryByText(/清單裡找不到/)).toBeNull();
  });

  test("拍照也能匯入", async () => {
    await renderScreen(makeRepository());
    await fireEvent.press(screen.getByTestId("button-import-screenshot"));
    await fireEvent.press(await screen.findByLabelText("拍照"));
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
  });

  test("可以改股數、刪掉一檔；匯入的就是改過的", async () => {
    const repository = makeRepository();
    await renderScreen(repository);
    await importFromLibrary();
    await screen.findByDisplayValue("台積電（2330）");

    await fireEvent.press(screen.getByLabelText("刪除第 2 檔"));
    expect(screen.queryByTestId("import-row-2")).toBeNull();
    await fireEvent.changeText(row(1).getByLabelText("股數"), "1,500");

    await fireEvent.press(screen.getByLabelText("匯入 1 筆交易"));
    await waitFor(() => expect(transactions(repository)).toHaveLength(1));
    expect(transactions(repository)[0]).toMatchObject({ symbol: "2330", shares: 1500 });
  });

  test("有欄位為空：紅字標出來，匯入按鈕不能按；補齊後可以按", async () => {
    const repository = makeRepository();
    const recognizer = createFakeHoldingRecognizer({
      holdings: [{ symbol: "2330", shares: "1000", confidence: "low" }],
      warnings: [],
    });
    await renderScreen(repository, recognizer);
    await importFromLibrary();

    expect(await screen.findByText("請輸入平均成本")).toBeTruthy();
    expect(screen.getByLabelText("平均成本 請確認")).toBeTruthy();
    expect(screen.getByLabelText("股數 請確認")).toBeTruthy();
    expect(screen.getByLabelText("匯入 1 筆交易")).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("平均成本"), "505.5");
    expect(screen.queryByText("請輸入平均成本")).toBeNull();
    expect(screen.queryByLabelText("平均成本 請確認")).toBeNull();
    expect(screen.getByLabelText("匯入 1 筆交易")).toBeEnabled();
  });

  test("代號不在證券清單：該列標錯，不能匯入；從清單選了就可以", async () => {
    const recognizer = createFakeHoldingRecognizer({
      holdings: [{ name: "不存在公司", buyPrice: "10", shares: "100", confidence: "high" }],
      warnings: [],
    });
    await renderScreen(makeRepository(), recognizer);
    await importFromLibrary();

    expect(await screen.findByText("清單裡找不到「不存在公司」，請從清單選擇正確的股票")).toBeTruthy();
    expect(screen.getByLabelText("股票代號或名稱 請確認")).toBeTruthy();
    expect(screen.getByLabelText("匯入 1 筆交易")).toBeDisabled();

    const input = screen.getByLabelText("股票代號或名稱");
    await fireEvent(input, "focus");
    await fireEvent.changeText(input, "2454");
    await fireEvent.press(await screen.findByTestId("input-stock-1-suggestion-2454"));
    expect(screen.getByLabelText("匯入 1 筆交易")).toBeEnabled();
  });

  test("再加一張截圖：接在後面；兩張都有台積電時第二個標錯，刪掉才能匯入", async () => {
    const repository = makeRepository();
    await renderScreen(repository);
    await importFromLibrary();
    await screen.findByDisplayValue("台積電（2330）");

    expect(screen.getByLabelText("再加一張截圖")).toBeTruthy();
    await importFromLibrary();
    await waitFor(() => expect(screen.getByTestId("import-row-4")).toBeTruthy());
    expect(row(3).getByText("和第 1 檔都是台積電（2330），請刪掉重複的那一檔")).toBeTruthy();
    expect(screen.getByLabelText("匯入 4 筆交易")).toBeDisabled();

    await fireEvent.press(screen.getByLabelText("刪除第 4 檔"));
    await fireEvent.press(screen.getByLabelText("刪除第 3 檔"));
    expect(screen.getByLabelText("匯入 2 筆交易")).toBeEnabled();
  });

  test("記帳本已經有這檔：提醒會再加一筆買入，但可以匯入", async () => {
    const repository = makeRepository({
      ...emptyLedger(),
      transactions: [makeTx({ side: "buy", price: 480, shares: 2000, tradeDate: "2026-01-02" })],
    });
    await renderScreen(repository);
    await importFromLibrary();

    expect(await screen.findByTestId("import-held-1")).toHaveTextContent(/記帳本裡已經有這檔 2,000 股/);
    expect(screen.queryByTestId("import-held-2")).toBeNull();
    await fireEvent.press(screen.getByLabelText("匯入 2 筆交易"));
    await waitFor(() => expect(transactions(repository)).toHaveLength(3));
  });

  test("按下匯入前取消：不寫入任何資料", async () => {
    const repository = makeRepository();
    await renderScreen(repository);
    await importFromLibrary();
    await screen.findByDisplayValue("台積電（2330）");

    await fireEvent.press(screen.getByLabelText("取消匯入"));
    expect(router.back).toHaveBeenCalled();
    expect(transactions(repository)).toEqual([]);
  });

  test("寫入失敗：顯示原因，記帳本一筆都沒新增，核對內容還在", async () => {
    const repository = makeRepository();
    jest
      .spyOn(repository, "addTransactions")
      .mockResolvedValueOnce({ ok: false, error: { code: "saveFailed", message: "存檔失敗，請再試一次" } });
    await renderScreen(repository);
    await importFromLibrary();
    await screen.findByDisplayValue("台積電（2330）");

    await fireEvent.press(screen.getByLabelText("匯入 2 筆交易"));
    expect(await screen.findByText("存檔失敗，請再試一次")).toBeTruthy();
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(transactions(repository)).toEqual([]);
    expect(screen.getByDisplayValue("鴻海（2317）")).toBeTruthy();
  });

  test("辨識中顯示「辨識中…」，按鈕不能再按", async () => {
    let finish: (value: ExtractionResult) => void = () => {};
    const recognizer = createFakeHoldingRecognizer(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderScreen(makeRepository(), recognizer);
    await importFromLibrary();

    expect(await screen.findByText("辨識中…")).toBeTruthy();
    expect(screen.getByTestId("button-import-screenshot")).toBeDisabled();

    await act(async () => {
      finish(structuredClone(FAKE_EXTRACTION));
    });
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.queryByText("辨識中…")).toBeNull();
  });

  test("辨識失敗：顯示可重試的錯誤，不寫入；重試成功後列出", async () => {
    const recognizer = createFakeHoldingRecognizer();
    const spy = jest.spyOn(recognizer, "recognize").mockRejectedValueOnce(new RecognizeError("連不上辨識服務"));
    const repository = makeRepository();
    await renderScreen(repository, recognizer);
    await importFromLibrary();

    expect(await screen.findByText("連不上辨識服務")).toBeTruthy();
    expect(screen.queryByTestId("import-row-1")).toBeNull();
    expect(transactions(repository)).toEqual([]);

    spy.mockRestore();
    await fireEvent.press(screen.getByLabelText("重試辨識"));
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(screen.queryByText("連不上辨識服務")).toBeNull();
  });

  test("辨識不到任何持股：顯示錯誤，沒有任何一列", async () => {
    const recognizer = createFakeHoldingRecognizer({ holdings: [], warnings: ["這不是持股畫面"] });
    await renderScreen(makeRepository(), recognizer);
    await importFromLibrary();
    expect(await screen.findByText(/辨識不到任何持股/)).toBeTruthy();
    expect(screen.queryByTestId("import-row-1")).toBeNull();
  });

  test("相簿權限被拒：提示去設定開啟，不開相簿", async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: ImagePicker.PermissionStatus.DENIED,
      expires: "never",
      accessPrivileges: "none",
    });
    await renderScreen(makeRepository());
    await importFromLibrary();
    expect(await screen.findByText(/沒有相簿權限/)).toBeTruthy();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  test("功能開關關閉：導回首頁", async () => {
    features = { screenshotImport: false };
    await renderScreen(makeRepository());
    expect(screen.getByText("redirect:/")).toBeTruthy();
  });
});
