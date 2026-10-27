import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ledgerStore } from "@/data";
import { HOLDINGS_STORAGE_KEY } from "@/data/asyncStorageHoldingStore";
import { MIGRATED_NOTE } from "@/domain/migrateSavedHoldings";
import CalculateScreen from "./CalculateScreen";

// 獨立一個檔案：搬移在 app 第一次讀寫記帳本時跑一次，跟其他畫面測試放一起會被先跑掉。

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

test("舊版存了 2 檔：升級後第一次開 app，兩檔都帶回畫面，記帳本有 2 筆買入（對應 docs/stories/008）", async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(
    HOLDINGS_STORAGE_KEY,
    JSON.stringify([
      { symbol: "2317", buyPrice: "200", shares: "1000" },
      { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/10/05" },
    ]),
  );

  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CalculateScreen />
    </SafeAreaProvider>,
  );

  expect(await screen.findByDisplayValue("鴻海（2317）")).toBeTruthy();
  expect(screen.getByDisplayValue("台積電（2330）")).toBeTruthy();
  expect(screen.getByText("2026/10/05")).toBeTruthy();

  const { transactions } = await ledgerStore.load();
  expect(transactions.map((t) => [t.symbol, t.side, t.note?.startsWith(MIGRATED_NOTE)])).toEqual([
    ["2317", "buy", true],
    ["2330", "buy", true],
  ]);
  await waitFor(async () => expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).toBeNull());
});
