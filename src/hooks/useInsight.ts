import { useCallback, useEffect, useRef, useState } from "react";
import { insightProvider } from "@/data";
import { InsightError, type Insight, type InsightProvider } from "@/data/InsightProvider";
import type { InsightInput } from "@/domain/insightInput";

export const INSIGHT_UNKNOWN_ERROR = "AI 解讀失敗，請重試";

export type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; insight: Insight }
  | { status: "error"; message: string };

/**
 * 「AI 解讀」按鈕背後的狀態：idle → loading → done／error，error 時再呼叫 request 就是重試。
 * 元件卸載（例如重新計算、結果卡消失）後才回來的結果直接丟掉。
 */
export function useInsight(
  input: InsightInput,
  provider: InsightProvider = insightProvider,
): { state: InsightState; request: () => Promise<void> } {
  const [state, setState] = useState<InsightState>({ status: "idle" });
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const request = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: "loading" });
    try {
      const insight = await provider.getInsight(input);
      if (mounted.current) setState({ status: "done", insight });
    } catch (error) {
      const message = error instanceof InsightError ? error.message : INSIGHT_UNKNOWN_ERROR;
      if (mounted.current) setState({ status: "error", message });
    } finally {
      busy.current = false;
    }
  }, [input, provider]);

  return { state, request };
}
