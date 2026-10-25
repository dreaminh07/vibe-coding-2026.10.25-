# 박스오피스 인사이트

KOBIS 일간·주간·주말 박스오피스를 조회하고, 일별 Top 10 관측 데이터를 기준으로 매출 추이와 영화별 성과를 살펴보는 Next.js 대시보드다. 목록 화면은 날짜·기간 유형·영화명 검색을 제공하고, 인사이트 화면은 7/14/30일의 날짜별 상태와 관측 지표를 보여준다.

## 필요한 환경

- Node.js `22.x` (`.node-version`: `22.23.4`)
- npm과 `package-lock.json`
- 화면 테스트를 실행할 경우 Playwright Chromium
- live 모드에서만 KOBIS 계정·API 키와 Supabase 프로젝트

Node.js는 `package.json`의 `>=22.13.0 <23` 범위를 사용한다. 다른 메이저 버전에서 실행되더라도 지원 환경으로 간주하지 않는다.

## 설치와 키 없는 demo 실행

```bash
npm ci
npm run dev
```

브라우저에서 http://127.0.0.1:3000 에 접속한다. 환경변수가 없으면 기본적으로 demo 모드가 사용되며 외부 API나 DB를 호출하지 않는다.

환경 파일을 명시적으로 만들려면 `.env.example`을 `.env.local`로 복사하고 다음 이름만 유지한다.

```dotenv
DATA_MODE=demo
KOBIS_API_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

demo 확인값:

- `2026-09-07`~`2026-09-13`: 정상 fixture
- `2026-09-06`: 정상 빈 결과
- `2026-09-14`: 오류·재시도 상태
- 영화명 `바다`: 검색 결과 있음
- 존재하지 않는 제목: 검색 결과 없음
- 인사이트 종료일 `2026-09-13`: 7/14/30일 상태 확인

## live 모드

로컬 전용 `.env.local`에 아래 환경변수를 설정한다. 실제 값은 문서, Git, 브라우저, 요청·응답, 로그에 넣지 않는다.

```dotenv
DATA_MODE=live
KOBIS_API_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

Supabase DB 구조는 `supabase/migrations/202610250001_box_office_cache.sql`에 있다. 다만 현재 KOBIS 이용약관은 결과의 실시간 사용과 저장 금지를 규정하므로, 공개 배포 전에 DB 캐시의 허용 여부를 영화진흥위원회에 확인하거나 저장 방식을 제거해야 한다. 자세한 내용은 [배포 가이드](./docs/DEPLOYMENT.md)를 확인한다.

## 실제 scripts

아래 명령은 모두 `package.json`에 정의되어 있다.

| 목적 | 명령 |
| --- | --- |
| 개발 서버 | `npm run dev` |
| 프로덕션 빌드 | `npm run build` |
| 프로덕션 서버 | `npm run start` |
| 린트 | `npm run lint` |
| 타입 검사 | `npm run typecheck` |
| 단위 테스트 | `npm run test` |
| 단위 테스트 감시 | `npm run test:watch` |
| 프로덕션 화면 테스트 | `npm run test:e2e` |
| 개발 서버 화면 테스트 | `npm run test:e2e:dev` |
| 실제 DB·KOBIS 대조 | `npm run verify:data -- --date=YYYY-MM-DD --period=daily` |

화면 테스트를 처음 실행할 때는 Chromium을 준비한다.

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

## 프로젝트 구조

```text
src/app/                 Next.js 화면과 내부 API
src/components/          목록·인사이트 UI
src/lib/server/          KOBIS·Supabase 서버 전용 코드
src/lib/insights.ts      인사이트 집계
supabase/migrations/     DB 마이그레이션
tests/e2e/               Playwright 화면 테스트
docs/                    API·구현·검증·배포 문서
```

## 관련 문서

- [제품 요구사항](./PRD.md)
- [아키텍처](./ARCHITECTURE.md)
- [데이터 모델](./ERD.md)
- [API 및 캐시](./docs/API_GUIDE.md)
- [인사이트 지표](./docs/INSIGHTS.md)
- [인수 검증 결과](./docs/ACCEPTANCE.md)
- [배포 절차와 운영 대응](./docs/DEPLOYMENT.md)
