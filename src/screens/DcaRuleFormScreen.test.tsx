import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { CandleSource } from "@/data/CandleSource";
import { runDcaCatchUp } from "@/data/dcaRules";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { DcaRule, Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import { useDcaPlan } from "@/hooks/useDcaPlan";
import { EditDcaRuleScreen, feeDescription, NewDcaRuleScreen } from "./DcaRuleFormScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("@/hooks/useDcaPlan", () => ({ useDcaPlan: jest.fn() }));

const mockedParams = useLocalSearchParams as jest.Mock;
const mockedPlan = useDcaPlan as jest.Mock;

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const now = () => new Date(2026, 9, 28, 20, 0, 0);

const RULE: DcaRule = {
  id: "dca-1",
  symbol: "0050",
  amount: 5000,
  dayOfMonth: 6,
  startDate: "2026-08-01",
  enabled: true,
  handledPeriods: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const candles: CandleSource = {
  async getDailyCandles() {
    return [
      { date: "2026-08-06", open: 180, high: 180, low: 180, close: 180 },
      { date: "2026-09-07", open: 185, high: 185, low: 185, close: 185 },
      { date: "2026-10-06", open: 190, high: 190, low: 190, close: 190 },
    ];
  },
};

const quote180: PriceSource = { getQuote: async (symbol) => ({ symbol, name: "元大台灣50", price: 180 }) };

function makeRepository(ledger: Ledger = emptyLedger()): LedgerRepository {
  return createMemoryLedgerRepository(ledger, { now });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedParams.mockReturnValue({});
  mockedPlan.mockReturnValue({ unlimited: true, loaded: true, showPlan: false });
});

async function renderNew(repository: LedgerRepository) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NewDcaRuleScreen repository={repository} candleSource={candles} priceSource={quote180} now={now} />
    </SafeAreaProvider>,
  );
}

async function renderEdit(repository: LedgerRepository, id: string) {
  mockedParams.mockReturnValue({ id });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <EditDcaRuleScreen repository={repository} candleSource={candles} priceSource={quote180} now={now} />
    </SafeAreaProvider>,
  );
}

async function pickStock(symbol: string) {
  const input = await screen.findByLabelText("股票代號或名稱");
  await fireEvent(input, "focus");
  await fireEvent.changeText(input, symbol);
  await fireEvent.press(await screen.findByTestId(`input-stock-suggestion-${symbol}`));
}

describe("新增定期定額（Story 024）", () => {
  test("填好證券、金額、扣款日 → 存進記帳本，回到上一頁", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await pickStock("0050");
    await fireEvent.changeText(screen.getByLabelText("每期金額（元）"), "5000");
    await fireEvent.changeText(screen.getByLabelText("每月扣款日"), "6");
    await fireEvent.press(screen.getByLabelText("儲存定期定額"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dcaRules).toEqual([
      expect.objectContaining({ symbol: "0050", amount: 5000, dayOfMonth: 6, startDate: "2026-10-28", enabled: true }),
    ]);
  });

  test("以最新收盤價估算每期股數與手續費（P2-02 範例：5,000 元、180 → 27 股、6 元）", async () => {
    await renderNew(makeRepository());
    await pickStock("0050");
    await fireEvent.changeText(screen.getByLabelText("每期金額（元）"), "5000");
    expect(await screen.findByText("以最新收盤價 180 元估算：每期約買 27 股，手續費 6 元")).toBeTruthy();
  });

  test("扣款日超出 1–28、沒選股票：顯示錯誤、不存", async () => {
    const repository = makeRepository();
    await renderNew(repository);
    await screen.findByLabelText("股票代號或名稱");
    await fireEvent.changeText(screen.getByLabelText("每期金額（元）"), "5000");
    await fireEvent.changeText(screen.getByLabelText("每月扣款日"), "31");
    await fireEvent.press(screen.getByLabelText("儲存定期定額"));

    expect(await screen.findByText("扣款日請填 1–28")).toBeTruthy();
    expect(screen.getByText("請選擇股票")).toBeTruthy();
    expect(repository.getSnapshot()?.dcaRules).toBeUndefined();
  });

  test("顯示沿用的手續費規則", async () => {
    await renderNew(makeRepository());
    expect(await screen.findByText(feeDescription(DEFAULT_USER_SETTINGS))).toBeTruthy();
    expect(feeDescription({ ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 })).toContain("費率 0.1425%、2.8 折");
  });

  test("Free 方案已有 1 條：不能再新增", async () => {
    mockedPlan.mockReturnValue({ unlimited: false, loaded: true, showPlan: true });
    await renderNew(makeRepository({ ...emptyLedger(), dcaRules: [RULE] }));
    expect(await screen.findByText("Free 方案可以設定 1 條定期定額，升級 Pro 不限條數。")).toBeTruthy();
  });
});

describe("編輯、刪除定期定額", () => {
  test("修改金額後存檔：規則更新，並補產生已到期的期數", async () => {
    const repository = makeRepository({ ...emptyLedger(), dcaRules: [RULE] });
    await renderEdit(repository, "dca-1");
    const amount = await screen.findByLabelText("每期金額（元）");
    expect(amount.props.value).toBe("5000");
    await fireEvent.changeText(amount, "10000");
    await fireEvent.press(screen.getByLabelText("儲存定期定額"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const ledger = repository.getSnapshot() as Ledger;
    expect(ledger.dcaRules?.[0].amount).toBe(10_000);
    expect(ledger.transactions.map((t) => [t.tradeDate, t.shares, t.source])).toEqual([
      ["2026-08-06", 55, "dca"],
      ["2026-09-07", 53, "dca"],
      ["2026-10-06", 52, "dca"],
    ]);
  });

  test("刪除規則：確認後規則消失，已記上的交易保留", async () => {
    const repository = makeRepository({ ...emptyLedger(), dcaRules: [RULE] });
    await runDcaCatchUp({ repository, candleSource: candles, unlimited: true, today: "2026-10-28" });
    await renderEdit(repository, "dca-1");

    expect(await screen.findByText("已自動記上 3 筆。修改只影響之後的期數，已記上的交易不會變。")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("刪除這條定期定額"));
    expect(screen.getByTestId("dca-delete-confirm")).toHaveTextContent(/已記上的 3 筆交易會保留/);
    await fireEvent.press(screen.getByLabelText("確定刪除定期定額"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.dcaRules).toEqual([]);
    expect(repository.getSnapshot()?.transactions).toHaveLength(3);
  });

  test("找不到規則：顯示訊息", async () => {
    await renderEdit(makeRepository(), "nope");
    expect(await screen.findByText("找不到這條定期定額，可能已經被刪除")).toBeTruthy();
  });
});
