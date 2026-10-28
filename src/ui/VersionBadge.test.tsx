import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { RawVersionSources } from "@/domain/versionInfo";
import { VersionBadge } from "./VersionBadge";

// 剪貼簿是原生功能，Jest 裡換成假的；預設複製成功
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

const APK_OTA: RawVersionSources = {
  platform: "android",
  isDev: false,
  executionEnvironment: "standalone",
  configVersion: "1.0.0",
  nativeAppVersion: "1.0.0",
  nativeBuildVersion: "4",
  updatesEnabled: true,
  isEmbeddedLaunch: false,
  updateId: "9c3f7b1e-aaaa-bbbb-cccc-ddddeeeeffff",
  updateCreatedAt: new Date(2026, 9, 27, 16, 5),
  runtimeVersion: "a1b2c3d4e5",
  channel: "preview",
  otaMessage: "修正比較卡排序",
};

describe("VersionBadge（對應 docs/stories/032）", () => {
  test("平常只顯示一行版本，點一下展開詳細資訊，再點收合", async () => {
    await render(<VersionBadge sources={APK_OTA} />);
    expect(screen.getByText(/v1\.0\.0 · build 4 · OTA 10\/27 16:05/)).toBeTruthy();
    expect(screen.queryByTestId("version-details")).toBeNull();

    await fireEvent.press(screen.getByLabelText("版本資訊"));
    expect(screen.getByTestId("version-details")).toBeTruthy();
    expect(screen.getByText("a1b2c3d4e5")).toBeTruthy();
    expect(screen.getByText("preview")).toBeTruthy();
    expect(screen.getByText("9c3f7b1e-aaaa-bbbb-cccc-ddddeeeeffff")).toBeTruthy();
    expect(screen.getByText("修正比較卡排序")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("版本資訊"));
    expect(screen.queryByTestId("version-details")).toBeNull();
  });

  test("按「複製版本資訊」把完整資訊放進剪貼簿", async () => {
    await render(<VersionBadge sources={APK_OTA} />);
    await fireEvent.press(screen.getByLabelText("版本資訊"));
    await fireEvent.press(screen.getByLabelText("複製版本資訊"));

    const copied = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)?.[0] ?? "";
    expect(copied.split("\n")[0]).toBe("賺了嗎 v1.0.0 · build 4 · OTA 10/27 16:05");
    expect(copied).toContain("Update ID：9c3f7b1e-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(await screen.findByText("已複製，可以貼進 bug 回報")).toBeTruthy();
  });

  test("複製失敗（例如網頁版擋剪貼簿）：提示改用長按選取", async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    await render(<VersionBadge sources={{ ...APK_OTA, platform: "web", executionEnvironment: "bare", isDev: true }} />);
    expect(screen.getByText(/開發版（網頁版）/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("版本資訊"));
    await fireEvent.press(screen.getByLabelText("複製版本資訊"));
    expect(await screen.findByText("複製失敗，請長按上面的文字選取")).toBeTruthy();
  });
});
