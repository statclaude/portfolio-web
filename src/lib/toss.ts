// 토스 외부 링크 — 모바일에서는 토스 앱(supertoss://) deep link 우선,
// 미설치/실패 시 5초 후 https 새 탭으로 폴백(로그인할 시간을 넉넉히 줌). PC 는 https 새 탭만.
// 참고: MobileStockCard 에 있던 패턴을 일반화해 추출.
//
// 네이티브 APK 에서는 새 탭(window.open)이 아니라 Capacitor Browser 플러그인으로 연다 —
// WebView 의 window.open → 안드로이드 Intent 로 새 탭을 넘기는 경로가 일부 사이트(토스 등)에서
// "PC로 접속해주세요" 로 잘못 인식되는 문제가 있어, 같은 Custom Tab 이라도 좀 더 표준적인
// 경로인 Browser.open() 으로 통일한다.

import { isNativeApp } from "./nativeProxy";
import { Browser } from "@capacitor/browser";

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod/i;

function isMobile(): boolean {
  return typeof navigator !== "undefined" && MOBILE_UA_RE.test(navigator.userAgent);
}

// Yahoo 심볼 → 토스 페이지 URL 매핑 (지수/환율/미국 ETF).
// 지수 탭 quoteUrl 들이 공통으로 참조 — 한 곳에서만 관리.
export const TOSS_SYMBOL_URL: Record<string, string> = {
  // 한국 지수
  "^KS11": "https://www.tossinvest.com/indices/KGG01P",
  "^KQ11": "https://www.tossinvest.com/indices/QGG01P",
  // 미국 지수·선물
  "^SOX":  "https://www.tossinvest.com/indices/SOX.NAI",
  "^IXIC": "https://www.tossinvest.com/indices/COMP.NAI",
  "NQ=F":  "https://www.tossinvest.com/indices/RFU.NQc1",
  "^GSPC": "https://www.tossinvest.com/indices/SPX.CBI",
  "ES=F":  "https://www.tossinvest.com/indices/RFU.ESc1",
  "^DJI":  "https://www.tossinvest.com/indices/DJI.DJI",
  "RTY=F": "https://www.tossinvest.com/indices/RFU.RTYc1",
  "^VIX":  "https://www.tossinvest.com/indices/RGI..VIX",
  // 환율 — KRW=X 는 개별 통화 코드가 아니라 토스의 환율 허브 페이지("exchange-rate")로 연결됨.
  //   EUR/JPY 는 토스 허브 페이지에 해당 데이터가 없어 매핑하지 않음 — quoteUrl() 이 자동으로
  //   야후(finance.yahoo.com/quote/EURKRW=X 등)로 폴백됨.
  "DX-Y.NYB": "https://www.tossinvest.com/indices/RGI..DXY",
  // ?tab=지수·환율 — 사용자가 실기기에서 확인해 준, 토스 사이트 내 "달러 환율" 링크가
  // 실제로 가리키는 정확한 주소(쿼리 없는 버전은 앱 딥링크에서 정보를 못 불러옴).
  "KRW=X":    "https://www.tossinvest.com/indices/exchange-rate?tab=%EC%A7%80%EC%88%98%E3%83%BB%ED%99%98%EC%9C%A8",
  // 미국 국채금리 커브
  "^US2Y": "https://www.tossinvest.com/indices/ROB.US2YT-RR",
  "^FVX":  "https://www.tossinvest.com/indices/ROB.US5YT-RR",
  "^TNX":  "https://www.tossinvest.com/indices/ROB.US10YT-RR",
  "^TYX":  "https://www.tossinvest.com/indices/ROB.US30YT-RR",
  // 원자재 (토스 overview 로 일원화 — 야후 대신 토스 인덱스 페이지)
  "GC=F":  "https://www.tossinvest.com/indices/RFU.GCv1",
  "SI=F":  "https://www.tossinvest.com/indices/RFU.SIv1",
  "CL=F":  "https://www.tossinvest.com/indices/RFU.CLv1",
  "NG=F":  "https://www.tossinvest.com/indices/RFU.NGv1",
  "HG=F":  "https://www.tossinvest.com/indices/RFU.HGv1",
  // 비트코인 — 토스 원화 인덱스
  "BTC-USD": "https://www.tossinvest.com/indices/VWAP.KRW-BTC",
  // V-KOSPI — CNBC (토스/야후 미제공)
  "VKOSPI": "https://www.cnbc.com/quotes/.KSVKOSPI",
  // 미국 빅테크 개별주 (토스 종목 페이지)
  "SPCX": "https://www.tossinvest.com/stocks/NAS2606012004",
  "AAPL": "https://www.tossinvest.com/stocks/US19801212001",
  "MSFT": "https://www.tossinvest.com/stocks/US19860313001",
  "GOOGL":"https://www.tossinvest.com/stocks/US20040819002",
  "AMZN": "https://www.tossinvest.com/stocks/US19970515001",
  "META": "https://www.tossinvest.com/stocks/US20120518001",
  "TSLA": "https://www.tossinvest.com/stocks/US20100629001",
  // 미국 대표 ETF (토스 종목 페이지)
  "SPY": "https://www.tossinvest.com/stocks/US19930122001",
  "QQQ": "https://www.tossinvest.com/stocks/US19990310001",
  "DIA": "https://www.tossinvest.com/stocks/US19980120001",
  "IWM": "https://www.tossinvest.com/stocks/US20000526007",
  "VTI": "https://www.tossinvest.com/stocks/US20010531001",
  // 미국 반도체 개별주 (토스 종목 페이지)
  "MU":   "https://www.tossinvest.com/stocks/US19890516001",
  "NVDA": "https://www.tossinvest.com/stocks/US19990122001",
  "SNDK": "https://www.tossinvest.com/stocks/NAS0250224006",   // 샌디스크 (2025 상장 → NAS 프리픽스)
  "SKHY": "https://www.tossinvest.com/stocks/NAS2607010002",   // SK하이닉스 ADR (2026 상장, WI→정규 SKHY)
  "AMAT": "https://www.tossinvest.com/stocks/US19721012001",
  "LRCX": "https://www.tossinvest.com/stocks/US19840504001",
  "ASML": "https://www.tossinvest.com/stocks/US19950315001",
  "AMD":  "https://www.tossinvest.com/stocks/US20150102001",
  "AVGO": "https://www.tossinvest.com/stocks/US20090806002",
  "ORCL": "https://www.tossinvest.com/stocks/US19860312001",
  "INTC": "https://www.tossinvest.com/stocks/US19711013001",
  "QCOM": "https://www.tossinvest.com/stocks/US19911213001",
  "TSM":  "https://www.tossinvest.com/stocks/US19971008002",   // TSMC (파운드리)
  // 미국 섹터 ETF (토스 종목 페이지)
  "SMH":  "https://www.tossinvest.com/stocks/US20191211007",
  "PAVE": "https://www.tossinvest.com/stocks/US20170308001",
  "LIT":  "https://www.tossinvest.com/stocks/US20100723002",
  "XBI":  "https://www.tossinvest.com/stocks/US20060206001",
  "KBE":  "https://www.tossinvest.com/stocks/US20051115001",
  "ITA":  "https://www.tossinvest.com/stocks/US20060505010",
  "XLV":  "https://www.tossinvest.com/stocks/US19981222008",
  "KOID": "https://www.tossinvest.com/stocks/NAS0250605002",
  "BOTZ": "https://www.tossinvest.com/stocks/US20160913001",
  // 외국인 투심 프록시 (MSCI Korea ETF)
  "EWY":  "https://www.tossinvest.com/stocks/US20000512001",
  "KORU": "https://www.tossinvest.com/stocks/US20130410003",   // Direxion 3x 한국 불 (선행·투심 증폭)
};

// "exchange-rate" 는 다른 항목(RFU.GCv1, RGI..DXY 같은)처럼 개별 종목/지수 코드가
// 아니라, 달러환율(USD/KRW) 전용으로 따로 만든 웹 허브 페이지다(토스 자체 API 에서도
// 종목코드 대신 "EXCHANGE_RATE" 라는 특수 카테고리로 취급 — 실제 개별 코드가 없음을 확인함).
// 1차 시도: nextLandingUrl 래퍼 없이 https 주소를 그대로 넘기는 방식 — 실기기 테스트 결과 실패
// ("정보를 불러올 수 없어요" 그대로). 2차 시도: 토스 사이트 자체가 내부적으로 쓰는 정확한 주소
// (?tab=지수·환율 쿼리 포함, TOSS_SYMBOL_URL["KRW=X"] 에 반영)로 다른 항목들과 동일하게
// nextLandingUrl 래퍼를 태워 보낸다 — 이것도 안 되면 앱 시도 자체를 건너뛰고 곧장 웹으로
// 여는 방식(이전 커밋에서 검증됨: 로그인 없이 정상 로드)으로 되돌려야 한다.

function isTossUrl(httpsUrl: string): boolean {
  try {
    return /(^|\.)tossinvest\.com$/.test(new URL(httpsUrl).hostname);
  } catch {
    return false;
  }
}

// tossinvest.com URL 을 받아 토스 앱 deep link 로 변환.
// 비(非) toss URL 은 null(=앱 시도 안 함).
function toDeepLink(httpsUrl: string): string | null {
  try {
    const u = new URL(httpsUrl);
    if (!/(^|\.)tossinvest\.com$/.test(u.hostname)) return null;
    // 앱 내부 navigation 용 service.tossinvest.com 래퍼 사용
    const inner = `https://service.tossinvest.com?nextLandingUrl=${u.pathname}${u.search}`;
    return `supertoss://securities?url=${encodeURIComponent(inner)}`;
  } catch {
    return null;
  }
}

// 새 탭/외부 브라우저로 열기 — 네이티브 앱은 Capacitor Browser(Custom Tab), 웹은 window.open.
function openInBrowser(url: string): void {
  if (isNativeApp()) {
    void Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// 임의의 URL 열기 — toss URL 이면 모바일에서 앱 시도 후 https 폴백, 그 외는 새 탭.
// 토스 앱이 뜨면(로그인 화면 포함) 5초 동안은 폴백하지 않고 기다린다 — 너무 빨리
// 폴백하면 로그인하려는 도중에 앱 화면 위로 웹페이지가 겹쳐 뜨는 것처럼 보일 수 있다.
export function openExternal(url: string): void {
  const deep = toDeepLink(url);
  if (deep && isMobile()) {
    location.href = deep;
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        openInBrowser(url);
      }
    }, 5000);
    return;
  }
  openInBrowser(url);
}

// <a href={url}> 의 onClick 핸들러로 사용.
// 모바일에서는 기본 동작 가로채 토스 앱 우선 → 폴백 https.
// 비-toss URL 은 기본 동작 유지 (네이버 금융 등 그대로 새 탭).
// (toss URL 은 항상 openExternal()/Browser.open() 을 타야 한다 — 기본 <a target=_blank>
//  로 새면 WebView 의 window.open → Intent 경로로 새어나가 "PC로 접속해주세요"
//  오인식 문제가 재발한다.)
export function handleTossLinkClick(
  e: React.MouseEvent<HTMLAnchorElement | HTMLElement>,
  url: string,
): void {
  // 새 탭 modifier(중클릭·cmd·ctrl) 는 브라우저 기본 동작 유지
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
  if (!isTossUrl(url) || !isMobile()) return;
  e.preventDefault();
  e.stopPropagation();
  openExternal(url);
}

// 토스 종목 내부코드 기억 — 검색/랭킹에서 받은 productCode(US 등: US20100629001) 저장.
//  US 종목은 ticker(TSLA)로 URL 못 만들고 내부코드가 필요해서, 받을 때 기억해 둠.
const TOSS_CODE_KEY = "toss_stock_code";
function loadTossCodes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TOSS_CODE_KEY) || "{}") as Record<string, string>; }
  catch { return {}; }
}
export function getTossCode(ticker: string): string | null {
  const remembered = loadTossCodes()[ticker];
  if (remembered) return remembered;
  // 명시 매핑(TOSS_SYMBOL_URL) 의 /stocks/US... 에서 내부코드 추출 (NVDA·MU·SPY 등)
  const m = TOSS_SYMBOL_URL[ticker]?.match(/\/stocks\/(US\w+)/);
  return m ? m[1] : null;
}
export function rememberTossCode(ticker: string, productCode: string): void {
  if (!ticker || !productCode) return;
  if (/^[\dA-Za-z]{6}$/.test(ticker)) return;   // KR 6자리는 A{ticker} 로 충분 — 기억 불필요
  try {
    const m = loadTossCodes();
    if (m[ticker] === productCode) return;
    m[ticker] = productCode;
    localStorage.setItem(TOSS_CODE_KEY, JSON.stringify(m));
  } catch { /* noop */ }
}
// 토스 종목 URL — 명시 매핑 > 기억된 US 내부코드 > KR 6자리. 알 수 없으면 null(ATSLA 같은 깨진 링크 방지).
export function tossStockUrl(ticker: string): string | null {
  if (TOSS_SYMBOL_URL[ticker]) return TOSS_SYMBOL_URL[ticker];
  const code = loadTossCodes()[ticker];
  if (code) return `https://www.tossinvest.com/stocks/${code}`;
  if (/^[\dA-Za-z]{6}$/.test(ticker)) return `https://tossinvest.com/stocks/A${ticker}`;
  return null;
}

// 종목 클릭 → 토스 stocks 페이지. KR/US 자동 (US는 기억된 내부코드 사용).
export function openTossStock(ticker: string): void {
  const url = tossStockUrl(ticker);
  if (url) openExternal(url);
}
