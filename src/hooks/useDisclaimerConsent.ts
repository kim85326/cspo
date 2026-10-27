import { useCallback, useEffect, useState } from "react";
import { DISCLAIMER_ACCEPTED_KEY, loadFlag, saveFlag } from "@/data/appPrefs";

export type DisclaimerConsent = {
  /** 已讀完手機裡的紀錄，且使用者還沒同意過 → 要顯示免責聲明 */
  needsConsent: boolean;
  /** 使用者按下同意：馬上關掉，並記在手機 */
  accept: () => Promise<void>;
};

/**
 * 首次開啟的免責聲明（Story 013）。同意狀態只存在手機本機。
 * 讀完紀錄之前不顯示，避免已同意過的人每次開 app 都閃一下。
 */
export function useDisclaimerConsent(): DisclaimerConsent {
  const [state, setState] = useState<"loading" | "needed" | "accepted">("loading");

  useEffect(() => {
    let active = true;
    loadFlag(DISCLAIMER_ACCEPTED_KEY).then((accepted) => {
      if (active) setState(accepted ? "accepted" : "needed");
    });
    return () => {
      active = false;
    };
  }, []);

  const accept = useCallback(async () => {
    setState("accepted");
    try {
      await saveFlag(DISCLAIMER_ACCEPTED_KEY, true);
    } catch {
      // 寫不進去的話下次開 app 會再問一次，不影響這次使用
    }
  }, []);

  return { needsConsent: state === "needed", accept };
}
