import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createMemoryLedgerRepository } from "@/data/ledgerRepository";
import { spec37Ledger } from "@/domain/ledgerTestData";
import { useLedger } from "./useLedger";

describe("useLedger（對應 docs/stories/008）", () => {
  test("讀完前 ledger 是 null，讀完帶回記帳本", async () => {
    const repo = createMemoryLedgerRepository(spec37Ledger());
    const { result } = await renderHook(() => useLedger(repo));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ledger).toEqual(spec37Ledger());
  });

  test("任何地方寫入後，用這個 hook 的畫面都跟著更新", async () => {
    const repo = createMemoryLedgerRepository(spec37Ledger(), { now: () => new Date(2026, 9, 27) });
    const a = await renderHook(() => useLedger(repo));
    const b = await renderHook(() => useLedger(repo));
    await waitFor(() => expect(a.result.current.loaded).toBe(true));

    await act(async () => {
      await a.result.current.repository.deleteTransaction("step3");
    });
    expect(a.result.current.ledger?.transactions).toHaveLength(2);
    expect(b.result.current.ledger?.transactions).toHaveLength(2);
  });
});
