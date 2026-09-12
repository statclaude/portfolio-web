import { FundFlowCard } from "./FundFlowCard";
import { MarketTurnoverCard } from "./MarketTurnoverCard";
import { IntradayInvestorSection } from "./IntradayInvestorSection";
import { NewsFeed } from "./NewsFeed";
import { InvestorFlowTab } from "./InvestorFlowTab";

// 증시 탭 — 증시 자금동향(예탁금/신용/펀드) + 거래대금(코스피·코스닥) + 시간별 투자자 순매수 + 증시 뉴스.
//   PC(App)·모바일 공용 — 이 한 파일이 양쪽 증시 탭의 본문이다.
export function StockMarketTab() {
  return (
    <div className="space-y-3">
      <FundFlowCard />
      <MarketTurnoverCard />
      <IntradayInvestorSection />
      {/* 외국인·기관 순매수 랭킹 — 위(투자자 순매수)가 '시장 전체 합계가 시간에 따라',
          여기가 '어느 종목을' 이다. 합계를 먼저 보고 종목으로 내려가는 순서. */}
      <InvestorFlowTab />
      <NewsFeed />
    </div>
  );
}
