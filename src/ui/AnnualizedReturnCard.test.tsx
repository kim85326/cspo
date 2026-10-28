import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { PRO_DEMO_UNLOCKED_KEY } from "@/data/appPrefs";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { HoldingView } from "@/domain/holdings";
import { makeTx } from "@/domain/ledgerTestData";
import type { Ledger, SecurityType, Transaction } from "@/domain/ledgerTypes";
import { computePosition } from "@/domain/position";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import { ProStatusProvider } from "@/hooks/useProStatus";
import { HoldingAnnualizedReturnCard, PortfolioAnnualizedReturnCard } from "./AnnualizedReturnCard";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

const TODAY = "2026-10-27";

// 0050：一年前（2025-10-27）投入 100,000，今天拿回 110,000 → 10.00%（規格 P2-04 AC，沒有手續費）
const etfBuy = makeTx({ symbol: "0050", side: "buy", tradeDate: "2025-10-27", price: 100, shares: 1000, fee: 0 });
// 2330：2026-04-10（200 天前）才買 → 持有未滿一年
const stockBuy = makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-04-10", price: 500, shares: 1000, fee: 0 });

function ledgerOf(transactions: Transaction[]): Ledger {
  return {
    schemaVersion: 1,
    transactions,
    dividends: [],
    holdingSettings: [],
    settings: { ...DEFAULT_USER_SETTINGS },
  };
}

function view(symbol: string, type: SecurityType, txs: Transaction[], price: number | null): HoldingView {
  // 預估賣出費用設成 0，期末價值剛好是市值，數字好驗算
  const position = computePosition(symbol, txs, [], { type, today: TODAY, price });
  return {
    symbol,
    name: symbol,
    bucket: type === "etf" ? "core" : "satellite",
    bucketOverridden: false,
    position: { ...position, estimatedSellCosts: position.shares > 0 ? 0 : position.estimatedSellCosts },
  };
}

const etf = view("0050", "etf", [etfBuy], 110);
const stock = view("2330", "stock", [stockBuy], 550);

beforeEach(async () => {
  await AsyncStorage.clear();
});

async function renderWith(ui: ReactNode, { proPlan = false, pro = false } = {}) {
  if (pro) await AsyncStorage.setItem(PRO_DEMO_UNLOCKED_KEY, "1");
  await render(
    <StaticFeatureFlags flags={{ proPlan }}>
      <ProStatusProvider>{ui}</ProStatusProvider>
    </StaticFeatureFlags>,
  );
}

const portfolio = (holdings: HoldingView[], transactions: Transaction[]) => (
  <PortfolioAnnualizedReturnCard ledger={ledgerOf(transactions)} holdings={holdings} today={TODAY} />
);

describe("年化報酬率畫面（P2-04，對應 docs/stories/028）", () => {
  test("首頁：核心 +10.00%；衛星持有未滿一年；整體以最早一筆算，已滿一年", async () => {
    await renderWith(portfolio([etf, stock], [etfBuy, stockBuy]));
    expect(await screen.findByLabelText("核心年化報酬率 +10.00%")).toBeTruthy();
    expect(screen.getByLabelText(/^衛星年化報酬率 持有未滿一年，第一筆投入到今天不到 365 天/)).toBeTruthy();
    expect(screen.getByLabelText(/^整體年化報酬率 \+/)).toBeTruthy();
  });

  test("首頁：某一組沒有持股，說明原因", async () => {
    await renderWith(portfolio([etf], [etfBuy]));
    expect(await screen.findByLabelText("衛星年化報酬率 —，沒有持股")).toBeTruthy();
  });

  test("首頁：缺少價格，說明原因", async () => {
    await renderWith(portfolio([view("0050", "etf", [etfBuy], null)], [etfBuy]));
    expect(await screen.findByLabelText("核心年化報酬率 —，缺少價格，暫時算不出來")).toBeTruthy();
  });

  test("單一持股：持有 200 天顯示「持有未滿一年」", async () => {
    await renderWith(<HoldingAnnualizedReturnCard ledger={ledgerOf([stockBuy])} position={stock.position} today={TODAY} />);
    expect(await screen.findByText("持有未滿一年")).toBeTruthy();
  });

  test("單一持股：一年 10%", async () => {
    await renderWith(<HoldingAnnualizedReturnCard ledger={ledgerOf([etfBuy])} position={etf.position} today={TODAY} />);
    expect(await screen.findByLabelText("年化報酬率 +10.00%")).toBeTruthy();
  });

  test("Pro 方案開關打開、Free：顯示鎖定卡片，不顯示數字（P2-08）", async () => {
    await renderWith(portfolio([etf], [etfBuy]), { proPlan: true });
    expect(await screen.findByLabelText("年化報酬率，Pro 功能，尚未解鎖")).toBeTruthy();
    expect(screen.queryByLabelText("核心年化報酬率 +10.00%")).toBeNull();
  });

  test("Pro 方案開關打開、Demo 解鎖：顯示數字", async () => {
    await renderWith(portfolio([etf], [etfBuy]), { proPlan: true, pro: true });
    expect(await screen.findByLabelText("核心年化報酬率 +10.00%")).toBeTruthy();
  });
});
