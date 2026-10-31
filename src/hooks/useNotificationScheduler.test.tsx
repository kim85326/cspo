import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, waitFor } from "@testing-library/react-native";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import { DEVICE_PREFS_KEY, resetDevicePrefsForTest } from "@/data/devicePrefs";
import { createMemoryLedgerRepository } from "@/data/ledgerRepository";
import type { StockDirectory } from "@/data/StockDirectory";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { Ledger } from "@/domain/ledgerTypes";
import { makeTx } from "@/domain/ledgerTestData";
import type { ReminderRequest } from "@/domain/notifications";
import * as closeSummaryTask from "@/native/closeSummaryTask";
import * as notifications from "@/native/notifications";
import { StaticFeatureFlags } from "./useFeatures";
import { useNotificationScheduler } from "./useNotificationScheduler";

jest.mock("@/native/notifications", () => ({
  notificationsSupported: true,
  getNotificationPermission: jest.fn(),
  replaceScheduledReminders: jest.fn(async () => {}),
}));

jest.mock("@/native/closeSummaryTask", () => ({
  syncCloseSummaryTask: jest.fn(async () => {}),
}));

const mockedNotifications = notifications as jest.Mocked<typeof notifications>;
const mockedTask = closeSummaryTask as jest.Mocked<typeof closeSummaryTask>;

// 今天固定 2026-10-30（週五）早上 8 點
const NOW = new Date(2026, 9, 30, 8, 0);

function ledger(): Ledger {
  return {
    schemaVersion: 1,
    transactions: [makeTx({ symbol: "0056", side: "buy", price: 35, shares: 1000, tradeDate: "2026-09-01" })],
    dividends: [],
    holdingSettings: [],
    settings: DEFAULT_USER_SETTINGS,
    dcaRules: [
      {
        id: "dca-1",
        symbol: "0050",
        amount: 3000,
        dayOfMonth: 6,
        startDate: "2026-07-01",
        enabled: true,
        handledPeriods: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  };
}

const actions: CorporateActionSource = {
  getActions: jest.fn(async () => [
    { kind: "dividend" as const, symbol: "0056", exDate: "2026-11-13", cashPerShare: 1, stockPerThousand: 0, payDate: null },
  ]),
};
const directory: StockDirectory = {
  getAll: async () => [{ symbol: "0056", name: "元大高股息", market: "TWSE" }] as Awaited<ReturnType<StockDirectory["getAll"]>>,
};

let repository = createMemoryLedgerRepository(ledger());

function Probe() {
  useNotificationScheduler({ repository, actions, directory });
  return null;
}

async function renderWith(notificationsFlag: boolean) {
  await render(
    <StaticFeatureFlags flags={{ notifications: notificationsFlag, proPlan: false }}>
      <Probe />
    </StaticFeatureFlags>,
  );
}

function lastScheduled(): ReminderRequest[] {
  const calls = mockedNotifications.replaceScheduledReminders.mock.calls;
  return calls[calls.length - 1][1] as ReminderRequest[];
}

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval"] });
  await AsyncStorage.clear();
  resetDevicePrefsForTest();
  repository = createMemoryLedgerRepository(ledger());
  jest.clearAllMocks();
  mockedNotifications.getNotificationPermission.mockResolvedValue("granted");
});

afterEach(() => {
  jest.useRealTimers();
});

describe("通知排程（對應 docs/stories/034）", () => {
  test("功能開關關閉：就算設定開著也全部取消、不註冊背景工作", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ closeSummary: true, dcaReminder: true }));
    await renderWith(false);
    await waitFor(() => expect(mockedNotifications.replaceScheduledReminders).toHaveBeenCalled());
    expect(lastScheduled()).toEqual([]);
    expect(mockedTask.syncCloseSummaryTask).toHaveBeenLastCalledWith(false);
    expect(mockedNotifications.getNotificationPermission).not.toHaveBeenCalled();
  });

  test("三種都開、有權限：排退路提醒、除息與扣款提醒，並註冊背景工作", async () => {
    await AsyncStorage.setItem(
      DEVICE_PREFS_KEY,
      JSON.stringify({ closeSummary: true, dividendReminder: true, dcaReminder: true }),
    );
    await renderWith(true);
    await waitFor(() => expect(mockedTask.syncCloseSummaryTask).toHaveBeenCalledWith(true));
    const scheduled = lastScheduled();
    expect(scheduled.filter((r) => r.kind === "closeSummary")).toHaveLength(10);
    expect(scheduled.find((r) => r.kind === "dividend")).toMatchObject({
      date: "2026-11-12",
      title: "0056 元大高股息 明天除息",
    });
    expect(scheduled.find((r) => r.kind === "dca")).toMatchObject({ date: "2026-11-06" });
    expect(actions.getActions).toHaveBeenCalledWith("0056", "2026-10-31", "2026-12-14");
  });

  test("沒有通知權限：不排、不問（權限只在設定頁打開開關時才問）", async () => {
    mockedNotifications.getNotificationPermission.mockResolvedValue("blocked");
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ dcaReminder: true, closeSummary: true }));
    await renderWith(true);
    await waitFor(() => expect(mockedNotifications.replaceScheduledReminders).toHaveBeenCalled());
    expect(lastScheduled()).toEqual([]);
    expect(mockedTask.syncCloseSummaryTask).toHaveBeenLastCalledWith(false);
  });

  test("只開扣款提醒：不抓除權息、不註冊背景工作", async () => {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify({ dcaReminder: true }));
    await renderWith(true);
    await waitFor(() => expect(mockedNotifications.replaceScheduledReminders).toHaveBeenCalled());
    expect(lastScheduled().map((r) => r.kind)).toEqual(["dca", "dca"]);
    expect(actions.getActions).not.toHaveBeenCalled();
    expect(mockedTask.syncCloseSummaryTask).toHaveBeenLastCalledWith(false);
  });
});
