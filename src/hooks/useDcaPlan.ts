import { useFeatures } from "./useFeatures";
import { useProStatus } from "./useProStatus";

export type DcaPlan = {
  /** 規則數量不限：Pro，或方案功能（proPlan 開關）沒開、根本沒有 Free／Pro 之分 */
  unlimited: boolean;
  /** 方案狀態讀完了沒（讀完前不要自動產生，免得 Pro 使用者被當成 Free） */
  loaded: boolean;
  /** 是否顯示 Free／Pro 相關文字 */
  showPlan: boolean;
};

/** 定期定額的方案限制（P2-08：Free 1 條規則、Pro 不限），見 docs/stories/024 */
export function useDcaPlan(): DcaPlan {
  const { pro, loaded } = useProStatus();
  const showPlan = useFeatures().proPlan;
  return { unlimited: !showPlan || pro, loaded: loaded || !showPlan, showPlan };
}
