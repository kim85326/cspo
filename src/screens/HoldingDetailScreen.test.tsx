import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createLedgerRepository, type LedgerRepository } from "@/data/ledgerRepository";
import { createMemoryLedgerStore } from "@/data/memoryLedgerStore";
import type { PriceSource } from "@/data/PriceSource";
import type { Ledger } from "@/domain/ledgerTypes";
import { makeTx, spec37, spec37Ledger } from "@/domain/ledgerTestData";
import { pnlColors } from "@/ui/theme";
import HoldingDetailScreen from "./HoldingDetailScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const TODAY = "2026-10-27";
const prices: PriceSource = {
  async getQuote(symbol) {
    if (symbol === "2330") return { symbol, name: "台積電", price: spec37.price };
    if (symbol === "0050") return { symbol, name: "元大台灣50", price: 180 };
    return null;
  },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.mocked(router.push).mockClear();
});

async function renderScreen(symbol: string, repository: LedgerRepository) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HoldingDetailScreen symbol={symbol} repository={repository} prices={prices} today={TODAY} />
    </SafeAreaProvider>,
  );
}

const repoOf = (ledger: Ledger) => createLedgerRepository(createMemoryLedgerStore(ledger));

describe("HoldingDetailScreen 單一持股（對應 docs/stories/010）", () => {
  test("M-04 AC1：3.7 範例的數字摘要", async () => {
    await renderScreen("2330", repoOf(spec37Ledger()));
    expect(await screen.findByLabelText("持有股數 1,500 股")).toBeTruthy();
    expect(screen.getByLabelText("平均成本 550.78")).toBeTruthy();
    expect(screen.getByLabelText("參考價 620.00")).toBeTruthy();
    expect(screen.getByLabelText("市值 930,000")).toBeTruthy();
    expect(screen.getByLabelText("未實現損益 +99,710（+12.07%）")).toBeTruthy();
    expect(screen.getByLabelText("已實現損益 +48,170")).toBeTruthy();
    expect(screen.getByLabelText("已領股利 5,000")).toBeTruthy();
    expect(screen.getByLabelText("持有天數 295 天")).toBeTruthy();
    expect(screen.getByLabelText("總報酬")).toHaveTextContent("+152,880");
    expect(screen.getByLabelText("總報酬")).toHaveStyle({ color: pnlColors.up });
    expect(screen.getByLabelText("報酬率")).toHaveTextContent("+13.88%");
    expect(screen.getByText("賺了")).toBeTruthy();
  });

  test("交易與股利依日期新到舊", async () => {
    await renderScreen("2330", repoOf(spec37Ledger()));
    await screen.findByLabelText("持有股數 1,500 股");
    const labels = screen
      .getAllByLabelText(/^2026-\d\d-\d\d /)
      .map((el) => String(el.props.accessibilityLabel).slice(0, 10));
    expect(labels).toEqual(["2026-06-15", "2026-03-05", "2026-02-05", "2026-01-05"]);
    expect(screen.getByText("現金股利 5,000 元")).toBeTruthy();
    expect(screen.getByText("賣出 500 股 @ 650.00")).toBeTruthy();
    expect(screen.getByText("手續費 463 · 證交稅 975")).toBeTruthy();
  });

  test("點交易進編輯；新增交易帶入代號", async () => {
    await renderScreen("2330", repoOf(spec37Ledger()));
    await fireEvent.press(await screen.findByLabelText("2026-03-05 賣出 500 股 @ 650.00，編輯這筆交易"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/transaction/[id]", params: { id: "step3" } });

    await fireEvent.press(screen.getByRole("button", { name: "新增 2330 的交易" }));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/transaction/new", params: { symbol: "2330" } });
  });

  test("M-06 AC1：0050 預設核心", async () => {
    const ledger = { ...spec37Ledger(), transactions: [makeTx({ symbol: "0050", side: "buy", price: 160, shares: 1000, fee: 228 })], dividends: [] };
    await renderScreen("0050", repoOf(ledger));
    expect(await screen.findByRole("radio", { name: "核心" })).toBeChecked();
    expect(screen.getByText(/預設ETF歸核心/)).toBeTruthy();
  });

  test("M-06 AC2：手動切換後，重新開啟 App 仍保留設定", async () => {
    const store = createMemoryLedgerStore(spec37Ledger());
    await renderScreen("2330", createLedgerRepository(store));
    expect(await screen.findByRole("radio", { name: "衛星" })).toBeChecked();

    await fireEvent.press(screen.getByRole("radio", { name: "核心" }));
    expect(await screen.findByText(/你已手動改過/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "核心" })).toBeChecked();
    expect((await store.load()).holdingSettings).toEqual([{ symbol: "2330", bucket: "core" }]);

    // 「重新開啟」：同一份存檔，新的 repository、新的畫面
    await renderScreen("2330", createLedgerRepository(store));
    expect(await screen.findByRole("radio", { name: "核心" })).toBeChecked();
  });

  test("已出清：不顯示股數與市值，只顯示已實現與股利", async () => {
    const ledger = {
      ...spec37Ledger(),
      transactions: [
        ...spec37Ledger().transactions,
        makeTx({ side: "sell", tradeDate: "2026-09-01", price: 600, shares: 1500, fee: 1282, tax: 2700 }),
      ],
    };
    await renderScreen("2330", repoOf(ledger));
    expect(await screen.findByText(/已出清/)).toBeTruthy();
    expect(screen.queryByLabelText(/^持有股數/)).toBeNull();
    expect(screen.queryByLabelText("K 線圖")).toBeNull();
    expect(screen.getByLabelText(/^已實現損益 \+/)).toBeTruthy();
  });

  test("記帳本裡沒有這檔：提示並可新增交易", async () => {
    await renderScreen("2454", repoOf(spec37Ledger()));
    expect(await screen.findByText("記帳本裡沒有 2454 的紀錄")).toBeTruthy();
  });
});
