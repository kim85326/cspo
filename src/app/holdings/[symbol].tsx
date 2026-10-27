import { useLocalSearchParams } from "expo-router";
import HoldingDetailScreen from "@/screens/HoldingDetailScreen";

/** 路由檔只對應到畫面，畫面本體與測試在 src/screens/。 */
export default function HoldingDetailRoute() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  return <HoldingDetailScreen symbol={String(symbol ?? "")} />;
}
