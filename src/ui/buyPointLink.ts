export type BuyPointParams = {
  symbol: string;
  name?: string;
  /** 買入日（ISO） */
  date: string;
  /** 買入價（每股成交價，不含手續費） */
  price: number;
  /** 拍照匯入的期初持股、或日期待補：買入日不是真的那天 */
  imported?: boolean;
  /** 剛存好一筆新的買入：上方多一行「已記下」與「完成」 */
  saved?: boolean;
};

/** 連到「買在高點還是低點」單筆畫面。持股頁的每筆買入、快速試算的結論、存好新買入後都走這裡 */
export function buyPointHref(p: BuyPointParams) {
  return {
    pathname: "/buy-point",
    params: {
      symbol: p.symbol,
      date: p.date,
      price: String(p.price),
      ...(p.name ? { name: p.name } : {}),
      ...(p.imported ? { imported: "1" } : {}),
      ...(p.saved ? { saved: "1" } : {}),
    },
  } as const;
}
