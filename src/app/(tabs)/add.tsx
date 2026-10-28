import { Redirect } from "expo-router";

/**
 * 分頁列中間的「新增」只是入口：按下去在 (tabs)/_layout.tsx 攔下來，改 push 交易畫面，
 * 交易畫面才會蓋在分頁上、有返回鍵。直接打開 /add（例如網址）也導去同一個畫面。
 */
export default function AddTab() {
  return <Redirect href="/transaction/new" />;
}
