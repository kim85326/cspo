import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createMemoryLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import { PriceLoadError, type PriceSource } from "@/data/PriceSource";
import { makeTx, spec37, spec37Ledger } from "@/domain/ledgerTestData";
import type { Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import HomeScreen from "./HomeScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

beforeEach(() => {
  jest.mocked(router.push).mockClear();
});

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const NAMES: Record<string, string> = { "2330": "台積電", "0050": "元大台灣50", "2317": "鴻海" };

/** 假行情：prices 沒有的代號丟 PriceLoadError（像斷網） */
function fakePrices(prices: Record<string, number>, asOf: Record<string, string> = {}): PriceSource {
  return {
    async getQuote(symbol) {
      const price = prices[symbol];
      if (price === undefined) throw new PriceLoadError();
      return { symbol, name: NAMES[symbol] ?? symbol, price, ...(asOf[symbol] ? { asOf: asOf[symbol] } : {}) };
    },
  };
}

/** 3.7 範例的 2330 + 一筆 0050 買入 */
function mixedLedger(): Ledger {
  const base = spec37Ledger();
  return {
    ...base,
    transactions: [
      ...base.transactions,
      makeTx({ id: "etf1", symbol: "0050", side: "buy", tradeDate: "2026-04-01", price: 180, shares: 1000, fee: 256 }),
    ],
  };
}

async function renderHome(repository: LedgerRepository, priceSource: PriceSource) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HomeScreen repository={repository} priceSource={priceSource} />
    </SafeAreaProvider>,
  );
}

function group(name: "整體" | "核心（ETF）" | "衛星（個股）") {
  return within(screen.getByLabelText(name));
}

describe("首頁總覽（對應 docs/stories/011）", () => {
  test("沒有任何交易：顯示空狀態與「新增第一筆交易」，不是一排 0", async () => {
    await renderHome(createMemoryLedgerRepository(emptyLedger()), fakePrices({}));
    expect(await screen.findByText("還沒有任何交易")).toBeTruthy();
    expect(screen.queryByLabelText("整體")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();

    await fireEvent.press(screen.getByLabelText("新增第一筆交易"));
    expect(router.push).toHaveBeenCalledWith("/transaction/new");
  });

  test("3.7 範例：整體顯示總報酬 +152,880、+13.88%，以及各項金額與價格日期", async () => {
    await renderHome(
      createMemoryLedgerRepository(spec37Ledger()),
      fakePrices({ "2330": spec37.price }, { "2330": "2026/10/22" }),
    );
    expect(await screen.findByText("價格：2026/10/22 收盤價")).toBeTruthy();

    const overall = group("整體");
    expect(overall.getByText("賺了")).toBeTruthy();
    expect(overall.getByLabelText("總報酬").props.children).toBe("+152,880");
    expect(overall.getByLabelText("報酬率").props.children).toBe("+13.88%");
    expect(overall.getByLabelText("累計投入 1,101,567")).toBeTruthy();
    expect(overall.getByLabelText("目前市值 930,000")).toBeTruthy();
    expect(overall.getByLabelText("已實現 +48,170")).toBeTruthy();
    expect(overall.getByLabelText("未實現 +99,710")).toBeTruthy();
    expect(overall.getByLabelText("已領股利 5,000")).toBeTruthy();

    // 只有個股：衛星等於整體，核心沒有紀錄
    expect(group("衛星（個股）").getByLabelText("總報酬")).toHaveTextContent("+152,880");
    expect(group("衛星（個股）").getByTestId("direction-up", { includeHiddenElements: true })).toBeTruthy();
    expect(group("核心（ETF）").getByText("還沒有 ETF 紀錄")).toBeTruthy();
  });

  test("核心與衛星並排，各自的數字加起來等於整體", async () => {
    await renderHome(createMemoryLedgerRepository(mixedLedger()), fakePrices({ "2330": 620, "0050": 190 }));
    await screen.findByText(/^價格更新於/);
    // 0050：買 180,256、市值 190,000、預估賣出費用 270 + 190 = 460 → 未實現 +9,284
    expect(group("核心（ETF）").getByLabelText("未實現 +9,284")).toBeTruthy();
    expect(group("核心（ETF）").getByLabelText("目前市值 190,000")).toBeTruthy();
    expect(group("衛星（個股）").getByLabelText("目前市值 930,000")).toBeTruthy();
    expect(group("整體").getByLabelText("目前市值 1,120,000")).toBeTruthy();
    expect(group("整體").getByLabelText("累計投入 1,281,823")).toBeTruthy();
    expect(group("整體").getByLabelText("總報酬").props.children).toBe("+162,164");
  });

  test("把 2330 從衛星改成核心：總覽數字立即更新", async () => {
    const repository = createMemoryLedgerRepository(mixedLedger());
    await renderHome(repository, fakePrices({ "2330": 620, "0050": 190 }));
    await screen.findByText(/^價格更新於/);
    expect(group("核心（ETF）").getByLabelText("目前市值 190,000")).toBeTruthy();

    await act(async () => {
      await repository.setBucket("2330", "core");
    });

    expect(await screen.findByText("還沒有個股紀錄")).toBeTruthy();
    expect(group("核心（ETF）").getByLabelText("目前市值 1,120,000")).toBeTruthy();
    expect(group("整體").getByLabelText("目前市值 1,120,000")).toBeTruthy();
    expect(screen.getByLabelText(/^台積電 2330，核心/)).toBeTruthy();
  });

  test("有一檔拿不到現價：提示並顯示 —，不把少算的市值當成虧錢", async () => {
    await renderHome(createMemoryLedgerRepository(mixedLedger()), fakePrices({ "0050": 190 }));
    expect(await screen.findByText("有 1 檔拿不到現價，市值與總報酬先不計算")).toBeTruthy();
    expect(group("整體").getByLabelText("總報酬").props.children).toBe("—");
    expect(group("整體").getByLabelText("目前市值 —")).toBeTruthy();
    expect(group("整體").getByLabelText("已實現 +48,170")).toBeTruthy();
    // 核心那邊價格齊全，照樣算
    expect(group("核心（ETF）").getByLabelText("目前市值 190,000")).toBeTruthy();
  });

  test("持股列：市值大的在前；點一檔、看全部持股、新增交易、快速試算各自連到對的路由", async () => {
    await renderHome(createMemoryLedgerRepository(mixedLedger()), fakePrices({ "2330": 620, "0050": 190 }));
    await screen.findByText(/^價格更新於/);
    const rows = screen.getAllByTestId(/^holding-row-/);
    expect(rows.map((r) => r.props.testID)).toEqual(["holding-row-2330", "holding-row-0050"]);
    expect(
      screen.getByLabelText("元大台灣50 0050，核心，市值 190,000 元，總報酬 賺了 +9,284 元，報酬率 +5.15%"),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId("holding-row-0050"));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: "/holdings/[symbol]", params: { symbol: "0050" } });
    await fireEvent.press(screen.getByLabelText("看全部持股"));
    expect(router.push).toHaveBeenLastCalledWith("/holdings");
    await fireEvent.press(screen.getByLabelText("新增交易"));
    expect(router.push).toHaveBeenLastCalledWith("/transaction/new");
    await fireEvent.press(screen.getByLabelText("快速試算"));
    expect(router.push).toHaveBeenLastCalledWith("/calculate");
  });

  test("空記帳本也看得到快速試算入口", async () => {
    await renderHome(createMemoryLedgerRepository(emptyLedger()), fakePrices({}));
    await fireEvent.press(await screen.findByLabelText("快速試算"));
    expect(router.push).toHaveBeenCalledWith("/calculate");
  });
});
