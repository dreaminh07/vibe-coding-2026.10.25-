# 박스오피스 인사이트

Next.js(App Router) + TypeScript 기반의 KOBIS 박스오피스 대시보드. 현재 Phase 1 기본 화면과 개발·검증 환경이 구현되어 있으며, 실제 데이터 연결·조회·분석은 다음 Phase에서 진행한다.

## 실행

Node.js 22.13 이상과 npm을 사용한다. 잠금 파일로 의존성을 설치한다.

```sh
npm ci
npm run dev
```

개발 주소: http://127.0.0.1:3000

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

`test:e2e`는 빌드된 서버를, `test:e2e:dev`는 개발 서버를 3100번 포트에서 자동 실행·종료한다. Playwright 결과와 빌드 산출물은 Git에서 제외한다. 데이터 단위 검사는 Vitest, 화면 검사는 Playwright로 분리한다.

현재 화면은 키 없이 실행할 수 있다. 이후 데이터 연결 시 로컬 `.env.local`에 `KOBIS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 설정한다. 키 값은 문서·Git·로그·브라우저에 포함하지 않는다.

Phase별 진행과 승인 규칙은 [PLAN.md](./PLAN.md), 검토 근거는 [PLAN_planmode.md](./PLAN_planmode.md)를 따른다.
