import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import { spec37 } from "@/domain/ledgerTestData";
import type { Ledger, Transaction } from "@/domain/ledgerTypes";
import { replaySymbol } from "@/domain/position";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import { DATE_UNKNOWN_HINT, EditTransactionScreen, NewTransactionScreen } from "./TransactionFormScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const mockedParams = useLocalSearchParams as jest.Mock;

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

/** 固定「今天」：表單預設日期與 repository 的「不可晚於今天」都用這天 */
const now = () => new Date(2026, 9, 27, 10, 0, 0);

function ledgerOf(transactions: Transaction[]): Ledger {
  return { schemaVersion: 1, transactions, dividends: [], holdingSettings: [], settings: DEFAULT_USER_SETTINGS };
}

function makeRepository(transactions: Transaction[] = []): LedgerRepository {
  let seq = 0;
  return createMemoryLedgerRepository(ledgerOf(transactions), {
    now,
    newId: () => `new-${++seq}`,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedParams.mockReturnValue({});
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

async function renderNew(repository: LedgerRepository, params: Record<string, string> = {}) {
  mockedParams.mockReturnValue(params);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NewTransactionScreen repository={repository} now={now} />
    </SafeAreaProvider>,
  );
  await screen.findByLabelText("股票代號或名稱");
}

async function renderEdit(repository: LedgerRepository, id: string) {
  mockedParams.mockReturnValue({ id });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <EditTransactionScreen repository={repository} now={now} />
    </SafeAreaProvider>,
  );
}

async function pickStock(symbol: string) {
  const input = screen.getByLabelText("股票代號或名稱");
  await fireEvent(input, "focus");
  await fireEvent.changeText(input, symbol);
  await fireEvent.press(await screen.findByTestId(`input-stock-suggestion-${symbol}`));
}

async function fillTrade(side: "買入" | "賣出", price: string, shares: string) {
  await fireEvent.press(screen.getByLabelText(side));
  await fireEvent.changeText(screen.getByLabelText("成交價"), price);
  await fireEvent.changeText(screen.getByLabelText("股數"), shares);
}

function fieldValue(label: string): string {
  return screen.getByLabelText(label).props.value;
}

function position(repository: LedgerRepository, symbol = "2330") {
  const ledger = repository.getSnapshot() as Ledger;
  return replaySymbol(symbol, ledger.transactions, ledger.dividends).state;
}

describe("新增交易（對應 docs/stories/009）", () => {
  test("3.7 步驟 1–3 連續新增後，持股與已實現損益完全符合", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await pickStock("2330");

    await fillTrade("買入", "600", "1000");
    expect(fieldValue("手續費")).toBe("855");
    expect(screen.getByText("600,855 元")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("儲存並繼續新增"));
    await screen.findByTestId("saved-message");

    await fillTrade("買入", "500", "1000");
    expect(fieldValue("手續費")).toBe("712");
    await fireEvent.press(screen.getByLabelText("儲存並繼續新增"));
    expect(await screen.findByText("目前持有 2,000 股・平均成本 550.78")).toBeTruthy();

    await fillTrade("賣出", "650", "500");
    expect(fieldValue("手續費")).toBe("463");
    expect(fieldValue("證交稅")).toBe("975");
    expect(screen.getByText("預估拿回總金額")).toBeTruthy();
    expect(screen.getByText("323,562 元")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("儲存"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const state = position(repository);
    expect(state.shares).toBe(1500);
    expect(state.realizedPnl).toBeCloseTo(48170.25, 6);
    expect(state.costBasis).toBeCloseTo(826175.25, 6);
    expect(repository.getSnapshot()?.transactions.every((t) => t.source === "manual")).toBe(true);
  });

  test("改手續費為 300 後再改股數，手續費維持 300；按「重新計算」才回到自動", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await pickStock("2330");
    await fillTrade("買入", "600", "1000");
    expect(screen.queryByLabelText("重新計算手續費與證交稅")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("手續費"), "300");
    await fireEvent.changeText(screen.getByLabelText("股數"), "2000");
    expect(fieldValue("手續費")).toBe("300");
    expect(screen.getByText("1,200,300 元")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("重新計算手續費與證交稅"));
    expect(fieldValue("手續費")).toBe("1710");

    await fireEvent.changeText(screen.getByLabelText("手續費"), "300");
    await fireEvent.press(screen.getByLabelText("儲存"));
    // P2-09「新增買入交易後的結果提示」：存好新的買入，換到這筆的「買在高點還是低點」
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: "/buy-point",
        params: expect.objectContaining({ symbol: "2330", price: "600", saved: "1" }),
      }),
    );
    expect(router.back).not.toHaveBeenCalled();
    expect(repository.getSnapshot()?.transactions[0]).toMatchObject({ fee: 300, feeOverridden: true });
  });

  test("只改證交稅：手續費仍會跟著股數重算，證交稅維持使用者的數字", async () => {
    const repository = makeRepository([spec37.step1]);
    await renderNew(repository);
    await pickStock("2330");
    await fillTrade("賣出", "650", "500");
    await fireEvent.changeText(screen.getByLabelText("證交稅"), "0");
    await fireEvent.changeText(screen.getByLabelText("股數"), "1000");
    expect(fieldValue("證交稅")).toBe("0");
    expect(fieldValue("手續費")).toBe("926");
  });

  test("存檔後選「繼續新增」會留在表單，證券欄位保留，其他欄位清空", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await pickStock("2330");
    await fillTrade("賣出", "600", "1000");
    await fireEvent.press(screen.getByLabelText("買入"));
    await fireEvent.changeText(screen.getByLabelText("備註"), "第一筆");
    await fireEvent.press(screen.getByLabelText("儲存並繼續新增"));

    expect(await screen.findByText("已儲存：買入 台積電 1,000 股，可以繼續輸入下一筆")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(fieldValue("股票代號或名稱")).toBe("台積電（2330）");
    expect(fieldValue("成交價")).toBe("");
    expect(fieldValue("股數")).toBe("");
    expect(fieldValue("手續費")).toBe("");
    expect(fieldValue("備註")).toBe("");
    expect(screen.getByLabelText("買入").props.accessibilityState.checked).toBe(true);
    expect(repository.getSnapshot()?.transactions).toHaveLength(1);
  });

  test("帶 ?symbol=2330 進來，證券已經選好，並顯示目前持股", async () => {
    const repository = makeRepository([spec37.step1, spec37.step2, spec37.step3]);
    await renderNew(repository, { symbol: "2330" });
    expect(fieldValue("股票代號或名稱")).toBe("台積電（2330）");
    expect(screen.getByText("目前持有 1,500 股・平均成本 550.78")).toBeTruthy();
  });

  test("帶的代號不在清單裡：放進搜尋框讓使用者自己選", async () => {
    await renderNew(makeRepository(), { symbol: "9999" });
    expect(fieldValue("股票代號或名稱")).toBe("9999");
  });

  test("持有 1500 股時賣出 2000 股：被拒絕，股數欄位提示持有股數", async () => {
    const repository = makeRepository([spec37.step1, spec37.step2, spec37.step3]);
    await renderNew(repository, { symbol: "2330" });
    await fillTrade("賣出", "650", "2000");
    await fireEvent.press(screen.getByLabelText("儲存"));
    expect(await screen.findByText("賣出股數超過持有股數（1,500 股）")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(repository.getSnapshot()?.transactions).toHaveLength(3);
  });

  test("沒選股票、沒填價格與股數：各欄位提示", async () => {
    await renderNew(makeRepository());
    await fireEvent.press(screen.getByLabelText("儲存"));
    expect(screen.getByText("請選擇股票")).toBeTruthy();
    expect(screen.getByText("成交價必須大於 0")).toBeTruthy();
    expect(screen.getByText("股數必須是大於 0 的整數")).toBeTruthy();
  });

  test("全形數字與千分位逗號會自動轉成半形", async () => {
    await renderNew(makeRepository());
    await pickStock("2330");
    await fillTrade("買入", "６００", "１,０００");
    expect(fieldValue("成交價")).toBe("600");
    expect(fieldValue("股數")).toBe("1000");
    expect(fieldValue("手續費")).toBe("855");
  });

  test("日期預設今天；買入時沒有證交稅欄位", async () => {
    await renderNew(makeRepository());
    expect(screen.getByLabelText("交易日期").props.accessibilityValue).toEqual({ text: "2026/10/27" });
    expect(screen.queryByLabelText("證交稅")).toBeNull();
    expect(screen.getByText("預估付出總金額")).toBeTruthy();
  });
});

describe("編輯與刪除交易（對應 docs/stories/009）", () => {
  test("帶入原本的欄位；改價格後手續費自動重算並存回同一筆", async () => {
    const repository = makeRepository([spec37.step1, spec37.step2, spec37.step3]);
    await renderEdit(repository, "step2");
    expect(await screen.findByDisplayValue("台積電（2330）")).toBeTruthy();
    expect(fieldValue("成交價")).toBe("500");
    expect(fieldValue("股數")).toBe("1000");
    expect(fieldValue("手續費")).toBe("712");
    expect(screen.queryByLabelText("儲存並繼續新增")).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("成交價"), "400");
    expect(fieldValue("手續費")).toBe("570");
    await fireEvent.press(screen.getByLabelText("儲存"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const ledger = repository.getSnapshot() as Ledger;
    expect(ledger.transactions).toHaveLength(3);
    expect(ledger.transactions.find((t) => t.id === "step2")).toMatchObject({ price: 400, fee: 570 });
  });

  test("刪除步驟 2 的買入：二次確認後刪除成功並重算", async () => {
    const repository = makeRepository([spec37.step1, spec37.step2, spec37.step3]);
    await renderEdit(repository, "step2");
    await fireEvent.press(await screen.findByLabelText("刪除這筆交易"));

    // 第一次按只會跳出確認，還沒刪
    expect(screen.getByText(/確定要刪除 2026\/02\/05 買入 台積電 1,000 股這筆交易嗎/)).toBeTruthy();
    expect(repository.getSnapshot()?.transactions).toHaveLength(3);

    await fireEvent.press(screen.getByLabelText("確定刪除"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const state = position(repository);
    expect(state.shares).toBe(500);
    expect(repository.getSnapshot()?.transactions.map((t) => t.id)).toEqual(["step1", "step3"]);
  });

  test("刪除時按「取消」：不刪", async () => {
    const repository = makeRepository([spec37.step1]);
    await renderEdit(repository, "step1");
    await fireEvent.press(await screen.findByLabelText("刪除這筆交易"));
    await fireEvent.press(screen.getByLabelText("取消刪除"));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    expect(repository.getSnapshot()?.transactions).toHaveLength(1);
  });

  test("刪除步驟 1 和 2：步驟 3 會變成賣出超過持股，刪除被拒絕並說是哪一筆", async () => {
    const repository = makeRepository([spec37.step1, spec37.step2, spec37.step3]);
    expect((await repository.deleteTransaction("step1")).ok).toBe(true);

    await renderEdit(repository, "step2");
    await fireEvent.press(await screen.findByLabelText("刪除這筆交易"));
    await fireEvent.press(screen.getByLabelText("確定刪除"));

    expect(
      await screen.findByText("2026-03-05 賣出 500 股的那筆交易會超過當時持有股數（0 股），請先修改或刪除那筆賣出"),
    ).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(repository.getSnapshot()?.transactions.map((t) => t.id)).toEqual(["step2", "step3"]);
  });

  test("把買入改少到讓之後的賣出不夠賣：拒絕並說是哪一筆", async () => {
    const repository = makeRepository([spec37.step2, spec37.step3]);
    await renderEdit(repository, "step2");
    await fireEvent.changeText(await screen.findByLabelText("股數"), "100");
    await fireEvent.press(screen.getByLabelText("儲存"));
    expect(await screen.findByText(/2026-03-05 賣出 500 股的那筆交易會超過當時持有股數（100 股）/)).toBeTruthy();
    expect(repository.getSnapshot()?.transactions.find((t) => t.id === "step2")?.shares).toBe(1000);
  });

  test("手動改過手續費的交易：打開時顯示「重新計算」，改股數不覆蓋手續費", async () => {
    const tx = { ...spec37.step1, id: "manual-fee", fee: 300, feeOverridden: true };
    await renderEdit(makeRepository([tx]), "manual-fee");
    expect(await screen.findByLabelText("重新計算手續費與證交稅")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("股數"), "2000");
    expect(fieldValue("手續費")).toBe("300");
  });

  test("舊版轉入、日期不明的交易：提示補日期", async () => {
    const tx = { ...spec37.step1, id: "legacy", tradeDateUnknown: true };
    await renderEdit(makeRepository([tx]), "legacy");
    expect(await screen.findByText(DATE_UNKNOWN_HINT)).toBeTruthy();
  });

  test("找不到這筆交易：顯示提示與回上一頁", async () => {
    await renderEdit(makeRepository([spec37.step1]), "nope");
    expect(await screen.findByText("找不到這筆交易，可能已經被刪除")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("回上一頁"));
    expect(router.back).toHaveBeenCalled();
  });

  test("沒有上一頁（從外部連結直接打開）時，存檔後回首頁", async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    const repository = makeRepository([spec37.step1]);
    await renderEdit(repository, "step1");
    await fireEvent.press(await screen.findByLabelText("儲存"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});

describe("從券商截圖匯入的入口（對應 docs/stories/015）", () => {
  test("開關關閉（預設）：新增交易頁沒有入口", async () => {
    await renderNew(makeRepository());
    expect(screen.queryByLabelText("從券商截圖匯入")).toBeNull();
  });

  test("開關打開：新增模式有入口，按了進匯入頁；編輯模式沒有", async () => {
    const repository = makeRepository([spec37.step1]);
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <StaticFeatureFlags flags={{ screenshotImport: true }}>
          <NewTransactionScreen repository={repository} now={now} />
        </StaticFeatureFlags>
      </SafeAreaProvider>,
    );
    await fireEvent.press(await screen.findByLabelText("從券商截圖匯入"));
    expect(router.push).toHaveBeenCalledWith("/import");

    mockedParams.mockReturnValue({ id: "step1" });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <StaticFeatureFlags flags={{ screenshotImport: true }}>
          <EditTransactionScreen repository={repository} now={now} />
        </StaticFeatureFlags>
      </SafeAreaProvider>,
    );
    await screen.findByLabelText("刪除這筆交易");
    expect(screen.queryByLabelText("從券商截圖匯入")).toBeNull();
  });
});
