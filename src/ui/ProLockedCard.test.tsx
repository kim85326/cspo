import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Text } from "react-native";
import { PRO_DEMO_UNLOCKED_KEY } from "@/data/appPrefs";
import { ProStatusProvider } from "@/hooks/useProStatus";
import { ProGate } from "./ProLockedCard";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

async function renderGate() {
  await render(
    <ProStatusProvider>
      <ProGate feature="annualizedReturn">
        <Text>年化報酬率 12.3%</Text>
      </ProGate>
    </ProStatusProvider>,
  );
}

describe("ProGate（對應 docs/stories/020）", () => {
  test("Free：不顯示內容，改顯示功能預覽與「升級 Pro」按鈕", async () => {
    await renderGate();
    expect(await screen.findByLabelText("年化報酬率，Pro 功能，尚未解鎖")).toBeTruthy();
    expect(screen.getByLabelText("升級 Pro，解鎖年化報酬率")).toBeTruthy();
    expect(screen.queryByText("年化報酬率 12.3%")).toBeNull();
  });

  test("按鎖定卡片的「升級 Pro」：前往 Pro 方案介紹頁", async () => {
    await renderGate();
    await fireEvent.press(await screen.findByLabelText("升級 Pro，解鎖年化報酬率"));
    expect(router.push).toHaveBeenCalledWith("/pro");
  });

  test("Demo 開關打開：直接顯示內容", async () => {
    await AsyncStorage.setItem(PRO_DEMO_UNLOCKED_KEY, "1");
    await renderGate();
    expect(await screen.findByText("年化報酬率 12.3%")).toBeTruthy();
    expect(screen.queryByLabelText("升級 Pro，解鎖年化報酬率")).toBeNull();
  });
});
