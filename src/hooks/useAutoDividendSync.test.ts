import { renderHook, waitFor } from "@testing-library/react-native";
import { fakeCorporateActionSource } from "@/data/fakeCorporateActionSource";
import { createMemoryLedgerRepository } from "@/data/ledgerRepository";
import { spec37Ledger } from "@/domain/ledgerTestData";
import { useAutoDividendSync } from "./useAutoDividendSync";

const now = () => new Date(2026, 9, 28, 10);

describe("useAutoDividendSync（對應 docs/stories/012）", () => {
  test("掛上時跑一次自動帶入；重新 render 不會再跑", async () => {
    const repository = createMemoryLedgerRepository(spec37Ledger(), { now });
    const getActions = jest.spyOn(fakeCorporateActionSource, "getActions");
    const deps = { repository, actions: fakeCorporateActionSource, now };
    const { rerender } = await renderHook(() => useAutoDividendSync(deps));
    await waitFor(() => expect(repository.getSnapshot()?.dividends.filter((d) => d.source === "auto")).toHaveLength(3));
    await rerender({});
    expect(getActions).toHaveBeenCalledTimes(1);
    getActions.mockRestore();
  });
});
