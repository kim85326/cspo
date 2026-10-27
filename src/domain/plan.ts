/**
 * Free／Pro 方案（product-spec P2-08、docs/stories/020-pro-plan-lock.md）。
 * Tech Day 只做畫面，不串金流；這裡只描述「哪些功能是 Pro」與「怎麼判斷是不是 Pro」。
 */

export type ProFeatureId =
  | "annualizedReturn"
  | "etfDuelFull"
  | "dividendAutoFill"
  | "recurringInvestment"
  | "assetHistory";

export type ProFeature = {
  id: ProFeatureId;
  title: string;
  /** 功能說明，鎖住時也照樣顯示，讓使用者知道升級後會得到什麼 */
  description: string;
  /** 方案比較表的 Free 欄；「—」表示 Free 完全不能用 */
  free: string;
  /** 方案比較表的 Pro 欄 */
  pro: string;
};

/** 依實作指南 T14 列出的 Pro 功能，文字對照 product-spec P2-08 的方案表。順序就是畫面上的順序。 */
export const PRO_FEATURES: readonly ProFeature[] = [
  {
    id: "annualizedReturn",
    title: "年化報酬率",
    description: "把每一筆投入的時間算進去，換算成每年平均報酬，持有時間不同的股票也能放在一起比。",
    free: "—",
    pro: "✓",
  },
  {
    id: "etfDuelFull",
    title: "個股 vs ETF 對決（完整）",
    description: "除了核心與衛星並排比較，再模擬「同一筆錢當初改放 0050」現在會是多少。",
    free: "只有核心 vs 衛星",
    pro: "✓ 完整",
  },
  {
    id: "dividendAutoFill",
    title: "股利自動帶入",
    description: "除權息後自動記上現金股利與股票股利，不用自己對帳單一筆筆輸入。",
    free: "—",
    pro: "✓",
  },
  {
    id: "recurringInvestment",
    title: "定期定額自動記帳",
    description: "設定每月扣款日與金額，到期自動產生買入紀錄。",
    free: "1 條規則",
    pro: "不限",
  },
  {
    id: "assetHistory",
    title: "資產走勢與配置",
    description: "看總市值與累計投入的長期走勢，以及核心、衛星與每檔持股的配置比例。",
    free: "近 1 個月",
    pro: "全部期間",
  },
];

/** 目前能讓人變成 Pro 的來源。之後串金流，在這裡加上訂閱狀態即可。 */
export type Entitlement = {
  /** 設定頁的 Demo 開關（只為了展示，不是真的付費） */
  demoUnlocked: boolean;
};

/** 是不是 Pro。所有 Pro 功能都只透過這個函式判斷，之後串金流只改這一處。 */
export function isPro(entitlement: Entitlement): boolean {
  return entitlement.demoUnlocked;
}
