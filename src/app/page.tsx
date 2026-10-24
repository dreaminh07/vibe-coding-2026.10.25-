import Link from "next/link";

export default function HomePage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="박스오피스 인사이트 홈">
          <span className="brand-icon" aria-hidden="true">B</span>
          BOX OFFICE <span className="wordmark-light">INSIGHTS</span>
        </Link>
        <span className="status"><span aria-hidden="true" />서비스 준비 중</span>
      </header>

      <main id="main-content">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">영화를 보는 또 하나의 시선</p>
          <h1 id="page-title">숫자로 읽는<br />영화의 흐름<span className="title-dot">.</span></h1>
          <p className="intro-description">날짜별 순위부터 매출과 관객의 변화까지.<br />박스오피스의 흐름을 한곳에서 살펴보세요.</p>
          <div className="source-tag">DATA SOURCE <span>KOBIS · 영화진흥위원회</span></div>
        </section>

        <section className="workspace" aria-labelledby="workspace-title">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR BOX OFFICE DESK</p><h2 id="workspace-title">박스오피스 대시보드</h2></div>
            <span className="phase-label">기본 화면</span>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-number">01 / BOX OFFICE</span>
              <h3>날짜별 박스오피스</h3>
              <p>일간·주간·주말 순위와 영화별 매출, 관객수를 조회할 수 있도록 준비하고 있습니다.</p>
              <span className="feature-state">조회 기능 준비 중</span>
            </article>
            <article className="feature-card">
              <span className="feature-number">02 / INSIGHTS</span>
              <h3>흥행 인사이트</h3>
              <p>최근 7·14·30일의 추이와 Top 영화를 비교할 수 있도록 준비하고 있습니다.</p>
              <span className="feature-state">분석 기능 준비 중</span>
            </article>
          </div>
          <p className="data-notice" role="status">아직 박스오피스 데이터가 연결되지 않았습니다.</p>
        </section>
      </main>
      <footer className="site-footer"><span>BOX OFFICE INSIGHTS</span><span>영화의 순간을, 데이터로.</span></footer>
    </div>
  );
}
