import { useLocalSearchParams } from "expo-router";
import BuyPointScreen from "@/screens/BuyPointScreen";

/** 「買在高點還是低點」單筆畫面（P2-09）：/buy-point?symbol=2330&date=2026-06-15&price=1100。畫面本體在 src/screens/ */
export default function BuyPointRoute() {
  const params = useLocalSearchParams<{
    symbol: string;
    name?: string;
    date: string;
    price: string;
    imported?: string;
    saved?: string;
  }>();
  return (
    <BuyPointScreen
      symbol={params.symbol}
      name={params.name}
      date={params.date}
      price={Number(params.price)}
      imported={params.imported === "1"}
      saved={params.saved === "1"}
    />
  );
}
