import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { CandleSource } from "@/data/CandleSource";
import { PRO_DEMO_UNLOCKED_KEY, saveFlag } from "@/data/appPrefs";
import { createMemoryLedgerRepository } from "@/data/ledgerRepository";
import { PriceLoadError, type PriceSource } from "@/data/PriceSource";
import { makeTx, spec37, spec37Ledger } from "@/domain/ledgerTestData";
import type { Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import type { Candle } from "@/domain/types";
import { ProStatusProvider } from "@/hooks/useProStatus";
import AssetHistoryScreen from "./AssetHistoryScreen";
import HomeScreen from "./HomeScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const TODAY = "2026-10-28";

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(router.push).mockClear();
});

function fakePrices(prices: Record<string, number>): PriceSource {
  return {
    async getQuote(symbol) {
      const price = prices[symbol];
      if (price === undefined) throw new PriceLoadError();
      return { symbol, name: symbol, price };
    },
  };
}

/**
 * 假日 K：每個工作日一根，收盤價固定 closes[symbol]。
 * 記下每次被要了哪檔、哪幾個月，以及同時有幾個請求在跑（檢查是一檔一檔抓）。
 */
function fakeCandles(closes: Record<string, number>, options: { failTimes?: number } = {}) {
  let failures = options.failTimes ?? 0;
  let running = 0;
  const calls: { symbol: string; months: string[] }[] = [];
  const stats = { maxConcurrent: 0 };
  const source: CandleSource = {
    async getDailyCandles(symbol, months) {
      calls.push({ symbol, months });
      running += 1;
      stats.maxConcurrent = Math.max(stats.maxConcurrent, running);
      await Promise.resolve();
      running -= 1;
      if (failures > 0) {
        failures -= 1;
        throw new PriceLoadError("歷史資料載入失敗（FinMind 回應 HTTP 402：超過上限；證交所回應 HTTP 503）");
      }
      const close = closes[symbol];
      return close === undefined ? [] : months.flatMap((m) => weekdays(m, close));
    },
  };
  return { source, calls, stats };
}

function weekdays(month: string, close: number): Candle[] {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const candles: Candle[] = [];
  for (let day = 1; day <= days; day++) {
    const date = new Date(Date.UTC(year, m - 1, day));
    const iso = date.toISOString().slice(0, 10);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6 || iso > TODAY) continue;
    candles.push({ date: iso, open: close, high: close, low: close, close });
  }
  return candles;
}

/** 3.7 範例的 2330 + 一筆 0050 買入 */
function mixedLedger(): Ledger {
  const base = spec37Ledger();
  return {
    ...base,
    transactions: [
      ...base.transactions,
      makeTx({ id: "etf1", symbol: "0050", side: "buy", tradeDate: "2026-04-01", price: 60, shares: 1000, fee: 85 }),
    ],
  };
}

async function renderScreen(ledger: Ledger, candleSource: CandleSource, prices: Record<string, number>) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ProStatusProvider>
        <AssetHistoryScreen
          repository={createMemoryLedgerRepository(ledger)}
          priceSource={fakePrices(prices)}
          candleSource={candleSource}
          today={TODAY}
        />
      </ProStatusProvider>
    </SafeAreaProvider>,
  );
}

describe("資產走勢（對應 docs/stories/023）", () => {
  test("近 1 個月：畫出走勢，最後一天的總市值等於首頁的目前市值", async () => {
    const candles = fakeCandles({ "2330": 610, "0050": 64 });
    await renderScreen(mixedLedger(), candles.source, { "2330": spec37.price, "0050": 65 });

    expect(await screen.findByTestId("asset-history-chart")).toBeTruthy();
    expect(screen.getByText("2026/10/28（最新）")).toBeTruthy();
    // 手算：2330 剩 1500 股 × 620 + 0050 1000 股 × 65 = 995,000
    // 累計投入：600,855 + 500,712 + 60,085 = 1,161,652
    expect(screen.getByTestId("asset-history-market-value")).toHaveTextContent("995,000");
    expect(screen.getByTestId("asset-history-invested")).toHaveTextContent("1,161,652");
    // 首頁同一份資料、同一組現價的「目前市值」
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <HomeScreen
          repository={createMemoryLedgerRepository(mixedLedger())}
          priceSource={fakePrices({ "2330": spec37.price, "0050": 65 })}
        />
      </SafeAreaProvider>,
    );
    expect(await screen.findByLabelText("目前市值 995,000")).toBeTruthy();
  });

  test("有一檔拿不到現價：最後一天用最近的收盤價，並註明", async () => {
    await renderScreen(mixedLedger(), fakeCandles({ "2330": 610, "0050": 64 }).source, { "2330": 620 });

    expect(await screen.findByText(/有 1 檔拿不到現價，最後一天先用最近一個交易日的收盤價/)).toBeTruthy();
    // 2330 1500 × 620 + 0050 1000 × 64（最近收盤）
    expect(screen.getByTestId("asset-history-market-value")).toHaveTextContent("994,000");
  });

  test("一檔抓完再抓下一檔，只抓期間前一個月到這個月", async () => {
    const candles = fakeCandles({ "2330": 610, "0050": 64 });
    await renderScreen(mixedLedger(), candles.source, { "2330": 620, "0050": 65 });
    await screen.findByTestId("asset-history-chart");

    expect(candles.stats.maxConcurrent).toBe(1);
    expect(candles.calls).toEqual([
      { symbol: "0050", months: ["2026-08", "2026-09", "2026-10"] },
      { symbol: "2330", months: ["2026-08", "2026-09", "2026-10"] },
    ]);
  });

  test("Free 選近 1 年：顯示 Pro 鎖定卡片，不抓資料", async () => {
    const candles = fakeCandles({ "2330": 610 });
    await renderScreen(spec37Ledger(), candles.source, { "2330": 620 });
    await screen.findByTestId("asset-history-chart");
    const before = candles.calls.length;

    await fireEvent.press(screen.getByLabelText("近 1 年 🔒"));
    expect(await screen.findByTestId("pro-feature-assetHistory")).toBeTruthy();
    expect(screen.queryByTestId("asset-history-chart")).toBeNull();
    expect(candles.calls.length).toBe(before);
  });

  test("Pro 選全部：從第一筆交易那天畫起", async () => {
    await saveFlag(PRO_DEMO_UNLOCKED_KEY, true);
    const candles = fakeCandles({ "2330": 610 });
    await renderScreen(spec37Ledger(), candles.source, { "2330": 620 });
    await screen.findByTestId("asset-history-chart");

    await fireEvent.press(await screen.findByLabelText("全部"));
    expect(await screen.findByLabelText(/^資產走勢，2026\/01\/05 到 2026\/10\/28/)).toBeTruthy();
    expect(candles.calls[candles.calls.length - 1].months[0]).toBe("2025-12");
  });

  test("載入失敗：講白話、附技術細節，按重試後畫出來", async () => {
    const candles = fakeCandles({ "2330": 610 }, { failTimes: 1 });
    await renderScreen(spec37Ledger(), candles.source, { "2330": 620 });

    expect(await screen.findByText(/走勢圖載入失敗：免費資料源這個小時的查詢次數用完了/)).toBeTruthy();
    expect(screen.getByText(/技術細節：.*HTTP 402/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("重新載入走勢圖"));
    expect(await screen.findByTestId("asset-history-chart")).toBeTruthy();
  });

  test("資料不足：今天才第一次買，只有一天，不畫圖", async () => {
    const ledger = {
      ...emptyLedger(),
      transactions: [makeTx({ symbol: "2330", side: "buy", tradeDate: TODAY, price: 600, shares: 1000, fee: 855 })],
    };
    await renderScreen(ledger, fakeCandles({ "2330": 610 }).source, { "2330": 620 });

    expect(await screen.findByTestId("asset-history-insufficient")).toBeTruthy();
    expect(screen.queryByTestId("asset-history-chart")).toBeNull();
  });

  test("沒有任何交易：提示先記第一筆，不打資料源", async () => {
    const candles = fakeCandles({});
    await renderScreen(emptyLedger(), candles.source, {});

    expect(await screen.findByText(/還沒有任何交易/)).toBeTruthy();
    expect(candles.calls).toEqual([]);
  });

  test("首頁有「看資產走勢」入口", async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <HomeScreen repository={createMemoryLedgerRepository(spec37Ledger())} priceSource={fakePrices({ "2330": 620 })} />
      </SafeAreaProvider>,
    );
    await fireEvent.press(await screen.findByLabelText("看資產走勢"));
    expect(router.push).toHaveBeenCalledWith("/history");
  });
});
