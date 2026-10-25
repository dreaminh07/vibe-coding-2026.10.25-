"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatEok,
  formatThousands,
  formatWon,
  insightDates,
  summarizeInsights,
  type InsightDay,
  type InsightItem,
} from "@/lib/insights";
import styles from "./insights-dashboard.module.css";

type ApiResponse = { data: { items: InsightItem[] }; meta: { status: "ok" | "empty" } };
type Props = { initialEndDate: string; mode: "demo" | "live" };

async function fetchDay(date: string, signal?: AbortSignal): Promise<InsightDay> {
  try {
    const response = await fetch(`/api/box-office?date=${date}&type=daily`, {
      cache: "no-store",
      signal,
    });
    const body = (await response.json()) as ApiResponse | { error?: { message?: string } };
    if (!response.ok || !("data" in body) || !("meta" in body)) {
      const message = "error" in body ? body.error?.message : undefined;
      throw new Error(message || "일별 데이터를 가져오지 못했습니다.");
    }
    return {
      date,
      status: body.meta.status === "empty" ? "empty" : "ok",
      items: body.data.items,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      date,
      status: "error",
      error: error instanceof Error ? error.message : "일별 조회에 실패했습니다.",
    };
  }
}

function TrendChart({ days }: { days: InsightDay[] }) {
  const summary = summarizeInsights(days);
  const values = summary.points.flatMap((point) => (point.sales === null ? [] : [point.sales]));
  const max = values.reduce((current, value) => (value > current ? value : current), 1n);
  const width = 720;
  const height = 230;
  const x = (index: number) => 28 + (index * (width - 56)) / Math.max(1, days.length - 1);
  const y = (value: bigint) => 190 - Number((value * 150_000n) / max) / 1000;
  const segments: string[] = [];
  let segment = "";
  summary.points.forEach((point, index) => {
    if (point.sales === null) {
      if (segment) segments.push(segment);
      segment = "";
      return;
    }
    segment += `${segment ? " L" : "M"} ${x(index)} ${y(point.sales)}`;
  });
  if (segment) segments.push(segment);

  return (
    <svg className={styles.line} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="날짜별 Top 10 관측 매출 합계 추이">
      <line className={styles.axis} x1="28" y1="190" x2="692" y2="190" />
      {segments.map((path, index) => <path className={styles.path} d={path} key={index} />)}
      {summary.points.map((point, index) => point.sales === null ? (
        <circle className={styles.gap} cx={x(index)} cy="190" r="5" key={point.date} />
      ) : (
        <g key={point.date}>
          <circle className={styles.dot} cx={x(index)} cy={y(point.sales)} r="5" />
          <title>{point.date}: {formatEok(point.sales)}</title>
        </g>
      ))}
      <text x="28" y="218" fontSize="12">{days[0]?.date.slice(5)}</text>
      <text x="650" y="218" fontSize="12">{days.at(-1)?.date.slice(5)}</text>
    </svg>
  );
}

export function InsightsDashboard({ initialEndDate, mode }: Props) {
  const [endDate, setEndDate] = useState(initialEndDate);
  const [period, setPeriod] = useState<7 | 14 | 30>(7);
  const dates = useMemo(() => insightDates(endDate, period), [endDate, period]);
  const [days, setDays] = useState<InsightDay[]>(() => dates.map((date) => ({ date, status: "loading" })));
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (generation.current === currentGeneration) {
        setDays(dates.map((date) => ({ date, status: "loading" })));
      }
    });
    let cursor = 0;

    const worker = async () => {
      while (cursor < dates.length) {
        const date = dates[cursor++];
        const result = await fetchDay(date, controller.signal);
        if (generation.current !== currentGeneration) return;
        setDays((current) => current.map((day) => day.date === date ? result : day));
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, dates.length) }, worker)).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("인사이트 날짜별 조회 실행에 실패했습니다.");
      }
    });
    return () => controller.abort();
  }, [dates]);

  const retry = async (date: string) => {
    const currentGeneration = generation.current;
    setDays((current) => current.map((day) => day.date === date ? { date, status: "loading" } : day));
    const result = await fetchDay(date);
    if (generation.current === currentGeneration) {
      setDays((current) => current.map((day) => day.date === date ? result : day));
    }
  };

  const summary = useMemo(() => summarizeInsights(days), [days]);
  const counts = {
    ok: days.filter((day) => day.status === "ok").length,
    empty: days.filter((day) => day.status === "empty").length,
    error: days.filter((day) => day.status === "error").length,
    loading: days.filter((day) => day.status === "loading").length,
  };
  const completed = period - counts.loading;
  const maxMovieSales = summary.topMovies[0]?.sales ?? 1n;

  return (
    <section className={styles.section} aria-labelledby="insights-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>F2 · INSIGHTS</span>
          <h2 className={styles.title} id="insights-title">박스오피스 인사이트</h2>
        </div>
        <div className={styles.controls}>
          <label>종료일 <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          {([7, 14, 30] as const).map((value) => (
            <button type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} key={value}>{value}일</button>
          ))}
        </div>
      </div>

      <p className={styles.notice}><strong>전체 통계가 아닌 KOBIS 일별 Top 10 관측 데이터 기준입니다.</strong> 순위 밖 영화의 매출·관객을 0으로 추정하지 않으며, 주간·주말 자료는 섞지 않습니다.</p>

      <div aria-label={`조회 진행률 ${completed}/${period}`}>
        <div className={styles.progress}><span style={{ width: `${(completed / period) * 100}%` }} /></div>
      </div>
      <div className={styles.counts}>
        <div className={styles.count}>정상<strong data-testid="insight-count-ok">{counts.ok}</strong></div>
        <div className={styles.count}>빈 날짜<strong data-testid="insight-count-empty">{counts.empty}</strong></div>
        <div className={styles.count}>실패<strong data-testid="insight-count-error">{counts.error}</strong></div>
        <div className={styles.count}>조회 중<strong data-testid="insight-count-loading">{counts.loading}</strong></div>
      </div>

      <div className={styles.metrics}>
        <article className={styles.metric}>
          관측 관객 합계
          <strong>{summary.audience === null ? "—" : formatThousands(summary.audience)}</strong>
          <small>선정 이유: 관측 매출의 규모가 실제 관객 유입과 함께 움직이는지 보여줍니다.</small>
        </article>
        <article className={styles.metric}>
          관객당 매출
          <strong>{formatWon(summary.revenuePerAudience)}</strong>
          <small>선정 이유: 가격·상영 구성 변화가 반영된 관측 매출 효율을 간결하게 비교합니다.</small>
        </article>
      </div>

      <div className={styles.charts}>
        <article className={styles.chart}>
          <h3>일별 Top 10 관측 매출 합계 추이</h3>
          <p className={styles.reason}>선정 이유: 일별 흥행 규모의 상승·하락과 데이터 공백을 한눈에 확인할 수 있습니다.</p>
          <TrendChart days={days} />
        </article>
        <article className={styles.chart}>
          <h3>기간 영화별 Top 10 관측 매출 합계 Top 5</h3>
          <p className={styles.reason}>선정 이유: 관측 기간의 매출을 주도한 영화를 빠르게 비교할 수 있습니다.</p>
          {summary.complete ? (
            <div className={styles.bars}>
              {summary.topMovies.map((movie) => (
                <div key={movie.movieCd}>
                  <div className={styles.barLabel}><span>{movie.movieNm}</span><strong>{formatEok(movie.sales)}</strong></div>
                  <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${Number((movie.sales * 10_000n) / maxMovieSales) / 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.unavailable}>모든 날짜가 정상일 때만 기간 합계와 Top 5를 표시합니다.</div>
          )}
        </article>
      </div>

      <details className={styles.policy} open>
        <summary><strong>지표 포함·제외 기준</strong></summary>
        <table>
          <tbody>
            <tr><th>기간 자료</th><td>일별 응답만 포함하고 주간·주말 자료는 제외</td></tr>
            <tr><th>영화 묶기</th><td>영화명이 아닌 영화 코드(movieCd) 기준</td></tr>
            <tr><th>합산 값</th><td>salesAmt·audiCnt만 합산; salesAcc·audiAcc는 제외</td></tr>
            <tr><th>순위 밖</th><td>Top 10 밖 영화 실적을 0으로 채우지 않음</td></tr>
            <tr><th>빈 날짜·실패</th><td>추이선을 끊고, 모든 날짜가 정상일 때만 기간 합계·Top 5 표시</td></tr>
            <tr><th>관객당 매출</th><td>관측 매출 합계 ÷ 관측 관객 합계(반올림); 관객 합계가 0 이하면 “—”</td></tr>
          </tbody>
        </table>
      </details>

      <div>
        <h3>날짜별 조회 상태</h3>
        <ul className={styles.days}>
          {days.map((day) => (
            <li key={day.date}>
              <span>{day.date} · {day.status === "ok" ? "정상" : day.status === "empty" ? "빈 날짜" : day.status === "error" ? "실패" : "조회 중"}</span>
              {day.status === "error" && <button className={styles.retry} type="button" onClick={() => void retry(day.date)}>이 날짜만 재시도</button>}
            </li>
          ))}
        </ul>
      </div>

      {mode === "demo" && (
        <aside className={styles.manual}>
          <strong>demo 손계산 검증(2026-09-07 · 2026-09-08)</strong><br />
          9/7: 402,200,000원 · 40,220명 / 9/8: 447,900,000원 · 44,790명<br />
          합계: 402,200,000 + 447,900,000 = 850,100,000원<br />
          관객: 40,220 + 44,790 = 85,010명 / 관객당 매출: 850,100,000 ÷ 85,010 = 10,000원
        </aside>
      )}
    </section>
  );
}
