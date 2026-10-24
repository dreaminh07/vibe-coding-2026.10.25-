"use client";

import { useEffect, useRef, useState } from "react";
import { demoDates, formatInteger, periodLabels, periodTypes, searchMovies, type BoxOfficeResponse, type PeriodType } from "@/lib/contracts/box-office";

type LoadState = { key: string; status: "success"; data: BoxOfficeResponse } | { key: string; status: "error"; message: string };
const genericError = "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function BoxOfficeList({ initialDate, today, mode }: { initialDate: string; today: string; mode: string }) {
  const [date, setDate] = useState(initialDate);
  const [type, setType] = useState<PeriodType>("daily");
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const generation = useRef(0);
  const requestKey = `${date}:${type}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/box-office?${new URLSearchParams({ date, type })}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || (data.status !== "ok" && data.status !== "empty") || !Array.isArray(data.items)) {
          throw new Error(data.code === "LIVE_NOT_IMPLEMENTED" ? "live 모드는 아직 준비 중입니다. demo 모드를 사용해 주세요." : genericError);
        }
        if (active && generation.current === current) setState({ key: requestKey, status: "success", data });
      } catch (error) {
        if (active && !controller.signal.aborted && generation.current === current) setState({ key: requestKey, status: "error", message: error instanceof Error && error.message.startsWith("live 모드") ? error.message : genericError });
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [date, type, requestKey]);

  const current = state?.key === requestKey ? state : null;
  const loading = current === null;
  const data = current?.status === "success" ? current.data : null;
  const filtered = data ? searchMovies(data.items, search) : [];

  return (
    <section className="workspace list-workspace" aria-labelledby="list-title">
      <div className="section-heading"><div><p className="eyebrow">BOX OFFICE RANKING</p><h2 id="list-title">날짜별 박스오피스</h2></div><span className="phase-label">{mode === "demo" ? "DEMO" : mode.toUpperCase()}</span></div>
      <div className="filter-bar">
        <div className="filter-field"><label htmlFor="query-date">조회 날짜</label><input id="query-date" type="date" value={date} max={today} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></div>
        <fieldset className="period-filter"><legend>기간 유형</legend><div className="period-buttons">{periodTypes.map((value) => <button type="button" key={value} aria-pressed={type === value} onClick={() => setType(value)}>{periodLabels[value]}</button>)}</div></fieldset>
        <div className="filter-field search-field"><label htmlFor="movie-search">영화명 검색</label><input id="movie-search" type="search" placeholder="현재 목록에서 영화명 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <button type="button" className="refresh-button" onClick={() => setRetry((value) => value + 1)}>새로고침</button>
      </div>
      <div className="result-area" aria-busy={loading}>
        {loading && <div className="state-panel loading-panel" role="status"><span className="spinner" aria-hidden="true" /><h3>박스오피스 데이터를 불러오는 중입니다.</h3><p>선택한 날짜와 기간의 순위를 준비하고 있습니다.</p></div>}
        {current?.status === "error" && <div className="state-panel error-panel" role="alert"><span className="state-icon" aria-hidden="true">!</span><h3>조회 중 오류가 발생했습니다</h3><p>{current.message}</p><button type="button" className="primary-button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
        {data?.status === "empty" && <div className="state-panel" role="status"><span className="state-icon" aria-hidden="true">—</span><h3>제공되는 데이터가 없습니다</h3><p>선택한 기간에 제공되는 박스오피스 데이터가 없습니다. 다른 날짜 또는 기간을 선택해 주세요.</p>{mode === "demo" && <button type="button" className="primary-button" onClick={() => { setDate(demoDates.end); setSearch(""); }}>샘플 날짜로 돌아가기</button>}</div>}
        {data?.status === "ok" && <>
          <div className="result-summary"><span>집계 기간 <strong>{data.rangeStart} ~ {data.rangeEnd}</strong><span className="range-type">{periodLabels[data.type]}</span></span><span role="status">조회 성공 · {filtered.length}편{search.trim() ? ` / 전체 ${data.items.length}편` : ""}</span></div>
          {filtered.length === 0 ? <div className="state-panel search-empty" role="status"><span className="state-icon" aria-hidden="true">⌕</span><h3>검색 결과가 없습니다</h3><p>‘{search.trim()}’에 해당하는 영화가 현재 조회 목록에 없습니다.</p><button type="button" className="primary-button" onClick={() => setSearch("")}>검색어 지우기</button></div> :
            <div className="table-scroll" role="region" aria-label="박스오피스 결과" tabIndex={0}><table><caption className="sr-only">{date} 기준 {periodLabels[type]} 박스오피스 목록. 금액 단위 원, 관객 단위 명.</caption><thead><tr><th scope="col">순위</th><th scope="col">영화명</th><th scope="col">개봉일</th><th scope="col" className="number-cell">매출 (원)</th><th scope="col" className="number-cell">관객수 (명)</th><th scope="col" className="number-cell">누적 관객수 (명)</th></tr></thead><tbody>{filtered.map((movie) => <tr key={movie.movieCd}><td><span className={`rank ${movie.rank <= 3 ? "rank-top" : ""}`}>{movie.rank}</span></td><th scope="row">{movie.movieNm}</th><td className="date-cell">{movie.openDt ?? "-"}</td><td className="number-cell">{formatInteger(movie.salesAmt)}</td><td className="number-cell">{formatInteger(movie.audiCnt)}</td><td className="number-cell muted-cell">{formatInteger(movie.audiAcc)}</td></tr>)}</tbody></table></div>}
          <p className="table-note">매출·관객수는 집계 기간의 값이며, 누적 관객수는 해당 응답 기준의 누적값입니다.</p>
        </>}
      </div>
      {mode === "demo" && <details className="demo-guide"><summary>데모 상태 확인 방법</summary><ul><li>성공: 2026-09-07 ~ 09-13, 일간·주간·주말 선택</li><li>로딩: 날짜·기간 변경 또는 새로고침 (약 0.6초)</li><li>정상 빈 결과: 2026-09-06</li><li>검색: 샘플 날짜에서 ‘바다’ 또는 ‘없는 제목’ 입력</li><li>오류: 2026-09-14 (같은 조건의 재시도도 오류를 재현합니다)</li></ul></details>}
    </section>
  );
}
