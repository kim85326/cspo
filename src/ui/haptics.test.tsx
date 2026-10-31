import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text } from "react-native";
import { StaticFeatureFlags } from "@/hooks/useFeatures";
import { playHaptic, useHaptics, type HapticKind } from "./haptics";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

const mocked = Haptics as jest.Mocked<typeof Haptics>;

function Probe({ kind }: { kind: HapticKind }) {
  const haptics = useHaptics();
  return (
    <Pressable accessibilityRole="button" onPress={() => haptics[kind]()}>
      <Text>按</Text>
    </Pressable>
  );
}

async function pressWith(kind: HapticKind, haptics: boolean) {
  await render(
    <StaticFeatureFlags flags={{ haptics }}>
      <Probe kind={kind} />
    </StaticFeatureFlags>,
  );
  await fireEvent.press(screen.getByRole("button"));
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  Platform.OS = originalOS;
});

describe("觸覺回饋（對應 docs/stories/036）", () => {
  test("功能開關關閉（預設）：什麼都不做", async () => {
    await pressWith("success", false);
    expect(mocked.notificationAsync).not.toHaveBeenCalled();
    expect(mocked.selectionAsync).not.toHaveBeenCalled();
    expect(mocked.impactAsync).not.toHaveBeenCalled();
  });

  test("存檔成功：成功型回饋", async () => {
    await pressWith("success", true);
    expect(mocked.notificationAsync).toHaveBeenCalledWith("success");
  });

  test("刪除確認：警告型回饋", async () => {
    await pressWith("delete", true);
    expect(mocked.notificationAsync).toHaveBeenCalledWith("warning");
  });

  test("下拉重新整理：輕微撞擊", async () => {
    await pressWith("refresh", true);
    expect(mocked.impactAsync).toHaveBeenCalledWith("light");
  });

  test("切換分頁、開關切換：選取型回饋", async () => {
    await pressWith("selection", true);
    await pressWith("toggle", true);
    expect(mocked.selectionAsync).toHaveBeenCalledTimes(2);
  });

  test("網頁版：功能開關打開也什麼都不做", async () => {
    Platform.OS = "web";
    await pressWith("success", true);
    playHaptic("toggle");
    expect(mocked.notificationAsync).not.toHaveBeenCalled();
    expect(mocked.selectionAsync).not.toHaveBeenCalled();
  });

  test("震動失敗（沒有震動馬達）不會丟錯", async () => {
    mocked.notificationAsync.mockRejectedValueOnce(new Error("no vibrator"));
    mocked.selectionAsync.mockImplementationOnce(() => {
      throw new Error("native module missing");
    });
    expect(() => playHaptic("success")).not.toThrow();
    expect(() => playHaptic("toggle")).not.toThrow();
  });
});
