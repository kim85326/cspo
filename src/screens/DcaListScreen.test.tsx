import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { CandleSource } from "@/data/CandleSource";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import type { DcaRule, Ledger } from "@/domain/ledgerTypes";
import { makeTx } from "@/domain/ledgerTestData";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import { useDcaPlan } from "@/hooks/useDcaPlan";
import { DcaAutoRunner } from "@/ui/DcaAutoRunner";
import DcaListScreen from "./DcaListScreen";
import HoldingDetailScreen from "./HoldingDetailScreen";
import { EditTransactionScreen } from "./TransactionFormScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("@/hooks/useDcaPlan", () => ({ useDcaPlan: jest.fn() }));

const mockedPlan = useDcaPlan as jest.Mock;

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const now = () => new Date(2026, 9, 28, 20, 0, 0);

function rule(patch: Partial<DcaRule> = {}): DcaRule {
  return {
    id: "dca-1",
    symbol: "0050",
    amount: 5000,
    dayOfMonth: 6,
    startDate: "2026-08-01",
    enabled: true,
    handledPeriods: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

const dcaTx = makeTx({
  symbol: "0050",
  side: "buy",
  price: 180,
  shares: 27,
  fee: 6,
  tradeDate: "2026-10-06",
  source: "dca",
  dcaRuleId: "dca-1",
  dcaPeriod: "2026-10",
});

function repoOf(ledger: Ledger): LedgerRepository {
  return createMemoryLedgerRepository(ledger, { now });
}

function wrap(children: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedPlan.mockReturnValue({ unlimited: true, loaded: true, showPlan: false });
});

describe("定期定額列表（Story 024）", () => {
  test("沒有規則：說明與新增按鈕", async () => {
    await render(wrap(<DcaListScreen repository={repoOf(emptyLedger())} />));
    expect(await screen.findByTestId("dca-empty")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("新增定期定額"));
    expect(router.push).toHaveBeenCalledWith("/dca/new");
  });

  test("列出規則：扣款日、金額、狀態、已記上幾筆", async () => {
    const ledger = { ...emptyLedger(), dcaRules: [rule({ handledPeriods: ["2026-10"] })], transactions: [dcaTx] };
    await render(wrap(<DcaListScreen repository={repoOf(ledger)} />));

    expect(await screen.findByText("每月 6 日 · 5,000 元")).toBeTruthy();
    expect(screen.getByText("啟用中")).toBeTruthy();
    expect(screen.getByTestId("dca-generated-dca-1")).toHaveTextContent("已自動記上 1 筆，最近一筆 2026/10/06");
    await waitFor(() => expect(screen.getByText("0050 元大台灣50")).toBeTruthy());
  });

  test("切換開關暫停：規則變成已暫停", async () => {
    const repository = repoOf({ ...emptyLedger(), dcaRules: [rule()] });
    await render(wrap(<DcaListScreen repository={repository} />));
    await fireEvent(await screen.findByTestId("switch-dca-dca-1"), "valueChange", false);

    await waitFor(() => expect(repository.getSnapshot()?.dcaRules?.[0].enabled).toBe(false));
    expect(await screen.findByText("已暫停")).toBeTruthy();
  });

  test("Free 方案已有 1 條：沒有新增按鈕，改顯示升級提示；多的規則標示未啟用", async () => {
    mockedPlan.mockReturnValue({ unlimited: false, loaded: true, showPlan: true });
    const ledger = {
      ...emptyLedger(),
      dcaRules: [rule(), rule({ id: "dca-2", symbol: "006208", createdAt: "2026-09-01T00:00:00.000Z" })],
    };
    await render(wrap(<DcaListScreen repository={repoOf(ledger)} />));

    expect(await screen.findByTestId("dca-limit")).toBeTruthy();
    expect(screen.queryByLabelText("新增定期定額")).toBeNull();
    expect(screen.getByText("Free 方案未啟用")).toBeTruthy();
  });
});

describe("App 開啟時自動補帳（DcaAutoRunner）", () => {
  const candles: CandleSource = {
    async getDailyCandles() {
      return [
        { date: "2026-08-06", open: 180, high: 180, low: 180, close: 180 },
        { date: "2026-09-07", open: 185, high: 185, low: 185, close: 185 },
        { date: "2026-10-06", open: 190, high: 190, low: 190, close: 190 },
      ];
    },
  };

  test("補產生三筆，底部提示「已自動記上 3 筆」，點了到定期定額頁", async () => {
    const repository = repoOf({ ...emptyLedger(), dcaRules: [rule()] });
    await render(wrap(<DcaAutoRunner repository={repository} candleSource={candles} />));

    expect(await screen.findByText("定期定額已自動記上 3 筆買入")).toBeTruthy();
    expect(repository.getSnapshot()?.transactions).toHaveLength(3);
    await fireEvent.press(screen.getByLabelText("定期定額已自動記上 3 筆買入，查看定期定額"));
    expect(router.push).toHaveBeenCalledWith("/dca");
  });

  test("方案狀態還沒讀完：先不跑", async () => {
    mockedPlan.mockReturnValue({ unlimited: false, loaded: false, showPlan: true });
    const repository = repoOf({ ...emptyLedger(), dcaRules: [rule()] });
    const spy = jest.fn(candles.getDailyCandles);
    await render(wrap(<DcaAutoRunner repository={repository} candleSource={{ getDailyCandles: spy }} />));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dca-notice")).toBeNull();
  });

  test("沒有新交易：不顯示提示", async () => {
    const repository = repoOf(emptyLedger());
    await render(wrap(<DcaAutoRunner repository={repository} candleSource={candles} />));
    await waitFor(() => expect(repository.getSnapshot()).not.toBeNull());
    expect(screen.queryByTestId("dca-notice")).toBeNull();
  });
});

describe("自動產生的交易在列表上有「定期定額」標記", () => {
  const prices: PriceSource = { getQuote: async (symbol) => ({ symbol, name: "元大台灣50", price: 180 }) };

  test("持股明細的交易紀錄", async () => {
    const repository = repoOf({ ...emptyLedger(), transactions: [dcaTx] });
    await render(wrap(<HoldingDetailScreen symbol="0050" repository={repository} prices={prices} today="2026-10-28" />));
    expect(await screen.findByText("定期定額")).toBeTruthy();
    expect(screen.getByLabelText("2026-10-06 買入 27 股 @ 180.00，定期定額，編輯這筆交易")).toBeTruthy();
  });

  test("編輯交易：提示可改成券商實際成交的數字，存檔後仍是 source = dca", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: dcaTx.id });
    const repository = repoOf({ ...emptyLedger(), transactions: [dcaTx] });
    await render(wrap(<EditTransactionScreen repository={repository} now={now} />));

    expect(await screen.findByTestId("dca-source-hint")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("成交價"), "179.5");
    await fireEvent.press(screen.getByLabelText("儲存"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(repository.getSnapshot()?.transactions[0]).toMatchObject({ price: 179.5, source: "dca", dcaRuleId: "dca-1" });
  });
});
