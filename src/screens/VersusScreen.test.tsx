import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Features } from "@/config/features";
import { PRO_DEMO_UNLOCKED_KEY } from "@/data/appPrefs";
import { createMemoryLedgerRepository } from "@/data/ledgerRepository";
import { PriceLoadError, type PriceSource } from "@/data/PriceSource";
import { makeTx, spec37, spec37Ledger } from "@/domain/ledgerTestData";
import type { Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import { ProStatusProvider } from "@/hooks/useProStatus";
import VersusScreen from "./VersusScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const TODAY = "2026-10-27";

/** 假行情：prices 沒有的代號丟 PriceLoadError（像斷網） */
function fakePrices(prices: Record<string, number>): PriceSource {
  return {
    async getQuote(symbol) {
      const price = prices[symbol];
      if (price === undefined) throw new PriceLoadError();
      return { symbol, name: symbol, price };
    },
  };
}

/** 兩邊都持有超過一年：個股 2330 兩年前 100,000、ETF 0050 一年多前 100,000（手續費設 0 方便看） */
function longLedger(): Ledger {
  return {
    ...emptyLedger(),
    transactions: [
      makeTx({ symbol: "2330", side: "buy", tradeDate: "2024-10-27", price: 100, shares: 1000, fee: 0 }),
      makeTx({ symbol: "0050", side: "buy", tradeDate: "2025-10-01", price: 100, shares: 1000, fee: 0 }),
    ],
  };
}

/** 3.7 範例的 2330（今年才買）+ 一筆今年的 0050 */
function shortLedger(): Ledger {
  const base = spec37Ledger();
  return {
    ...base,
    transactions: [
      ...base.transactions,
      makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-04-01", price: 180, shares: 1000, fee: 256 }),
    ],
  };
}

let features: Partial<Features> = {};

beforeEach(async () => {
  await AsyncStorage.clear();
  features = { proPlan: false };
  jest.mocked(router.push).mockClear();
});

async function renderVersus(ledger: Ledger, prices: Record<string, number>) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <StaticFeatureFlags flags={features}>
        <ProStatusProvider>
          <VersusScreen repository={createMemoryLedgerRepository(ledger)} prices={fakePrices(prices)} today={TODAY} />
        </ProStatusProvider>
      </StaticFeatureFlags>
    </SafeAreaProvider>,
  );
}

async function conclusion() {
  const card = await screen.findByTestId("duel-conclusion");
  await screen.findByLabelText("核心（ETF）");
  return within(card);
}

describe("個股 vs ETF 對決 A（對應 docs/stories/027）", () => {
  test("兩邊都超過一年：並排顯示總報酬、報酬率，結論比年化報酬率", async () => {
    await renderVersus(longLedger(), { "2330": 130, "0050": 115 });

    expect(await screen.findByText(/^你的個股年化 .*，ETF 年化 .*，個股領先 .*。$/)).toBeTruthy();
    const satellite = within(screen.getByLabelText("衛星（個股）"));
    expect(satellite.getByText("年化較高")).toBeTruthy();
    // 130,000 − 預估賣出費用（手續費 185、證交稅 390）− 100,000
    expect(satellite.getByLabelText("總報酬").props.children).toBe("+29,425");
    expect(satellite.getByTestId("direction-up", { includeHiddenElements: true })).toBeTruthy();
    expect(satellite.getByLabelText("報酬率").props.children).toBe("+29.43%");
    expect(satellite.getByLabelText("累計投入 100,000")).toBeTruthy();

    const annualized = within(screen.getByTestId("duel-annualized"));
    expect(annualized.queryByText("持有未滿一年")).toBeNull();
    expect(screen.queryByTestId("duel-conclusion-note")).toBeNull();
  });

  test("持有未滿一年：年化顯示「持有未滿一年」並說明原因，結論改比報酬率", async () => {
    await renderVersus(shortLedger(), { "2330": spec37.price, "0050": 190 });

    const card = await conclusion();
    expect(card.getByText("你的個股報酬率 13.9%，ETF 報酬率 5.2%，個股領先 8.7%。")).toBeTruthy();
    expect(card.getByTestId("duel-conclusion-note").props.children).toContain("持有還不到一年");

    const annualized = within(screen.getByTestId("duel-annualized"));
    expect(annualized.getAllByText("持有未滿一年")).toHaveLength(2);
    expect(annualized.getByText(/把短期的漲跌放大/)).toBeTruthy();
  });

  test("只有個股：ETF 那邊寫「還沒有 ETF 紀錄」，不下結論", async () => {
    await renderVersus(spec37Ledger(), { "2330": spec37.price });

    const card = await conclusion();
    expect(card.getByText(/還沒有 ETF 可以比/)).toBeTruthy();
    expect(card.queryByText(/領先|落後|差不多/)).toBeNull();
    expect(within(screen.getByLabelText("核心（ETF）")).getByText("還沒有 ETF 紀錄")).toBeTruthy();
    expect(within(screen.getByLabelText("衛星（個股）")).getByLabelText("報酬率").props.children).toBe("+13.88%");
  });

  test("拿不到現價：不比較，數字顯示 —", async () => {
    await renderVersus(shortLedger(), { "2330": spec37.price });

    const card = await conclusion();
    expect(card.getByText(/拿不到現價/)).toBeTruthy();
    expect(within(screen.getByLabelText("核心（ETF）")).getByLabelText("報酬率").props.children).toBe("—");
  });

  test("沒有任何交易：說明要先記帳，按鈕連到新增交易", async () => {
    await renderVersus(emptyLedger(), {});

    expect(await screen.findByText(/還沒有任何 ETF 或個股的紀錄/)).toBeTruthy();
    expect(screen.queryByLabelText("核心（ETF）")).toBeNull();
    await fireEvent.press(screen.getByLabelText("新增交易"));
    expect(router.push).toHaveBeenCalledWith("/transaction/new");
  });

  test("Pro 開關打開、我是 Free：年化報酬率鎖住，結論只比報酬率", async () => {
    features.proPlan = true;
    await renderVersus(longLedger(), { "2330": 130, "0050": 115 });

    const card = await conclusion();
    expect(card.getByText(/^你的個股報酬率 29\.4%，ETF 報酬率/)).toBeTruthy();
    expect(await screen.findByLabelText("年化報酬率，Pro 功能，尚未解鎖")).toBeTruthy();
    expect(screen.queryByTestId("duel-annualized")).toBeNull();
    expect(screen.queryByText(/年化 /)).toBeNull();
  });

  test("Pro 開關打開、Demo 解鎖：年化報酬率照常顯示", async () => {
    features.proPlan = true;
    await AsyncStorage.setItem(PRO_DEMO_UNLOCKED_KEY, "1");
    await renderVersus(longLedger(), { "2330": 130, "0050": 115 });

    expect(await screen.findByTestId("duel-annualized")).toBeTruthy();
    expect(await screen.findByText(/^你的個股年化/)).toBeTruthy();
  });
});
