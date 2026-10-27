import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { PriceLoadError } from "@/data/PriceSource";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { Ledger } from "@/domain/ledgerTypes";
import { makeTx, spec37, spec37Ledger } from "@/domain/ledgerTestData";
import { pnlColors } from "@/ui/theme";
import HoldingsScreen from "./HoldingsScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const TODAY = "2026-10-27";
const PRICES: Record<string, { name: string; price: number }> = {
  "2330": { name: "台積電", price: spec37.price },
  "0050": { name: "元大台灣50", price: 180 },
  "2317": { name: "鴻海", price: 150 },
  "2454": { name: "聯發科", price: 1200 },
};
const prices: PriceSource = {
  async getQuote(symbol) {
    const q = PRICES[symbol];
    return q ? { symbol, ...q, asOf: "2026/10/26" } : null;
  },
};

function mixedLedger(): Ledger {
  const base = spec37Ledger();
  return {
    ...base,
    transactions: [
      ...base.transactions,
      makeTx({ symbol: "0050", side: "buy", price: 160, shares: 2000, fee: 456 }),
      makeTx({ symbol: "2317", side: "buy", price: 200, shares: 1000, fee: 285 }),
      makeTx({ symbol: "2454", side: "buy", price: 1100, shares: 100, fee: 156 }),
      makeTx({ symbol: "2454", side: "sell", tradeDate: "2026-08-15", price: 1250, shares: 100, fee: 178, tax: 375 }),
    ],
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(router.push).mockClear();
});

async function renderScreen(repository: LedgerRepository, source: PriceSource = prices) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HoldingsScreen repository={repository} prices={source} today={TODAY} />
    </SafeAreaProvider>,
  );
}

const rowSymbols = () =>
  screen.getAllByTestId(/^holding-row-/).map((el) => String(el.props.testID).replace("holding-row-", ""));

describe("HoldingsScreen 持股明細（對應 docs/stories/010）", () => {
  test("M-04 AC1：3.7 範例完成後，2330 那一列顯示的數字", async () => {
    await renderScreen(createMemoryLedgerRepository(spec37Ledger()));
    const row = within(await screen.findByTestId("holding-row-2330"));
    expect(row.getByText("台積電")).toBeTruthy();
    expect(row.getByText("2330 · 1,500 股 · 均價 550.78")).toBeTruthy();
    expect(row.getByText("930,000")).toBeTruthy();
    expect(row.getByText("+99,710（+12.07%）")).toBeTruthy();
    expect(row.getByText("+48,170")).toBeTruthy();
    expect(row.getByText("5,000")).toBeTruthy();
    expect(row.getByText("+152,880")).toBeTruthy();
    expect(row.getByText("+13.88%")).toBeTruthy();
    expect(row.getByText("620.00")).toBeTruthy();
    expect(row.getByText("295 天")).toBeTruthy();
    expect(row.getByText("衛星")).toBeTruthy();
  });

  test("M-04 AC3：獲利紅色、虧損綠色，且有 ▲▼ 與賺了／虧了", async () => {
    await renderScreen(createMemoryLedgerRepository(mixedLedger()));
    const gain = within(await screen.findByTestId("holding-row-2330"));
    expect(gain.getByText("+152,880")).toHaveStyle({ color: pnlColors.up });
    expect(gain.getByText("▲", { includeHiddenElements: true })).toBeTruthy();
    expect(gain.getByText("總報酬 · 賺了")).toBeTruthy();

    const loss = within(screen.getByTestId("holding-row-2317"));
    expect(loss.getByText("-50,948")).toHaveStyle({ color: pnlColors.down });
    expect(loss.getByText("▼", { includeHiddenElements: true })).toBeTruthy();
    expect(loss.getByText("總報酬 · 虧了")).toBeTruthy();
  });

  test("M-04 AC2：賣光的不在持有中，在已出清分頁", async () => {
    await renderScreen(createMemoryLedgerRepository(mixedLedger()));
    await screen.findByTestId("holding-row-2330");
    expect(screen.queryByTestId("holding-row-2454")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "已出清（1）" }));
    const row = within(screen.getByTestId("holding-row-2454"));
    expect(row.getByText("聯發科")).toBeTruthy();
    expect(row.getByText("2454 · 已出清")).toBeTruthy();
    // 已實現 = 125,000 − 178 − 375 − 110,156
    expect(row.getAllByText("+14,291").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("holding-row-2330")).toBeNull();
  });

  test("預設依市值排序，可改依報酬率、總報酬", async () => {
    const ledger = mixedLedger();
    // 讓 0050 報酬率最高、市值最小
    ledger.transactions.push(makeTx({ symbol: "00878", side: "buy", price: 10, shares: 1000, fee: 20 }));
    PRICES["00878"] = { name: "國泰永續高股息", price: 22 };
    try {
      await renderScreen(createMemoryLedgerRepository(ledger));
      await screen.findByTestId("holding-row-2330");
      expect(rowSymbols()).toEqual(["2330", "0050", "2317", "00878"]);

      await fireEvent.press(screen.getByRole("radio", { name: "報酬率" }));
      expect(rowSymbols()).toEqual(["00878", "2330", "0050", "2317"]);

      await fireEvent.press(screen.getByRole("radio", { name: "總報酬" }));
      expect(rowSymbols()).toEqual(["2330", "0050", "00878", "2317"]);
    } finally {
      delete PRICES["00878"];
    }
  });

  test("點一列進單一持股頁", async () => {
    await renderScreen(createMemoryLedgerRepository(spec37Ledger()));
    await fireEvent.press(await screen.findByTestId("holding-row-2330"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/holdings/[symbol]", params: { symbol: "2330" } });
  });

  test("沒有價格的持股，相關欄位顯示 —", async () => {
    const failing: PriceSource = {
      async getQuote() {
        throw new PriceLoadError();
      },
    };
    await renderScreen(createMemoryLedgerRepository(spec37Ledger()), failing);
    expect(await screen.findByText("行情載入失敗，缺少價格的欄位暫時顯示 —")).toBeTruthy();
    const row = within(screen.getByTestId("holding-row-2330"));
    expect(row.getByText("總報酬 · 缺少價格")).toBeTruthy();
    expect(row.getByText("—（—）")).toBeTruthy();
    // 已實現、股利不需要價格，照樣顯示
    expect(row.getByText("+48,170")).toBeTruthy();
  });

  test("沒有任何交易：空狀態與新增交易", async () => {
    await renderScreen(
      createMemoryLedgerRepository({
        schemaVersion: 1,
        transactions: [],
        dividends: [],
        holdingSettings: [],
        settings: DEFAULT_USER_SETTINGS,
      }),
    );
    expect(await screen.findByText("還沒有持股")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "新增交易" }));
    expect(router.push).toHaveBeenCalledWith("/transaction/new");
  });

  test("M-06：新增 0050 交易後自動歸類為核心", async () => {
    const repository = createMemoryLedgerRepository(spec37Ledger(), { now: () => new Date("2026-10-27T10:00:00") });
    await renderScreen(repository);
    await screen.findByTestId("holding-row-2330");
    await act(() =>
      repository.addTransaction({
      symbol: "0050",
      side: "buy",
      tradeDate: "2026-10-20",
      price: 180,
      shares: 1000,
      fee: 256,
      tax: 0,
      feeOverridden: false,
      source: "manual",
      }),
    );
    const row = within(await screen.findByTestId("holding-row-0050"));
    expect(row.getByText("核心")).toBeTruthy();
  });
});
