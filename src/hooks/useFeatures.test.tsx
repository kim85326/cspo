import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";
import type { Features } from "@/config/features";
import { FEATURE_FLAGS_KEY } from "@/data/remoteFeatureFlags";
import { FeatureFlagsProvider, useFeatures } from "./useFeatures";

function Probe() {
  const features = useFeatures();
  return <Text testID="flags">{JSON.stringify(features)}</Text>;
}

function shown(): Features {
  return JSON.parse(String(screen.getByTestId("flags").props.children));
}

/** 攔下 AppState 的監聽，測試裡手動送「回到前景」 */
let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(async () => {
  await AsyncStorage.clear();
  appStateListeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderWith(fetchRemote: () => Promise<Partial<Features> | null>) {
  await render(
    <FeatureFlagsProvider fetchRemote={fetchRemote}>
      <Probe />
    </FeatureFlagsProvider>,
  );
}

describe("FeatureFlagsProvider（對應 docs/stories/033）", () => {
  test("沒包 Provider：用打包預設（Jest 沒設環境變數，全部關閉）", async () => {
    await render(<Probe />);
    expect(shown()).toEqual({ screenshotImport: false, aiInsight: false, proPlan: false });
  });

  test("網路還沒回來時先用預設值畫面，不卡住；抓到後重新 render 並存起來", async () => {
    let resolve: (value: Partial<Features>) => void = () => {};
    const fetchRemote = jest.fn(() => new Promise<Partial<Features>>((r) => (resolve = r)));
    await renderWith(fetchRemote);
    expect(shown().aiInsight).toBe(false);

    await act(async () => resolve({ aiInsight: true }));
    expect(shown().aiInsight).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(FEATURE_FLAGS_KEY))!)).toEqual({ aiInsight: true });
  });

  test("抓不到遠端：用上次存的值", async () => {
    await AsyncStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify({ proPlan: true }));
    const fetchRemote = jest.fn(async () => null);
    await renderWith(fetchRemote);
    await waitFor(() => expect(shown().proPlan).toBe(true));
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });

  test("fetchRemote 意外丟錯：app 不壞，維持預設", async () => {
    const fetchRemote = jest.fn(async () => {
      throw new Error("boom");
    });
    await renderWith(fetchRemote);
    await waitFor(() => expect(fetchRemote).toHaveBeenCalled());
    expect(shown()).toEqual({ screenshotImport: false, aiInsight: false, proPlan: false });
  });

  test("回到前景時再抓一次，畫面跟著更新；進背景不抓", async () => {
    const fetchRemote = jest
      .fn<Promise<Partial<Features> | null>, []>()
      .mockResolvedValueOnce({ aiInsight: true })
      .mockResolvedValueOnce({ aiInsight: false, proPlan: true });
    await renderWith(fetchRemote);
    await waitFor(() => expect(shown().aiInsight).toBe(true));

    await act(async () => appStateListeners.forEach((listener) => listener("background")));
    expect(fetchRemote).toHaveBeenCalledTimes(1);

    await act(async () => appStateListeners.forEach((listener) => listener("active")));
    await waitFor(() => expect(shown()).toEqual({ screenshotImport: false, aiInsight: false, proPlan: true }));
    expect(fetchRemote).toHaveBeenCalledTimes(2);
  });
});
