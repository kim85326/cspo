import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HOLDINGS_STORAGE_KEY } from "@/data/asyncStorageHoldingStore";
import HomeScreen from "./HomeScreen";

// 獨立一個檔案：搬移在 app 第一次讀寫記帳本時跑一次，跟其他畫面測試放一起會被先跑掉。

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

test("舊版存了 2 檔：升級後第一次開 app，首頁總覽就看得到這兩檔（對應 docs/stories/008、011）", async () => {
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
      <HomeScreen />
    </SafeAreaProvider>,
  );

  expect(await screen.findByTestId("home-holding-2330")).toBeTruthy();
  expect(screen.getByTestId("home-holding-2317")).toBeTruthy();
  expect(screen.queryByText("還沒有任何交易")).toBeNull();
});
