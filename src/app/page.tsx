import Link from "next/link";
import { BoxOfficeList } from "@/components/box-office-list";
import { demoDates } from "@/lib/contracts/box-office";
import { getDataMode, koreaToday, yesterdayInKorea } from "@/lib/server/demo-box-office";

export const dynamic = "force-dynamic";

export default function HomePage() {
  let mode: "demo" | "live" | "invalid";
  try { mode = getDataMode(); } catch { mode = "invalid"; }
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="박스오피스 인사이트 홈"><span className="brand-icon" aria-hidden="true">B</span>BOX OFFICE <span className="wordmark-light">INSIGHTS</span></Link>
        <span className="status"><span aria-hidden="true" />{mode === "demo" ? "DEMO · 가상 영화 데이터" : mode === "live" ? "LIVE · 연결 준비 중" : "데이터 모드 설정 오류"}</span>
      </header>
      <main id="main-content">
        <section className="intro list-intro" aria-labelledby="page-title"><p className="eyebrow">영화를 보는 또 하나의 시선</p><h1 id="page-title">영화의 흐름을 한눈에<span className="title-dot">.</span></h1><p className="intro-description">날짜별 순위부터 매출과 관객의 변화까지, 박스오피스를 살펴보세요.</p></section>
        {mode === "demo" && <aside className="demo-notice"><strong>DEMO</strong><span>2026.09.07 ~ 09.13의 가상 영화 데이터입니다. 실제 흥행 실적이 아니며 외부 API를 호출하지 않습니다.</span></aside>}
        <BoxOfficeList initialDate={mode === "demo" ? demoDates.end : yesterdayInKorea()} today={koreaToday()} mode={mode} />
      <p><Link href="/insights">인사이트 화면 보기 →</Link></p>
    </main>
      <footer className="site-footer"><span>BOX OFFICE INSIGHTS</span><span>{mode === "demo" ? "가상 데이터로 체험하는 박스오피스" : "KOBIS 연동 준비 중"}</span></footer>
    </div>
  );
}
