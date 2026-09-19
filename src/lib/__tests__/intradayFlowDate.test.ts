import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKrIntradayInvestorFlow, fetchLatestFlowBizdate } from "../api";

// 네이버 trend/time 은 bizdate 파라미터를 무시하고 항상 '최신 거래일' 하루치만 준다(실측 2026-09-20).
//   → 요청한 날짜와 다른 날 데이터는 버려야 한다. 안 그러면 9/18 값이 9/17 차트로 그려진다.
const row = (bizdate: string, time: string, foreign = 1e8) => ({
  bizdate, time,
  netAmounts: [{ investorGubun: "9000", diffValue: String(foreign) }, { investorGubun: "8000", diffValue: "-2e8" }],
});

function mockTrend(rows: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const startIdx = Number(new URL(decodeURIComponent(String(url).split("?url=")[1] ?? url)).searchParams.get("startIdx") ?? 0);
    // 서버는 하루치를 한 페이지로 준다고 단순화 — 첫 페이지만 내용, 이후 빈 응답 + last
    const content = startIdx === 0 ? rows : [];
    return new Response(JSON.stringify({ content, last: true }), { status: 200 });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("시간별 투자자 순매수 — 날짜 불일치 방어", () => {
  it("요청 날짜와 응답 날짜가 같으면 그대로 점을 만든다", async () => {
    mockTrend([row("20260918", "090100"), row("20260918", "090230")]);
    const r = await fetchKrIntradayInvestorFlow("kospi", "20260918");
    expect(r.points.map(p => p.time)).toEqual(["09:01", "09:02"]);
    expect(r.servedDate).toBe("2026-09-18");
  });

  it("과거 날짜를 요청하면 다른 날 데이터를 버리고 빈 배열 + 실제 제공일을 알려준다", async () => {
    mockTrend([row("20260918", "090100"), row("20260918", "090230")]);
    const r = await fetchKrIntradayInvestorFlow("kospi", "20260917");
    expect(r.points).toEqual([]);
    expect(r.servedDate).toBe("2026-09-18");
  });

  it("최신 거래일 조회는 1행만 받아 YYYY-MM-DD 로 돌려준다", async () => {
    mockTrend([row("20260918", "200400")]);
    expect(await fetchLatestFlowBizdate()).toBe("2026-09-18");
  });

  it("bizdate 가 없거나 이상하면 null", async () => {
    mockTrend([{ time: "090100", netAmounts: [] }]);
    expect(await fetchLatestFlowBizdate()).toBeNull();
  });
});
