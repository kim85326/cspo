import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import { makeDividend, makeTx } from "@/domain/ledgerTestData";
import type { Dividend, Ledger, Transaction } from "@/domain/ledgerTypes";
import { replaySymbol } from "@/domain/position";
import { EditDividendScreen, NewDividendScreen } from "./DividendFormScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const mockedParams = useLocalSearchParams as jest.Mock;

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

/** 固定「今天」：表單預設的除權息日就是這天 */
const now = () => new Date(2026, 9, 28, 10, 0, 0);

/** 1000 股、成本 100,000（M-03 AC 的起點） */
const buy = makeTx({ id: "buy", side: "buy", tradeDate: "2026-01-02", price: 100, shares: 1000, fee: 0 });

function makeRepository(transactions: Transaction[] = [buy], dividends: Dividend[] = []): LedgerRepository {
  let seq = 0;
  const ledger: Ledger = { schemaVersion: 1, transactions, dividends, holdingSettings: [], settings: DEFAULT_USER_SETTINGS };
  return createMemoryLedgerRepository(ledger, { now, newId: () => `new-${++seq}` });
}

beforeEach(() => {
  jest.clearAllMocks();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

async function renderNew(repository: LedgerRepository, symbol = "2330") {
  mockedParams.mockReturnValue({ symbol });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NewDividendScreen repository={repository} now={now} />
    </SafeAreaProvider>,
  );
  await screen.findByLabelText("實際入帳金額");
}

async function renderEdit(repository: LedgerRepository, id: string) {
  mockedParams.mockReturnValue({ id });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <EditDividendScreen repository={repository} now={now} />
    </SafeAreaProvider>,
  );
}

function state(repository: LedgerRepository) {
  const ledger = repository.getSnapshot() as Ledger;
  return replaySymbol("2330", ledger.transactions, ledger.dividends).state;
}

describe("記錄股利（M-03，對應 docs/stories/012）", () => {
  test("從持股頁進來：證券固定；新增 5,000 元現金股利 → 已入帳、手動，已領股利 +5,000，持有成本不變", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    // 名稱要等股票清單載完才換上
    await waitFor(() => expect(screen.getByTestId("dividend-symbol")).toHaveTextContent("台積電（2330）"));
    expect(screen.getByText("除權息日前一天持有 1,000 股")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("實際入帳金額"), "5,000");
    await fireEvent.press(screen.getByLabelText("儲存"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dividends).toEqual([
      expect.objectContaining({ symbol: "2330", type: "cash", exDate: "2026-10-28", cashAmount: 5000, status: "received", source: "manual" }),
    ]);
    expect(state(repository)).toEqual(expect.objectContaining({ cashDividends: 5000, costBasis: 100000 }));
  });

  test("股票股利 100 股 → 持股 1100 股，平均成本 90.91", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await fireEvent.press(screen.getByLabelText("股票股利"));
    await fireEvent.changeText(screen.getByLabelText("配發股數"), "100");
    await fireEvent.press(screen.getByLabelText("儲存"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const s = state(repository);
    expect(s.shares).toBe(1100);
    expect((s.costBasis / s.shares).toFixed(2)).toBe("90.91");
  });

  test("沒填金額：欄位下方顯示錯誤，不存檔", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await fireEvent.press(screen.getByLabelText("儲存"));
    expect(await screen.findByText("股利金額必須大於 0")).toBeTruthy();
    expect(repository.getSnapshot()?.dividends).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  test("除權息日沒有持股的股票股利 → 拒絕，錯誤標在除權息日", async () => {
    const repository = makeRepository([]);
    await renderNew(repository);
    expect(screen.getByText("除權息日前一天沒有持股")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("股票股利"));
    await fireEvent.changeText(screen.getByLabelText("配發股數"), "100");
    await fireEvent.press(screen.getByLabelText("儲存"));
    expect(await screen.findByText("除權息日當時沒有持股，請確認日期")).toBeTruthy();
    expect(repository.getSnapshot()?.dividends).toEqual([]);
  });
});

describe("編輯、刪除股利", () => {
  test("手動紀錄：改金額存檔", async () => {
    const manual = makeDividend({ id: "m1", type: "cash", exDate: "2026-07-01", cashAmount: 3000 });
    const repository = makeRepository([buy], [manual]);
    await renderEdit(repository, "m1");
    const input = await screen.findByLabelText("實際入帳金額");
    expect(input.props.value).toBe("3000");
    await fireEvent.changeText(input, "2943");
    await fireEvent.press(screen.getByLabelText("儲存"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dividends[0]).toEqual(expect.objectContaining({ cashAmount: 2943, source: "manual" }));
    expect(repository.getSnapshot()?.dividends[0].userModified).toBeUndefined();
  });

  test("刪除股票股利會讓之後賣出不足 → 拒絕並說明，紀錄還在", async () => {
    const stock = makeDividend({ id: "s1", type: "stock", exDate: "2026-07-01", stockShares: 100 });
    const sell = makeTx({ side: "sell", tradeDate: "2026-08-01", price: 110, shares: 1100, fee: 172, tax: 363 });
    const repository = makeRepository([buy, sell], [stock]);
    await renderEdit(repository, "s1");
    await fireEvent.press(await screen.findByLabelText("刪除這筆股利"));
    await fireEvent.press(screen.getByLabelText("確定刪除"));
    expect(
      await screen.findByText("2026-08-01 賣出 1,100 股的那筆交易會超過當時持有股數（1,000 股），請先修改或刪除那筆賣出"),
    ).toBeTruthy();
    expect(repository.getSnapshot()?.dividends).toHaveLength(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  test("找不到這筆股利", async () => {
    await renderEdit(makeRepository(), "nope");
    expect(await screen.findByText("找不到這筆股利，可能已經被刪除")).toBeTruthy();
  });
});

describe("自動帶入的股利（P2-03）", () => {
  const auto = makeDividend({
    id: "a1",
    type: "cash",
    exDate: "2026-10-20",
    payDate: "2026-11-20",
    cashAmount: 3000,
    status: "estimated",
    source: "auto",
  });

  test("顯示預估說明；類型、除權息日不能改；改金額 → 不再自動更新", async () => {
    const repository = makeRepository([buy], [auto]);
    await renderEdit(repository, "a1");
    expect(await screen.findByTestId("auto-notice")).toHaveTextContent(/預估即將入帳，發放日 2026\/11\/20 後自動轉為已入帳/);
    expect(screen.queryByLabelText("股利類型")).toBeNull();
    expect(screen.queryByTestId("input-ex-date")).toBeNull();
    expect(screen.getByText("除權息日前一天持有 1,000 股")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("實際入帳金額"), "2937");
    await fireEvent.press(screen.getByLabelText("儲存"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dividends[0]).toEqual(
      expect.objectContaining({ cashAmount: 2937, status: "estimated", userModified: true }),
    );
  });

  test("確認已入帳 → received，算進已領股利", async () => {
    const repository = makeRepository([buy], [auto]);
    await renderEdit(repository, "a1");
    expect(state(repository).cashDividends).toBe(0);
    await fireEvent.press(await screen.findByLabelText("確認已入帳"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dividends[0]).toEqual(expect.objectContaining({ status: "received", userModified: true }));
    expect(state(repository).cashDividends).toBe(3000);
  });

  test("刪除 → 記下來，之後不再自動建立", async () => {
    const repository = makeRepository([buy], [auto]);
    await renderEdit(repository, "a1");
    await fireEvent.press(await screen.findByLabelText("刪除這筆股利"));
    expect(screen.getByTestId("delete-confirm")).toHaveTextContent(/自動帶入不會再建立這一筆/);
    await fireEvent.press(screen.getByLabelText("確定刪除"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dividends).toEqual([]);
    expect(repository.getSnapshot()?.dismissedAutoDividends).toEqual(["2330|2026-10-20|cash"]);
  });

  test("已入帳的自動股利不顯示「確認已入帳」", async () => {
    const repository = makeRepository([buy], [{ ...auto, status: "received" }]);
    await renderEdit(repository, "a1");
    expect(await screen.findByTestId("auto-notice")).toHaveTextContent(/已入帳（發放日 2026\/11\/20）/);
    expect(screen.queryByLabelText("確認已入帳")).toBeNull();
  });
});
