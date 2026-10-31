import type { NotificationKind, ReminderRequest } from "@/domain/notifications";

/**
 * 網頁版：沒有本地通知（Story 034）。設定頁看到 notificationsSupported 為 false 就不顯示通知區塊，
 * 這裡的函式只是讓共用程式碼可以照常呼叫，全部什麼都不做。
 */
export const notificationsSupported = false;

export const CHANNEL_ID = "reminders";

export type NotificationPermission = "granted" | "undetermined" | "blocked";

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return "blocked";
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return "blocked";
}

export async function openNotificationSettings(): Promise<void> {}

export function setForegroundNotificationHandler(): void {}

export async function replaceScheduledReminders(
  _kinds: readonly NotificationKind[],
  _requests: readonly ReminderRequest[],
  _now?: Date,
): Promise<void> {}

export async function cancelScheduledReminder(_id: string): Promise<void> {}

export async function presentNotificationNow(_kind: NotificationKind, _title: string, _body: string): Promise<void> {}
