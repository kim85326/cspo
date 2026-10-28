import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRENCIES, LEDGER_MARKETS } from "@/domain/currency";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { DcaRule, Dividend, HoldingSetting, Ledger, Transaction, UserSettings } from "@/domain/ledgerTypes";
import { validateLedger } from "@/domain/ledgerValidation";
import { emptyLedger, migrateSavedHoldings } from "@/domain/migrateSavedHoldings";
import { HOLDINGS_STORAGE_KEY, parseSavedHoldings } from "./asyncStorageHoldingStore";
import type { LedgerStore } from "./LedgerStore";

/** 記帳本的 key。格式若有不相容的改動，就升 v2 並寫搬移。 */
export const LEDGER_STORAGE_KEY = "cspo.ledger.v1";
/** 記帳本讀不懂時，原文先備份在這裡再回空記帳本，之後還救得回來 */
export const CORRUPT_LEDGER_BACKUP_KEY = "cspo.ledger.v1.corrupt";
/** 舊持股有筆數沒搬成功時，舊資料原文留在這裡，不跟著舊 key 一起刪掉 */
export const LEGACY_HOLDINGS_BACKUP_KEY = "cspo.holdings.v1.backup";

export type LegacyMigrationOutcome =
  /** 已經有新記帳本：搬過了（或本來就是新使用者），不再搬 */
  | { kind: "alreadyMigrated" }
  /** 沒有舊資料 */
  | { kind: "nothingToMigrate" }
  /** 舊資料整份讀不懂：不動它、不建新記帳本，下次啟動再試 */
  | { kind: "unreadable" }
  | { kind: "migrated"; migrated: number; skipped: number };

/**
 * 舊版持股（cspo.holdings.v1）→ 新記帳本（cspo.ledger.v1）。docs/stories/008。
 *
 * - 新記帳本已存在就不搬：「新 key 在不在」就是搬過的記號，不會重複搬。
 * - 先寫新記帳本、讀回來比對一字不差，才刪舊 key。寫入或比對失敗就把寫一半的新 key 刪掉並丟錯，
 *   舊資料原封不動，下次啟動再搬一次。
 * - 有筆數被略過（格式不對、價格或股數不合法）時，舊資料原文另存 LEGACY_HOLDINGS_BACKUP_KEY。
 * - 刪舊 key 失敗不要緊：新記帳本已經在了，下次不會再搬。
 */
export async function migrateLegacyHoldings(now: Date): Promise<LegacyMigrationOutcome> {
  if ((await AsyncStorage.getItem(LEDGER_STORAGE_KEY)) != null) return { kind: "alreadyMigrated" };
  const raw = await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY);
  if (raw == null) return { kind: "nothingToMigrate" };

  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return { kind: "unreadable" };
  const items = parseSavedHoldings(parsed);
  const { transactions, skipped } = migrateSavedHoldings(items, { now });
  const skippedCount = skipped.length + (parsed.length - items.length);

  if (skippedCount > 0) await AsyncStorage.setItem(LEGACY_HOLDINGS_BACKUP_KEY, raw);

  const serialized = JSON.stringify({ ...emptyLedger(), transactions } satisfies Ledger);
  try {
    await AsyncStorage.setItem(LEDGER_STORAGE_KEY, serialized);
    if ((await AsyncStorage.getItem(LEDGER_STORAGE_KEY)) !== serialized) {
      throw new Error("記帳本寫入後讀回來不一致");
    }
  } catch (error) {
    // 寫一半的新 key 留著會被當成「搬過了」，舊資料就再也搬不過來
    await AsyncStorage.removeItem(LEDGER_STORAGE_KEY).catch(() => {});
    throw error;
  }

  await AsyncStorage.removeItem(HOLDINGS_STORAGE_KEY).catch(() => {});
  return { kind: "migrated", migrated: transactions.length, skipped: skippedCount };
}

export type AsyncStorageLedgerStoreOptions = {
  /** 現在時間；測試固定用 */
  now?: () => Date;
};

/**
 * 手機本機儲存（AsyncStorage）。第一次讀寫前先跑一次舊資料搬移，搬移失敗時下一次讀寫會再試。
 * - 讀：搬移失敗或資料壞掉（含重播不過）都回空記帳本，不讓 app crash；壞掉的原文先備份。
 * - 寫：搬移還沒成功就丟錯、不寫。先寫了新記帳本，舊資料就會被當成搬過了，再也搬不過來。
 */
export function createAsyncStorageLedgerStore(options: AsyncStorageLedgerStoreOptions = {}): LedgerStore {
  const now = options.now ?? (() => new Date());
  let migration: Promise<boolean> | null = null;
  /** 搬好（或不用搬）回 true；失敗回 false，並讓下一次呼叫重試 */
  const ensureMigrated = () => {
    migration ??= migrateLegacyHoldings(now()).then(
      () => true,
      () => {
        migration = null;
        return false;
      },
    );
    return migration;
  };
  const requireMigrated = async () => {
    if (!(await ensureMigrated())) throw new Error("舊版持股還沒搬到新記帳本，先不寫入");
  };

  return {
    async load() {
      await ensureMigrated();
      try {
        const raw = await AsyncStorage.getItem(LEDGER_STORAGE_KEY);
        if (raw == null) return emptyLedger();
        const ledger = parseLedger(parseJson(raw));
        // 重播不過（例如賣超）也算壞掉：照用會讓計算引擎丟錯（Story 006 決策 12）
        if (ledger && validateLedger(ledger) === null) return ledger;
        await backupCorrupt(raw);
        return emptyLedger();
      } catch {
        return emptyLedger();
      }
    },
    async save(ledger) {
      await requireMigrated();
      await AsyncStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger));
    },
    async clear() {
      await requireMigrated();
      await AsyncStorage.removeItem(LEDGER_STORAGE_KEY);
    },
  };
}

export const asyncStorageLedgerStore: LedgerStore = createAsyncStorageLedgerStore();

/** 只留第一次壞掉的原文；之後再壞不覆蓋，免得救援用的那份被蓋掉 */
async function backupCorrupt(raw: string): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(CORRUPT_LEDGER_BACKUP_KEY)) == null) {
      await AsyncStorage.setItem(CORRUPT_LEDGER_BACKUP_KEY, raw);
    }
  } catch {
    // 備份不了也不擋路
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * JSON → Ledger。整份不像記帳本（不是物件、schemaVersion 不是 1、transactions 不是陣列）回 null；
 * 個別欄位型別不對的交易、股利、持股設定、定期定額規則略過；手續費設定缺的欄位用預設值。
 * 定期定額規則（Story 024）是後來加的選填欄位：舊資料沒有就不帶這個欄位，等於沒有規則，不用搬移。
 * 多幣別欄位（Story 029）也是選填：舊資料沒有就視為台股、TWD、匯率 1；值認不得的只拿掉那個欄位，不丟整筆。
 */
export function parseLedger(value: unknown): Ledger | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.transactions)) return null;
  return {
    schemaVersion: 1,
    transactions: value.transactions.filter(isTransaction).map(dropInvalidMultiCurrency),
    dividends: Array.isArray(value.dividends) ? value.dividends.filter(isDividend).map(dropInvalidMultiCurrency) : [],
    holdingSettings: Array.isArray(value.holdingSettings)
      ? value.holdingSettings.filter(isHoldingSetting).map(dropInvalidMultiCurrency)
      : [],
    settings: parseSettings(value.settings),
    ...(Array.isArray(value.dismissedAutoDividends)
      ? { dismissedAutoDividends: value.dismissedAutoDividends.filter((k): k is string => typeof k === "string") }
      : {}),
    ...(Array.isArray(value.dcaRules) ? { dcaRules: value.dcaRules.filter(isDcaRule) } : {}),
  };
}

/**
 * 拿掉認不得的多幣別欄位（market、currency、fxRate、withholdingTax），讓它回到「沒填」= 台股、TWD、1。
 * 都正常就回傳原本的物件。
 */
function dropInvalidMultiCurrency<T extends Transaction | Dividend | HoldingSetting>(record: T): T {
  const fields = record as Record<string, unknown>;
  const invalid = new Set<string>();
  if ("market" in fields && !(LEDGER_MARKETS as readonly unknown[]).includes(fields.market)) invalid.add("market");
  if ("currency" in fields && !(CURRENCIES as readonly unknown[]).includes(fields.currency)) invalid.add("currency");
  if ("fxRate" in fields && !(isFiniteNumber(fields.fxRate) && fields.fxRate > 0)) invalid.add("fxRate");
  if ("withholdingTax" in fields && !(isFiniteNumber(fields.withholdingTax) && fields.withholdingTax >= 0)) {
    invalid.add("withholdingTax");
  }
  if (invalid.size === 0) return record;
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !invalid.has(key))) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTransaction(value: unknown): value is Transaction {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.symbol === "string" &&
    (value.side === "buy" || value.side === "sell") &&
    typeof value.tradeDate === "string" &&
    isFiniteNumber(value.price) &&
    isFiniteNumber(value.shares) &&
    isFiniteNumber(value.fee) &&
    isFiniteNumber(value.tax) &&
    typeof value.feeOverridden === "boolean" &&
    typeof value.source === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isDividend(value: unknown): value is Dividend {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.symbol === "string" &&
    (value.type === "cash" || value.type === "stock") &&
    typeof value.exDate === "string" &&
    typeof value.status === "string" &&
    typeof value.source === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isHoldingSetting(value: unknown): value is HoldingSetting {
  return (
    isRecord(value) &&
    typeof value.symbol === "string" &&
    (value.bucket === "core" || value.bucket === "satellite")
  );
}

function isDcaRule(value: unknown): value is DcaRule {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.symbol === "string" &&
    isFiniteNumber(value.amount) &&
    isFiniteNumber(value.dayOfMonth) &&
    typeof value.startDate === "string" &&
    typeof value.enabled === "boolean" &&
    Array.isArray(value.handledPeriods) &&
    value.handledPeriods.every((p) => typeof p === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function parseSettings(value: unknown): UserSettings {
  const settings = { ...DEFAULT_USER_SETTINGS };
  if (!isRecord(value)) return settings;
  for (const key of Object.keys(settings) as (keyof UserSettings)[]) {
    const field = value[key];
    if (isFiniteNumber(field) && field >= 0) settings[key] = field;
  }
  return settings;
}
