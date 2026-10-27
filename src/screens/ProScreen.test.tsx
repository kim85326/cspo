import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { features } from "@/config/features";
import { PRO_DEMO_UNLOCKED_KEY } from "@/data/appPrefs";
import { PRO_FEATURES } from "@/domain/plan";
import { ProStatusProvider } from "@/hooks/useProStatus";
import ProScreen from "./ProScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  // 導頁在測試裡看不到，改成畫出目的地，方便斷言
  Redirect: ({ href }: { href: string }) => {
    const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>{`redirect:${href}`}</MockText>;
  },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  features.proPlan = true;
});

afterAll(() => {
  features.proPlan = false;
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ProStatusProvider>
        <ProScreen />
      </ProStatusProvider>
    </SafeAreaProvider>,
  );
}

describe("ProScreen（對應 docs/stories/020）", () => {
  test("功能開關關閉：直接導回首頁", async () => {
    features.proPlan = false;
    await renderScreen();
    expect(screen.getByText("redirect:/")).toBeTruthy();
    expect(screen.queryByLabelText("升級 Pro")).toBeNull();
  });

  test("Free：方案比較表列出每項 Pro 功能，預覽全部是鎖住的", async () => {
    await renderScreen();
    for (const feature of PRO_FEATURES) {
      expect(screen.getAllByText(feature.title).length).toBeGreaterThanOrEqual(1);
      expect(await screen.findByLabelText(`${feature.title}，Pro 功能，尚未解鎖`)).toBeTruthy();
    }
    expect(screen.getByText("1 條規則")).toBeTruthy();
    expect(screen.getByText("近 1 個月")).toBeTruthy();
  });

  test("按「升級 Pro」：只顯示「Pro 方案即將推出」，不進入付款", async () => {
    await renderScreen();
    expect(screen.queryByText("Pro 方案即將推出")).toBeNull();
    await fireEvent.press(screen.getByLabelText("升級 Pro"));
    expect(await screen.findByText("Pro 方案即將推出")).toBeTruthy();
    expect(screen.getByText(/不會向你收取任何費用/)).toBeTruthy();
  });

  test("Demo 開關已打開：全部解鎖，不顯示升級按鈕", async () => {
    await AsyncStorage.setItem(PRO_DEMO_UNLOCKED_KEY, "1");
    await renderScreen();
    expect(await screen.findByText("已解鎖所有 Pro 功能")).toBeTruthy();
    for (const feature of PRO_FEATURES) {
      expect(screen.getByLabelText(`${feature.title}，已解鎖`)).toBeTruthy();
    }
    expect(screen.queryByLabelText("升級 Pro")).toBeNull();
  });
});
