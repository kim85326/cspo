import { arcsOf, donutSegmentPath, groupHoldingSlices, isFullCircle, MAX_HOLDING_SLICES, OTHERS_KEY } from "./allocationChart";

const FULL = 2 * Math.PI;

describe("arcsOf（配置圓餅圖的弧，對應 docs/stories/028）", () => {
  test("依序首尾相接，最後一段剛好到一整圈", () => {
    const arcs = arcsOf([30, 70]);
    expect(arcs[0]).toEqual({ startAngle: 0, endAngle: 0.3 * FULL });
    expect(arcs[1]?.startAngle).toBeCloseTo(0.3 * FULL);
    expect(arcs[1]?.endAngle).toBe(FULL);
  });

  test("顯示用百分比加總是 100：三等分也不留縫", () => {
    const arcs = arcsOf([33.34, 33.33, 33.33]);
    expect(arcs[2]?.endAngle).toBe(FULL);
  });

  test("只有一種類型：0% 那塊不畫，另一塊是整圈", () => {
    const arcs = arcsOf([0, 100]);
    expect(arcs[0]).toBeNull();
    expect(arcs[1]).toEqual({ startAngle: 0, endAngle: FULL });
    expect(isFullCircle(arcs[1]!)).toBe(true);
  });

  test("最後一塊是 0%：前一塊補到整圈", () => {
    const arcs = arcsOf([100, 0]);
    expect(arcs[0]).toEqual({ startAngle: 0, endAngle: FULL });
    expect(arcs[1]).toBeNull();
  });

  test("全部是 0 或空陣列：不畫，不會除以 0", () => {
    expect(arcsOf([0, 0])).toEqual([null, null]);
    expect(arcsOf([])).toEqual([]);
  });

  test("不是整圈就不當成整圈", () => {
    expect(isFullCircle({ startAngle: 0, endAngle: 0.99 * FULL })).toBe(false);
  });
});

describe("donutSegmentPath", () => {
  test("右上四分之一圈：從 12 點鐘外圈到 3 點鐘，再沿內圈回來", () => {
    expect(donutSegmentPath({ startAngle: 0, endAngle: Math.PI / 2 }, 50, 50, 50, 30)).toBe(
      "M 50 0 A 50 50 0 0 1 100 50 L 80 50 A 30 30 0 0 0 50 20 Z",
    );
  });

  test("超過半圈要用大弧旗標", () => {
    expect(donutSegmentPath({ startAngle: 0, endAngle: 1.5 * Math.PI }, 50, 50, 50, 30)).toContain("A 50 50 0 1 1");
  });
});

describe("groupHoldingSlices（每檔持股太多時合成「其他」）", () => {
  const slice = (key: string, marketValue: number) => ({ key, marketValue, ratio: marketValue / 100 });

  test(`${MAX_HOLDING_SLICES} 檔以內全部照列`, () => {
    const slices = [slice("a", 50), slice("b", 30), slice("c", 20)];
    expect(groupHoldingSlices(slices)).toEqual(slices);
  });

  test(`超過 ${MAX_HOLDING_SLICES} 檔：前 ${MAX_HOLDING_SLICES - 1} 檔照列，其餘加總成「其他」`, () => {
    const slices = [40, 20, 10, 10, 8, 6, 4, 2].map((v, i) => slice(`s${i}`, v));
    const grouped = groupHoldingSlices(slices);
    expect(grouped).toHaveLength(MAX_HOLDING_SLICES);
    expect(grouped.slice(0, MAX_HOLDING_SLICES - 1).map((s) => s.key)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    const others = grouped[MAX_HOLDING_SLICES - 1];
    expect(others.key).toBe(OTHERS_KEY);
    expect(others.marketValue).toBe(12);
    expect(others.ratio).toBeCloseTo(0.12);
    // 比例加總仍是 100%
    expect(grouped.reduce((sum, s) => sum + s.ratio, 0)).toBeCloseTo(1);
  });
});
