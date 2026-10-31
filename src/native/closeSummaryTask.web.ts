/** 網頁版沒有背景工作（Story 034），全部什麼都不做 */
export const CLOSE_SUMMARY_TASK = "cspo-close-summary";

export async function backgroundTasksAvailable(): Promise<boolean> {
  return false;
}

export async function syncCloseSummaryTask(_enabled: boolean): Promise<void> {}
