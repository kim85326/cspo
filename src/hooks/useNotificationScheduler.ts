import { useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  corporateActionSource as defaultActionSource,
  ledgerRepository as defaultRepository,
  stockDirectory as defaultStockDirectory,
} from "@/data";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import { loadCloseSummarySentDate } from "@/data/devicePrefs";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { StockDirectory } from "@/data/StockDirectory";
import { localIsoDate } from "@/domain/buyDate";
import { activeDcaRuleIds } from "@/domain/dca";
import { activeHoldings, buildHoldingViews } from "@/domain/holdings";
import type { Ledger } from "@/domain/ledgerTypes";
import {
  addDays,
  ALL_NOTIFICATION_KINDS,
  planReminders,
  REMINDER_HORIZON_DAYS,
  upcomingExDividends,
  type NotificationSwitches,
} from "@/domain/notifications";
import type { DividendEvent } from "@/domain/types";
import { syncCloseSummaryTask } from "@/native/closeSummaryTask";
import { getNotificationPermission, notificationsSupported, replaceScheduledReminders } from "@/native/notifications";
import { useDcaPlan } from "./useDcaPlan";
import { useDevicePrefs } from "./useDevicePrefs";
import { useFeatures } from "./useFeatures";
import { useLedger } from "./useLedger";

type Deps = {
  repository?: LedgerRepository;
  actions?: CorporateActionSource;
  directory?: StockDirectory;
};

const OFF: NotificationSwitches = { closeSummary: false, dividendReminder: false, dcaReminder: false };

/** 持有中的股票接下來的除息公告。某一檔抓不到就略過那一檔 */
async function fetchUpcoming(ledger: Ledger, actions: CorporateActionSource, today: string) {
  const symbols = activeHoldings(buildHoldingViews(ledger, () => undefined, today)).map((h) => h.symbol);
  const results = await Promise.all(
    symbols.map((symbol) =>
      actions.getActions(symbol, addDays(today, 1), addDays(today, REMINDER_HORIZON_DAYS)).catch(() => []),
    ),
  );
  return upcomingExDividends(
    results.flat().filter((a): a is DividendEvent => a.kind === "dividend"),
    today,
  );
}

async function fetchNames(directory: StockDirectory): Promise<Record<string, string>> {
  try {
    return Object.fromEntries((await directory.getAll()).map((s) => [s.symbol, s.name]));
  } catch {
    return {};
  }
}

/**
 * 本地通知的排程（Story 034），放在根 layout。
 * app 打開、回到前景、記帳本或設定頁開關有變時，把三種通知整批重排一次；收盤損益另外註冊背景工作。
 * - 功能開關 notifications 關閉、設定頁的開關關閉、或沒有通知權限：取消已排的（遠端關掉功能就不會再跳）。
 * - 這裡不跟系統要權限：權限只在設定頁第一次打開開關時才問。
 * - 網頁版什麼都不做。
 */
export function useNotificationScheduler({
  repository = defaultRepository,
  actions = defaultActionSource,
  directory = defaultStockDirectory,
}: Deps = {}): void {
  const enabled = useFeatures().notifications && notificationsSupported;
  const prefs = useDevicePrefs();
  const { ledger } = useLedger(repository);
  const { unlimited, loaded: planLoaded } = useDcaPlan();
  const [foregroundAt, setForegroundAt] = useState(() => Date.now());

  useEffect(() => {
    if (!notificationsSupported) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setForegroundAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  const switches: NotificationSwitches = prefs && enabled ? prefs : OFF;
  const { closeSummary, dividendReminder, dcaReminder } = switches;

  useEffect(() => {
    if (!notificationsSupported || prefs === null || ledger === null || !planLoaded) return;
    let active = true;
    const run = async () => {
      const anyOn = closeSummary || dividendReminder || dcaReminder;
      const granted = anyOn && (await getNotificationPermission()) === "granted";
      const now = new Date();
      const today = localIsoDate(now);
      const on = granted ? { closeSummary, dividendReminder, dcaReminder } : OFF;
      const [upcoming, names, sentOn] = await Promise.all([
        on.dividendReminder ? fetchUpcoming(ledger, actions, today) : Promise.resolve([]),
        on.dividendReminder || on.dcaReminder ? fetchNames(directory) : Promise.resolve({}),
        loadCloseSummarySentDate(),
      ]);
      if (!active) return;
      const requests = planReminders({
        switches: on,
        ledger,
        upcoming,
        activeDcaRuleIds: activeDcaRuleIds(ledger.dcaRules ?? [], unlimited),
        now,
        closeSummarySentOn: sentOn,
        names,
      });
      await replaceScheduledReminders(ALL_NOTIFICATION_KINDS, requests, now);
      await syncCloseSummaryTask(on.closeSummary);
    };
    void run().catch(() => {
      // 排程失敗（例如原生模組出錯）：不影響 app，下次回到前景再排
    });
    return () => {
      active = false;
    };
  }, [
    prefs,
    ledger,
    planLoaded,
    unlimited,
    closeSummary,
    dividendReminder,
    dcaReminder,
    foregroundAt,
    actions,
    directory,
  ]);
}
