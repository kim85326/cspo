import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Features } from "@/config/features";
import { PRO_DEMO_UNLOCKED_KEY } from "@/data/appPrefs";
import type { CandleSource } from "@/data/CandleSource";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import { createMemoryLedgerRepository } from "@/data/ledgerRepository";
import { PriceLoadError, type PriceSource } from "@/data/PriceSource";
import { makeTx } from "@/domain/ledgerTestData";
import type { Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import type { Candle } from "@/domain/types";
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

const TODAY = "2026-10-28";

function fakePrices(prices: Record<string, number>): PriceSource {
  return {
    async getQuote(symbol) {
      const price = prices[symbol];
      if (price === undefined) throw new PriceLoadError();
      return { symbol, name: symbol, price };
    },
  };
}

/** 假日 K：每個工作日一根，收盤價固定 closes[symbol]；記下被要了哪幾檔。failTimes 次之前都丟錯 */
function fakeSources(closes: Record<string, number>, options: { failTimes?: number } = {}) {
  let failures = options.failTimes ?? 0;
  const requested: string[] = [];
  const candles: CandleSource = {
    async getDailyCandles(symbol, months) {
      requested.push(symbol);
      if (failures > 0) {
        failures -= 1;
        throw new PriceLoadError("Failed to fetch");
      }
      const close = closes[symbol];
      if (close === undefined) return [];
      return months.flatMap((month) => weekdays(month).map((date): Candle => ({ date, open: close, high: close, low: close, close })));
    },
  };
  const actions: CorporateActionSource = { getActions: async () => [] };
  return { sources: { candles, actions }, requested };
}

function weekdays(month: string): string[] {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let day = 1; day <= days; day++) {
    const date = new Date(Date.UTC(year, m - 1, day));
    const iso = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && iso <= TODAY) out.push(iso);
  }
  return out;
}

/** 3/2 買 2330 1,000 股 × 100，手續費設 0 方便手算 */
function satelliteLedger(): Ledger {
  return {
    ...emptyLedger(),
    transactions: [makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-03-02", price: 100, shares: 1000, fee: 0 })],
  };
}

let features: Partial<Features> = {};

beforeEach(async () => {
  await AsyncStorage.clear();
  features = { proPlan: false };
});

async function renderVersus(ledger: Ledger, quotes: Record<string, number>, sources: ReturnType<typeof fakeSources>["sources"]) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <StaticFeatureFlags flags={features}>
        <ProStatusProvider>
          <VersusScreen
            repository={createMemoryLedgerRepository(ledger)}
            prices={fakePrices(quotes)}
            today={TODAY}
            benchmarkSources={sources}
          />
        </ProStatusProvider>
      </StaticFeatureFlags>
    </SafeAreaProvider>,
  );
}

describe("個股 vs ETF 對決 B：如果改買 0050（對應 docs/stories/022）", () => {
  test("衛星與整體各模擬一次，用白話說多或少幾元，並註明忽略交易成本", async () => {
    const { sources } = fakeSources({ "0050": 50, "006208": 100 });
    await renderVersus(satelliteLedger(), { "2330": 120 }, sources);

    // 手算：100,000 ÷ 50 = 2,000 單位 × 50 = 100,000；實際 1,000 股 × 120 = 120,000 → 少 20,000
    const satellite = within(await screen.findByTestId("benchmark-satellite"));
    expect(satellite.getByText("若改買 0050，現在價值 100,000 元，比你實際少 20,000 元。")).toBeTruthy();
    expect(satellite.getByLabelText("你實際（市值 + 領到的股利） 120,000 元")).toBeTruthy();
    expect(satellite.getByLabelText("期間投入 100,000 元")).toBeTruthy();
    const all = within(screen.getByTestId("benchmark-all"));
    expect(all.getByText("若改買 0050，現在價值 100,000 元，比你實際少 20,000 元。")).toBeTruthy();
    expect(screen.getByText(/模擬忽略交易成本/)).toBeTruthy();
  });

  test("切換基準到 006208：重新抓 006208 的價格", async () => {
    const { sources, requested } = fakeSources({ "0050": 50, "006208": 80 });
    await renderVersus(satelliteLedger(), { "2330": 120 }, sources);
    await screen.findByTestId("benchmark-satellite");

    await fireEvent.press(within(screen.getByLabelText("比較基準")).getByLabelText("006208"));

    // 價格固定，所以換哪個基準結果都一樣是 100,000；重點是有去抓 006208
    expect(await screen.findAllByText("若改買 006208，現在價值 100,000 元，比你實際少 20,000 元。")).toHaveLength(2);
    expect(requested).toContain("006208");
  });

  test("今年：去年就有的持股以 1/1 的市值當成期初投入", async () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      transactions: [makeTx({ symbol: "2330", side: "buy", tradeDate: "2025-06-02", price: 80, shares: 1000, fee: 0 })],
    };
    const { sources, requested } = fakeSources({ "0050": 50, "2330": 100 });
    await renderVersus(ledger, { "2330": 120 }, sources);
    await screen.findByTestId("benchmark-satellite");

    await fireEvent.press(within(screen.getByLabelText("比較期間")).getByLabelText("今年"));

    // 手算：期初 1,000 股 × 12/31 收盤 100 = 100,000 → 0050 2,000 單位 × 50 = 100,000；實際 120,000
    const satellite = within(await screen.findByTestId("benchmark-satellite"));
    expect(await satellite.findByLabelText("期間投入 100,000 元")).toBeTruthy();
    expect(satellite.getByText("若改買 0050，現在價值 100,000 元，比你實際少 20,000 元。")).toBeTruthy();
    expect(requested).toContain("2330");
  });

  test("抓不到歷史價格：顯示錯誤與重試，不讓畫面壞掉", async () => {
    const { sources } = fakeSources({ "0050": 50 }, { failTimes: 1 });
    await renderVersus(satelliteLedger(), { "2330": 120 }, sources);

    expect(await screen.findByTestId("benchmark-error")).toBeTruthy();
    expect(screen.getByText(/歷史價格載入失敗：連不上資料來源/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("重新載入歷史價格"));
    expect(await screen.findByTestId("benchmark-satellite")).toBeTruthy();
  });

  test("日期太早：基準還沒有價格時用白話說明", async () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      transactions: [makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-03-02", price: 100, shares: 1000, fee: 0 })],
    };
    // 0050 沒有任何價格（代號不在假來源裡）
    const { sources } = fakeSources({});
    await renderVersus(ledger, { "2330": 120 }, sources);

    const satellite = within(await screen.findByTestId("benchmark-satellite"));
    expect(satellite.getByText(/0050 拿不到價格，2026-03-02 那筆紀錄比它還早，模擬不了/)).toBeTruthy();
  });

  test("只有 ETF：衛星寫「還沒有個股紀錄」，整體照常比較", async () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      transactions: [makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-03-02", price: 50, shares: 2000, fee: 0 })],
    };
    const { sources } = fakeSources({ "0050": 50 });
    await renderVersus(ledger, { "0050": 50 }, sources);

    expect(within(await screen.findByTestId("benchmark-satellite")).getByText("還沒有個股紀錄")).toBeTruthy();
    expect(within(screen.getByTestId("benchmark-all")).getByText("若改買 0050，現在價值 100,000 元，和你實際差不多。")).toBeTruthy();
  });

  test("Pro 開關打開、我是 Free：對決 B 鎖住，也不去抓歷史價格", async () => {
    features.proPlan = true;
    const { sources, requested } = fakeSources({ "0050": 50 });
    await renderVersus(satelliteLedger(), { "2330": 120 }, sources);

    expect(await screen.findByLabelText("個股 vs ETF 對決（完整），Pro 功能，尚未解鎖")).toBeTruthy();
    expect(screen.queryByTestId("benchmark-duel")).toBeNull();
    expect(requested).toEqual([]);
  });

  test("Pro 開關打開、Demo 解鎖：對決 B 照常顯示", async () => {
    features.proPlan = true;
    await AsyncStorage.setItem(PRO_DEMO_UNLOCKED_KEY, "1");
    const { sources } = fakeSources({ "0050": 50 });
    await renderVersus(satelliteLedger(), { "2330": 120 }, sources);

    expect(await screen.findByTestId("benchmark-satellite")).toBeTruthy();
  });
});
