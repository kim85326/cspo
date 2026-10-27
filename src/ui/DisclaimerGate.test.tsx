import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DISCLAIMER_ACCEPTED_KEY } from "@/data/appPrefs";
import { DISCLAIMER_TEXT, DisclaimerGate } from "./DisclaimerGate";

beforeEach(async () => {
  await AsyncStorage.clear();
});

/** 等手機紀錄讀完（讀完前什麼都不顯示） */
async function flush() {
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(DISCLAIMER_ACCEPTED_KEY));
}

describe("DisclaimerGate（對應 docs/stories/013）", () => {
  test("第一次開啟：顯示免責聲明全文", async () => {
    await render(<DisclaimerGate />);
    expect(await screen.findByText(DISCLAIMER_TEXT)).toBeTruthy();
    expect(screen.getByLabelText("我已了解並同意")).toBeTruthy();
  });

  test("按下同意後關掉，並記在手機；重開不再出現", async () => {
    await render(<DisclaimerGate />);
    await fireEvent.press(await screen.findByLabelText("我已了解並同意"));
    expect(screen.queryByText(DISCLAIMER_TEXT)).toBeNull();
    expect(await AsyncStorage.getItem(DISCLAIMER_ACCEPTED_KEY)).toBe("1");

    await screen.unmount();
    await render(<DisclaimerGate />);
    await flush();
    expect(screen.queryByText(DISCLAIMER_TEXT)).toBeNull();
  });

  test("手機裡的紀錄不是合法值：當作沒同意過，再問一次", async () => {
    await AsyncStorage.setItem(DISCLAIMER_ACCEPTED_KEY, "yes?");
    await render(<DisclaimerGate />);
    expect(await screen.findByText(DISCLAIMER_TEXT)).toBeTruthy();
  });
});
