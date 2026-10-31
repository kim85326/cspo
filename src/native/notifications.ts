import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { Linking, Platform } from "react-native";
import { isPast, type NotificationKind, type ReminderRequest } from "@/domain/notifications";

/**
 * expo-notifications 的薄包裝（Story 034）。只用本地通知：不拿推播 token、不需要 FCM／推播伺服器。
 * 網頁版用 notifications.web.ts（全部什麼都不做）。
 *
 * - Android 8 起通知一定要掛在頻道上；Android 13 起要先建好頻道，系統才會跳出權限詢問。
 * - 沒有宣告 SCHEDULE_EXACT_ALARM（Android 14 起預設不給、Google Play 也限制用途），
 *   所以排的時間是「大約」：系統可能為了省電晚幾分鐘跳出。提醒類通知可以接受。
 * - 每則通知的 data 帶 { app: "cspo", kind }，重排時只取消自己排的那幾種。
 */
export const notificationsSupported = true;

export const CHANNEL_ID = "reminders";

/** granted：可以發；undetermined：還沒問過；blocked：被拒絕而且不能再問，只能請使用者去系統設定開 */
export type NotificationPermission = "granted" | "undetermined" | "blocked";

let channelReady: Promise<void> | null = null;

function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "收盤損益與提醒",
    description: "收盤後的今日損益、除息日前一天、定期定額扣款日",
    importance: AndroidImportance.DEFAULT,
  })
    .then(() => undefined)
    .catch(() => {
      channelReady = null;
    });
  return channelReady;
}

function toPermission(response: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (response.granted) return "granted";
  if (response.ios?.status === IosAuthorizationStatus.PROVISIONAL) return "granted";
  return response.canAskAgain ? "undetermined" : "blocked";
}

/** 只查，不跳出詢問 */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return "blocked";
  }
}

/** 第一次打開通知開關時呼叫：還沒問過就跳出系統詢問；已經被拒絕就直接回 blocked */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  try {
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (toPermission(current) !== "undetermined") return toPermission(current);
    return toPermission(
      await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } }),
    );
  } catch {
    return "blocked";
  }
}

/** 被拒絕後：打開這個 app 在系統設定裡的頁面（Android 是「應用程式資訊」，裡面有「通知」） */
export function openNotificationSettings(): Promise<void> {
  return Linking.openSettings();
}

/** app 開著時收到通知也要顯示（預設不顯示） */
export function setForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

type CspoData = { app: "cspo"; kind: NotificationKind };

function isOurs(request: Notifications.NotificationRequest, kinds: readonly NotificationKind[]): boolean {
  const data = request.content.data as Partial<CspoData> | undefined;
  return data?.app === "cspo" && !!data.kind && kinds.includes(data.kind);
}

/**
 * 把 kinds 這幾種通知整批換成 requests：先取消已排的同類通知，再排新的。時間已過的略過。
 * kinds 裡有、requests 裡沒有的種類（例如開關被關掉）就只是全部取消。
 */
export async function replaceScheduledReminders(
  kinds: readonly NotificationKind[],
  requests: readonly ReminderRequest[],
  now: Date = new Date(),
): Promise<void> {
  await ensureChannel();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((r) => isOurs(r, kinds)).map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier)),
  );
  for (const request of requests) {
    if (!kinds.includes(request.kind) || isPast(request, now)) continue;
    const [y, m, d] = request.date.split("-").map(Number);
    await Notifications.scheduleNotificationAsync({
      identifier: request.id,
      content: { title: request.title, body: request.body, data: { app: "cspo", kind: request.kind } satisfies CspoData },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(y, m - 1, d, request.hour, request.minute),
        channelId: CHANNEL_ID,
      },
    });
  }
}

export async function cancelScheduledReminder(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // 本來就沒有這則：不用處理
  }
}

/** 立刻發一則（背景工作算完收盤損益時用） */
export async function presentNotificationNow(kind: NotificationKind, title: string, body: string): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { app: "cspo", kind } satisfies CspoData },
    trigger: { channelId: CHANNEL_ID },
  });
}
