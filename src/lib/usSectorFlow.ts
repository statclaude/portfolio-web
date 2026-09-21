// 미국 세션 판정 헬퍼 — upstream usSectorFlow.ts 에서 ETF 구성·등락 TOP 카드가 쓰는 부분만 남긴 포크 축약본.
//   upstream 원본은 TradingView 미국 섹터 스캔(UsSectorFlow) 전체를 담고 있지만, 포크는 batch2 에서
//   한·미 섹터를 TICS 한 판으로 바꾸며 그 화면을 걷어냈다. import 경로는 upstream 과 같게 둬서
//   이후 cherry-pick 이 그대로 붙게 한다.
import { isUsExtendedTradingOpen } from "./format";

/** 이 스냅샷의 등락률이 어느 세션 것인가. 화면에 반드시 밝힌다. */
export type UsBasis = "pre" | "regular" | "post" | "closed";
export const US_BASIS_LABEL: Record<UsBasis, string> = {
  pre: "프리장", regular: "정규장", post: "애프터", closed: "정규장 종가",
};

/** 뉴욕 현지 시각(분) + 요일. 세션 판정 전용 — 초 단위는 필요 없다. */
function nowEt(): { mins: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map(p => [p.type, p.value]));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);   // en-US h23 은 24 를 줄 수 있다
  return { mins: hour * 60 + Number(parts.minute), weekday: wdMap[parts.weekday as string] ?? 1 };
}

/** 지금이 프리장/정규장/애프터/장외 중 어디인가 (ET 시계 기준).
 *  ⚠️ 휴장일을 모른다. */
export function usSessionNow(): UsBasis {
  const { mins, weekday } = nowEt();
  if (weekday === 0 || weekday === 6) return "closed";
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "post";
  return "closed";
}

/** ET 기준 오늘 날짜(YYYY-MM-DD). 야후 일봉의 마지막 봉이 '오늘의 미완성 봉' 인지 가릴 때 쓴다. */
export function etTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());                                 // en-CA = YYYY-MM-DD
}

/** 지금 미국이 어느 장인지 한글 한 마디 — 해외 종목 숫자가 **언제 값인지** 밝히는 배지용.
 *  usSessionNow 는 오버나잇(20:00~04:00 ET)을 모르고 closed 로 주므로 24h 거래창으로 한 번 더 가른다. */
export function usSessionLabel(): string {
  const s = usSessionNow();
  if (s === "pre") return "프리장";
  if (s === "regular") return "정규장";
  if (s === "post") return "애프터";
  return isUsExtendedTradingOpen() ? "오버나잇" : "휴장";
}
