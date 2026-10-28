import { fireEvent, render, screen } from "@testing-library/react-native";
import type { HoldingView } from "@/domain/holdings";
import { makeTx } from "@/domain/ledgerTestData";
import type { Bucket, SecurityType } from "@/domain/ledgerTypes";
import { computePosition } from "@/domain/position";
import { AllocationCard } from "./AllocationCard";

const TODAY = "2026-10-27";

function holding(symbol: string, name: string, type: SecurityType, shares: number, price: number | null): HoldingView {
  const txs = [makeTx({ symbol, side: "buy", tradeDate: "2026-01-05", price: 100, shares, fee: 0 })];
  const bucket: Bucket = type === "etf" ? "core" : "satellite";
  return {
    symbol,
    name,
    bucket,
    bucketOverridden: false,
    position: computePosition(symbol, txs, [], { type, today: TODAY, price }),
  };
}

// 2330 市值 600,000、0050 300,000、2317 100,000（Story 017 的配置範例）
const tsmc = holding("2330", "台積電", "stock", 1000, 600);
const etf = holding("0050", "元大台灣50", "etf", 2000, 150);
const honhai = holding("2317", "鴻海", "stock", 1000, 100);

describe("AllocationCard 配置圓餅圖（對應 docs/stories/019）", () => {
  test("預設看核心／衛星：核心 30%、衛星 70%", async () => {
    await render(<AllocationCard holdings={[tsmc, etf, honhai]} holdingSettings={[]} />);
    expect(screen.getByLabelText("核心 30.00%，市值 300,000 元")).toBeTruthy();
    expect(screen.getByLabelText("衛星 70.00%，市值 700,000 元")).toBeTruthy();
    expect(screen.getByText("依目前市值計算，合計 1,000,000 元")).toBeTruthy();
  });

  test("切到個股／ETF", async () => {
    await render(<AllocationCard holdings={[tsmc, etf, honhai]} holdingSettings={[]} />);
    await fireEvent.press(screen.getByLabelText("個股／ETF"));
    expect(screen.getByLabelText("個股 70.00%，市值 700,000 元")).toBeTruthy();
    expect(screen.getByLabelText("ETF 30.00%，市值 300,000 元")).toBeTruthy();
  });

  test("切到每檔持股：名稱＋代號，市值大的在前", async () => {
    await render(<AllocationCard holdings={[honhai, tsmc, etf]} holdingSettings={[]} />);
    await fireEvent.press(screen.getByLabelText("每檔持股"));
    expect(screen.getByLabelText("台積電 2330 60.00%，市值 600,000 元")).toBeTruthy();
    expect(screen.getByLabelText("元大台灣50 0050 30.00%，市值 300,000 元")).toBeTruthy();
    expect(screen.getByLabelText("鴻海 2317 10.00%，市值 100,000 元")).toBeTruthy();
  });

  test("使用者把 2317 改成核心：核心 40%、衛星 60%（M-06）", async () => {
    const settings = [{ symbol: "2317", bucket: "core" as const }];
    await render(<AllocationCard holdings={[tsmc, etf, honhai]} holdingSettings={settings} />);
    expect(screen.getByLabelText("核心 40.00%，市值 400,000 元")).toBeTruthy();
    expect(screen.getByLabelText("衛星 60.00%，市值 600,000 元")).toBeTruthy();
  });

  test("只有一種類型：顯示 100% 與 0%，不出錯", async () => {
    await render(<AllocationCard holdings={[etf]} holdingSettings={[]} />);
    expect(screen.getByLabelText("核心 100.00%，市值 300,000 元")).toBeTruthy();
    expect(screen.getByLabelText("衛星 0.00%，市值 0 元")).toBeTruthy();
  });

  test("有持股缺價格：不計入，並提示檔數", async () => {
    await render(<AllocationCard holdings={[tsmc, holding("6488", "環球晶", "stock", 100, null)]} holdingSettings={[]} />);
    expect(screen.getByText("有 1 檔持股缺少價格，沒有算進配置")).toBeTruthy();
    expect(screen.getByLabelText("衛星 100.00%，市值 600,000 元")).toBeTruthy();
  });

  test("全部都缺價格：說明畫不出來", async () => {
    await render(<AllocationCard holdings={[holding("2330", "台積電", "stock", 1000, null)]} holdingSettings={[]} />);
    expect(screen.getByText("持股都還沒有價格，暫時畫不出配置")).toBeTruthy();
  });

  test("價格載入中：先不畫", async () => {
    await render(<AllocationCard holdings={[tsmc]} holdingSettings={[]} pricesLoading />);
    expect(screen.getByText("價格更新中…")).toBeTruthy();
    expect(screen.queryByLabelText(/^衛星/)).toBeNull();
  });
});
