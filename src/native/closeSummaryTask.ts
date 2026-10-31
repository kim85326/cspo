import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { resolveFeatures } from "@/config/features";
import { candleSource, ledgerRepository, priceSource } from "@/data";
import { runCloseSummaryJob } from "@/data/closeSummaryJob";
import { loadCloseSummarySentDate, loadDevicePrefs, saveCloseSummarySentDate } from "@/data/devicePrefs";
import { loadStoredFlags } from "@/data/remoteFeatureFlags";
import { cancelScheduledReminder, presentNotificationNow } from "./notifications";

/**
 * 收盤損益的背景工作（Story 034），用 SDK 58 建議的 expo-background-task（Android 是 WorkManager）。
 *
 * 系統限制（寫在 docs/stories/034）：
 * - 最短 15 分鐘一次，而且只是「至少隔這麼久」：什麼時候真的跑由系統決定，要有網路、電量夠；
 *   各家手機的省電機制（小米、OPPO…）可能更久才跑、甚至不跑。
 * - 使用者從最近使用的 app 把它滑掉（強制停止）後就不會跑，下次打開 app 才恢復。
 * - Expo Go 的 Android 不支援背景工作（TaskManager.isAvailableAsync() 為 false），要用 APK 測。
 * 所以另外排了每個平日 19:00 的「打開 app 看看」退路提醒；背景工作成功發出當天的損益就取消當天的退路。
 *
 * 這個檔案必須在 app 一啟動就被 import（src/app/_layout.tsx 最上面）：
 * 系統在背景叫醒 app 時不會掛載任何畫面，defineTask 要在模組載入時就執行。
 */
export const CLOSE_SUMMARY_TASK = "cspo-close-summary";

/** 背景工作的最短間隔（分鐘）。14:30 ～ 19:00 之間大概會被叫起來幾次 */
const INTERVAL_MINUTES = 30;

if (!TaskManager.isTaskDefined(CLOSE_SUMMARY_TASK)) {
  TaskManager.defineTask(CLOSE_SUMMARY_TASK, async () => {
    try {
      await runCloseSummaryJob({
        now: () => new Date(),
        isEnabled: async () => {
          const [prefs, stored] = await Promise.all([loadDevicePrefs(), loadStoredFlags()]);
          return prefs.closeSummary && resolveFeatures({ stored }).notifications;
        },
        loadLastSent: loadCloseSummarySentDate,
        saveLastSent: saveCloseSummarySentDate,
        loadLedger: () => ledgerRepository.load(),
        priceSource,
        candleSource,
        present: (title, body) => presentNotificationNow("closeSummary", title, body),
        cancelReminder: cancelScheduledReminder,
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** 這支手機（或 Expo Go）能不能跑背景工作 */
export async function backgroundTasksAvailable(): Promise<boolean> {
  try {
    const [managerOk, status] = await Promise.all([TaskManager.isAvailableAsync(), BackgroundTask.getStatusAsync()]);
    return managerOk && status === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}

/** 收盤損益開著就註冊、關著就取消。已經是那個狀態就不動 */
export async function syncCloseSummaryTask(enabled: boolean): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(CLOSE_SUMMARY_TASK);
    if (enabled && !registered) {
      if (!(await backgroundTasksAvailable())) return;
      await BackgroundTask.registerTaskAsync(CLOSE_SUMMARY_TASK, { minimumInterval: INTERVAL_MINUTES });
    } else if (!enabled && registered) {
      await BackgroundTask.unregisterTaskAsync(CLOSE_SUMMARY_TASK);
    }
  } catch {
    // 註冊失敗：還有 19:00 的退路提醒
  }
}
