import { localIsoDate } from "@/domain/buyDate";
import type { Bucket, Dividend, Ledger, Transaction, UserSettings } from "@/domain/ledgerTypes";
import {
  validateLedger,
  validateLedgerChange,
  type LedgerChange,
  type LedgerError,
} from "@/domain/ledgerValidation";
import type { LedgerStore } from "./LedgerStore";
import { createMemoryLedgerStore } from "./memoryLedgerStore";

/** 新增交易時由畫面填的欄位；id、createdAt、updatedAt 由 repository 補 */
export type TransactionDraft = Omit<Transaction, "id" | "createdAt" | "updatedAt">;
/** 新增股利時由畫面填的欄位；id、createdAt、updatedAt 由 repository 補 */
export type DividendDraft = Omit<Dividend, "id" | "createdAt" | "updatedAt">;

/** 寫進手機失敗（記憶體裡的記帳本不會變，畫面可以請使用者再試一次） */
export type SaveFailedError = { code: "saveFailed"; message: string };

/**
 * 每個寫入方法的結果。
 * - ok：已驗證並存進手機，ledger 是新的整份記帳本。
 * - 失敗：error.message 直接給畫面顯示；驗證錯誤（賣超、欄位不合法、找不到）沿用 LedgerError。
 */
export type LedgerWriteResult =
  | { ok: true; ledger: Ledger }
  | { ok: false; error: LedgerError | SaveFailedError };

/**
 * 畫面用的記帳本：讀、訂閱變更、新增／修改／刪除交易與股利、改核心／衛星與手續費設定。
 * 所有寫入都先經過 validateLedgerChange（從頭重播，賣超就拒絕），存進手機成功後才更新記憶體並通知訂閱者。
 * 寫入依呼叫順序一個一個做，不會互相覆蓋。見 docs/stories/008。
 */
export interface LedgerRepository {
  /** 目前的記帳本；還沒讀完是 null */
  getSnapshot(): Ledger | null;
  /** 從手機讀出記帳本（第一次會順便搬舊資料）。重複呼叫只讀一次，之後回傳目前的記帳本 */
  load(): Promise<Ledger>;
  /** 丟掉記憶體裡的記帳本，重新從手機讀並通知訂閱者（還原備份後、測試清空 AsyncStorage 後用） */
  reload(): Promise<Ledger>;
  /** 記帳本變了就呼叫 listener；回傳取消訂閱的函式 */
  subscribe(listener: () => void): () => void;

  addTransaction(draft: TransactionDraft): Promise<LedgerWriteResult>;
  /**
   * 一次新增好幾筆（截圖匯入，Story 015）：全部驗證通過才一起存，任何一筆不合格就整批不寫。
   * 依陣列順序新增，每筆的 createdAt 相同。
   */
  addTransactions(drafts: TransactionDraft[]): Promise<LedgerWriteResult>;
  /** 整筆取代（依 id）；updatedAt 由 repository 更新 */
  updateTransaction(transaction: Transaction): Promise<LedgerWriteResult>;
  deleteTransaction(id: string): Promise<LedgerWriteResult>;

  addDividend(draft: DividendDraft): Promise<LedgerWriteResult>;
  updateDividend(dividend: Dividend): Promise<LedgerWriteResult>;
  deleteDividend(id: string): Promise<LedgerWriteResult>;

  /** 手動切換某檔的核心／衛星（M-06）；傳 null 改回依類型的預設 */
  setBucket(symbol: string, bucket: Bucket | null): Promise<LedgerWriteResult>;
  /** 改手續費設定；只影響之後新增的交易，已存交易的手續費不重算 */
  updateSettings(settings: Partial<UserSettings>): Promise<LedgerWriteResult>;
  /** 整份取代（過渡轉接、之後的還原備份用）；重播不過就拒絕 */
  replaceLedger(ledger: Ledger): Promise<LedgerWriteResult>;
}

export type LedgerRepositoryOptions = {
  /** 現在時間；決定 createdAt／updatedAt 與「今天」（交易日期不可晚於今天）。測試固定用 */
  now?: () => Date;
  /** 產生 id；預設用時間 + 流水號 + 亂數 */
  newId?: (prefix: "tx" | "div") => string;
};

export function createLedgerRepository(
  store: LedgerStore,
  options: LedgerRepositoryOptions = {},
): LedgerRepository {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? defaultId;
  const listeners = new Set<() => void>();
  let snapshot: Ledger | null = null;
  let loading: Promise<Ledger> | null = null;
  /** 寫入排隊：每次寫入都等前一次做完，拿最新的記帳本來改 */
  let queue: Promise<unknown> = Promise.resolve();

  const notify = () => listeners.forEach((listener) => listener());

  const load = async (): Promise<Ledger> => {
    loading ??= store.load().then((ledger) => {
      // 讀的途中已經有寫入完成，就以寫入後的為準
      if (snapshot === null) {
        snapshot = ledger;
        notify();
      }
      return ledger;
    });
    await loading;
    return snapshot as Ledger;
  };

  const reload = async (): Promise<Ledger> => {
    await queue.catch(() => {});
    snapshot = null;
    loading = null;
    notify();
    return load();
  };

  /** 排進佇列：拿最新記帳本算出下一份，驗證通過再存，存成功才更新並通知 */
  const write = (compute: (ledger: Ledger, today: string) => LedgerWriteResult): Promise<LedgerWriteResult> => {
    const run = async (): Promise<LedgerWriteResult> => {
      const current = await load();
      const result = compute(current, localIsoDate(now()));
      if (!result.ok) return result;
      try {
        await store.save(result.ledger);
      } catch {
        return { ok: false, error: { code: "saveFailed", message: "存檔失敗，請再試一次" } };
      }
      snapshot = result.ledger;
      notify();
      return result;
    };
    const next = queue.then(run, run);
    queue = next;
    return next;
  };

  const change = (c: LedgerChange) => write((ledger, today) => validateLedgerChange(ledger, c, today));
  const stamp = () => now().toISOString();

  return {
    getSnapshot: () => snapshot,
    load,
    reload,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    addTransaction(draft) {
      const at = stamp();
      return change({ kind: "addTransaction", transaction: { ...draft, id: newId("tx"), createdAt: at, updatedAt: at } });
    },
    addTransactions(drafts) {
      const at = stamp();
      return write((ledger, today) => {
        let next = ledger;
        for (const draft of drafts) {
          const transaction = { ...draft, id: newId("tx"), createdAt: at, updatedAt: at };
          const result = validateLedgerChange(next, { kind: "addTransaction", transaction }, today);
          if (!result.ok) return result;
          next = result.ledger;
        }
        return { ok: true, ledger: next };
      });
    },
    updateTransaction(transaction) {
      return change({ kind: "updateTransaction", transaction: { ...transaction, updatedAt: stamp() } });
    },
    deleteTransaction(id) {
      return change({ kind: "deleteTransaction", id });
    },

    addDividend(draft) {
      const at = stamp();
      return change({ kind: "addDividend", dividend: { ...draft, id: newId("div"), createdAt: at, updatedAt: at } });
    },
    updateDividend(dividend) {
      return change({ kind: "updateDividend", dividend: { ...dividend, updatedAt: stamp() } });
    },
    deleteDividend(id) {
      return change({ kind: "deleteDividend", id });
    },

    setBucket(symbol, bucket) {
      return write((ledger) => {
        const others = ledger.holdingSettings.filter((s) => s.symbol !== symbol);
        const holdingSettings = bucket === null ? others : [...others, { symbol, bucket }];
        return { ok: true, ledger: { ...ledger, holdingSettings } };
      });
    },
    updateSettings(settings) {
      return write((ledger) => ({ ok: true, ledger: { ...ledger, settings: { ...ledger.settings, ...settings } } }));
    },
    replaceLedger(next) {
      return write(() => {
        const error = validateLedger(next);
        return error ? { ok: false, error } : { ok: true, ledger: next };
      });
    },
  };
}

/** 記憶體版：測試與畫面開發用，資料不進手機。initial 沒給就是空記帳本 */
export function createMemoryLedgerRepository(
  initial?: Ledger,
  options: LedgerRepositoryOptions = {},
): LedgerRepository {
  return createLedgerRepository(createMemoryLedgerStore(initial), options);
}

let idSeq = 0;

function defaultId(prefix: "tx" | "div"): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
