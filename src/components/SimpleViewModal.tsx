// 히트맵 팝업(옛 심플 보기) — 현재 탭 종목을 히트맵(기본) 또는 "현재가 박스"(목/고/현재가/저) 카드 그리드로.
// StockCard 가격박스와 동일한 폰트·색·배경. 메인 카드(자세히)는 그대로.
// (포크: upstream f2993232 의 히트맵 부분만 이식 — 카드 그리드는 포크 옛 심플 보기 그대로)
import { useState, type ReactElement } from "react";
import type { Stock, Price } from "../types";
import { formatSigned, signColor } from "../lib/format";
import { openTossStock } from "../lib/toss";
import { Sparkline } from "./Sparkline";
import { useEscClose } from "../lib/useEscClose";
import { HoldingsHeatmap } from "./HoldingsHeatmap";
import { HEAT_SIZE_OPTS, HEAT_COLOR_OPTS, HEAT_GROUP_OPTS, HEAT_SIGN_OPTS, type HeatSizeBy, type HeatColorBy, type HeatGroupBy, type HeatSign } from "../lib/holdingsHeat";

// 보기 전환(카드 | 히트맵)·히트맵 크기 기준 — 마지막 선택을 기억한다(2026-10-13)
const SIZE_KEY = "simple_heat_size", COLOR_KEY = "simple_heat_color", GROUP_KEY = "simple_heat_group";
const load = <T extends string>(k: string, ok: readonly T[], d: T): T => { try { const v = localStorage.getItem(k) as T; return ok.includes(v) ? v : d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 이번 세션만 */ } };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;                                 // 현재 그룹/탭 이름
  stocks: Stock[];
  priceMap: Map<string, Price>;
  chartMap: Map<string, number[]>;
  targetMap?: Map<string, number | undefined>;   // ticker → 컨센서스 목표가
}

export function SimpleViewModal({ isOpen, onClose, title, stocks, priceMap, chartMap, targetMap }: Props) {
  useEscClose(isOpen, onClose);
  // 열 때는 늘 히트맵부터(사용자 결정 2026-10-13) — 카드는 전환 버튼으로. 그래서 보기는 기억하지 않는다.
  const [view, setView] = useState<"card" | "heat">("heat");
  const [sizeBy, setSizeBy] = useState<HeatSizeBy>(() => load(SIZE_KEY, HEAT_SIZE_OPTS.map(o => o.key), "value"));
  const [colorBy, setColorBy] = useState<HeatColorBy>(() => load(COLOR_KEY, HEAT_COLOR_OPTS.map(o => o.key), "d1"));
  const [groupBy, setGroupBy] = useState<HeatGroupBy>(() => load(GROUP_KEY, HEAT_GROUP_OPTS.map(o => o.key), "none"));
  const [sign, setSign] = useState<HeatSign>("all");   // +만 / −만 — 열 때마다 전체부터(걸러 둔 걸 잊고 종목이 사라진 줄 알지 않게)
  if (!isOpen) return null;
  const seg = (on: boolean) => `px-2 py-0.5 ${on ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white shadow-xl w-full max-w-5xl rounded-t-xl sm:rounded-lg
                      max-h-[92vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b bg-gray-50 flex items-center shrink-0">
          <h2 className="text-lg font-bold">🗺️ 히트맵{title ? ` (${title})` : ""}</h2>
          <span className="ml-3 text-xs text-gray-500">{stocks.length}종목</span>
          <span className="ml-3 inline-flex rounded border border-gray-300 overflow-hidden text-[12px] font-bold">
            <button onClick={() => setView("heat")} className={seg(view === "heat")}>히트맵</button>
            <button onClick={() => setView("card")} className={seg(view === "card")}>카드</button>
          </span>
          {view === "heat" && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-[12px] text-gray-600">
              크기
              <select value={sizeBy} onChange={e => { const v = e.target.value as HeatSizeBy; setSizeBy(v); save(SIZE_KEY, v); }}
                      className="border border-gray-300 rounded px-1 py-0.5 bg-white">
                {HEAT_SIZE_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              색
              <select value={colorBy} onChange={e => { const v = e.target.value as HeatColorBy; setColorBy(v); save(COLOR_KEY, v); }}
                      className="border border-gray-300 rounded px-1 py-0.5 bg-white">
                {HEAT_COLOR_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              그룹
              <select value={groupBy} onChange={e => { const v = e.target.value as HeatGroupBy; setGroupBy(v); save(GROUP_KEY, v); }}
                      className="border border-gray-300 rounded px-1 py-0.5 bg-white">
                {HEAT_GROUP_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <span className="inline-flex rounded border border-gray-300 overflow-hidden font-bold" title="색 기준 값이 +인 종목만 / −인 종목만">
                {HEAT_SIGN_OPTS.map(o => (
                  <button key={o.key} onClick={() => setSign(o.key)}
                          className={`px-2 py-0.5 ${sign === o.key
                            ? (o.key === "up" ? "bg-rose-600 text-white" : o.key === "down" ? "bg-blue-600 text-white" : "bg-gray-800 text-white")
                            : "bg-white text-gray-600 hover:bg-gray-100"}`}>{o.label}</button>
                ))}
              </span>
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </header>

        <div className="px-3 py-3 overflow-y-auto">
          {view === "heat" ? (
            <HoldingsHeatmap stocks={stocks} priceMap={priceMap} sizeBy={sizeBy} colorBy={colorBy} groupBy={groupBy} sign={sign} />
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {stocks.map(stock => {
              const p = priceMap.get(stock.ticker);
              const chart = chartMap.get(stock.ticker) ?? [];
              const target = targetMap?.get(stock.ticker);
              if (!p) {
                return (
                  <div key={`${stock.ticker}_${stock.account || ""}`}
                       className="border border-gray-200 rounded-md bg-gray-50/60 px-2 py-2">
                    <div className="text-sm font-bold text-gray-900 truncate">{stock.name}</div>
                    <div className="text-gray-400 text-sm">—</div>
                  </div>
                );
              }
              const cur = p.price;
              const base = p.prevClose || p.base || cur;       // 오늘 변동 기준 (직전 종가)
              const dayDiff = cur - base;
              const dayPct = base > 0 ? (dayDiff / base) * 100 : 0;
              const priceColor = signColor(dayDiff);

              // 행: 목/고/현재가/저 — 금액 높은→낮은 순 (StockCard 동일)
              const auxRow = (k: string, label: string, labelCls: string, val: number) => {
                const d = val - cur;
                const pct = cur > 0 ? (d / cur) * 100 : 0;
                return {
                  price: val,
                  el: (
                    <div key={k} className="text-xs text-gray-700">
                      <span className={`text-[10px] ${labelCls}`}>{label} </span>
                      {val.toLocaleString()}원
                      <span className={`ml-1 text-[10px] ${signColor(d)}`}>
                        ({formatSigned(d)}원, {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
                      </span>
                    </div>
                  ) as ReactElement,
                };
              };
              const rows: { price: number; el: ReactElement }[] = [];
              if (p.high && p.high > 0) rows.push(auxRow("hi", "고", "text-gray-500", p.high));
              if (p.low && p.low > 0) rows.push(auxRow("lo", "저", "text-gray-500", p.low));
              if (target && target > 0) rows.push(auxRow("tg", "목", "text-amber-600 font-medium", target));
              rows.push({
                price: cur,
                el: (
                  <div key="cur" className="relative z-10">
                    <span className={`text-base font-bold leading-tight mr-1 ${priceColor}`}>
                      {dayDiff > 0 ? "▲" : dayDiff < 0 ? "▼" : "▬"}
                    </span>
                    <span className={`text-xl font-bold leading-tight ${priceColor}`}>
                      {cur.toLocaleString()}원
                    </span>
                    <div className={`flex items-baseline gap-1 pl-6 font-bold ${priceColor}`}>
                      <span className="text-lg leading-tight bg-yellow-100 rounded px-1">
                        {dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%
                      </span>
                      <span className="text-xs font-normal">({formatSigned(dayDiff)}원)</span>
                    </div>
                  </div>
                ),
              });
              rows.sort((a, b) => b.price - a.price);

              return (
                <div key={`${stock.ticker}_${stock.account || ""}`}
                     className="relative overflow-hidden border border-gray-200 rounded-md
                                bg-gray-50/60 px-2 py-1.5 space-y-0.5">
                  {chart.length > 1 && (
                    <Sparkline data={chart} width={300} height={90}
                               target={target}
                               className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" />
                  )}
                  <button onClick={() => openTossStock(stock.ticker)}
                          className={`relative z-10 text-base font-medium hover:underline truncate block max-w-full text-left ${priceColor}`}>
                    {stock.name}
                  </button>
                  {rows.map(r => r.el)}
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SimpleViewModal;
