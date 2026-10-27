import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { features } from "@/config/features";
import { PRO_DEMO_UNLOCKED_KEY } from "@/data/appPrefs";
import { ProStatusProvider } from "@/hooks/useProStatus";
import { DISCLAIMER_TEXT } from "@/ui/DisclaimerGate";
import SettingsScreen from "./SettingsScreen";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  features.proPlan = false;
});

afterAll(() => {
  features.proPlan = false;
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ProStatusProvider>
        <SettingsScreen />
      </ProStatusProvider>
    </SafeAreaProvider>,
  );
}

describe("SettingsScreen 免責聲明（對應 docs/stories/013）", () => {
  test("設定頁隨時看得到免責聲明全文", async () => {
    await renderScreen();
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeTruthy();
  });
});

describe("SettingsScreen Pro 區塊（對應 docs/stories/020）", () => {
  test("功能開關關閉：沒有方案區塊，也沒有 Demo 開關", async () => {
    await renderScreen();
    expect(screen.queryByTestId("current-plan")).toBeNull();
    expect(screen.queryByLabelText("Demo：解鎖所有 Pro 功能")).toBeNull();
    expect(screen.queryByLabelText("查看 Pro 方案")).toBeNull();
  });

  test("功能開關打開：預設是 Free，有「查看 Pro 方案」入口", async () => {
    features.proPlan = true;
    await renderScreen();
    expect(await screen.findByText("目前方案：Free")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("查看 Pro 方案"));
    expect(router.push).toHaveBeenCalledWith("/pro");
  });

  test("打開 Demo 開關：變成 Pro，重開 app 仍維持", async () => {
    features.proPlan = true;
    await renderScreen();
    await fireEvent(screen.getByLabelText("Demo：解鎖所有 Pro 功能"), "valueChange", true);
    expect(await screen.findByText("目前方案：Pro（Demo 解鎖）")).toBeTruthy();
    expect(await AsyncStorage.getItem(PRO_DEMO_UNLOCKED_KEY)).toBe("1");

    await screen.unmount();
    await renderScreen();
    expect(await screen.findByText("目前方案：Pro（Demo 解鎖）")).toBeTruthy();
    expect(screen.getByLabelText("Demo：解鎖所有 Pro 功能").props.value).toBe(true);
  });

  test("關掉 Demo 開關：回到 Free", async () => {
    features.proPlan = true;
    await AsyncStorage.setItem(PRO_DEMO_UNLOCKED_KEY, "1");
    await renderScreen();
    await screen.findByText("目前方案：Pro（Demo 解鎖）");
    await fireEvent(screen.getByLabelText("Demo：解鎖所有 Pro 功能"), "valueChange", false);
    expect(await screen.findByText("目前方案：Free")).toBeTruthy();
    expect(await AsyncStorage.getItem(PRO_DEMO_UNLOCKED_KEY)).toBe("0");
  });
});
