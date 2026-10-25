# 배포 및 운영 가이드

- 확인일: **2026-10-25 (Asia/Seoul)**
- 배포 서비스 후보: **Vercel**
- 데이터베이스 후보: **Supabase Postgres**
- 현재 판정: **live 공개 배포 보류**

이 문서는 실제 비밀값을 포함하지 않는다. 환경변수 이름만 기록한다.

## 1. 먼저 확인해야 할 배포 차단 조건

현재 애플리케이션은 KOBIS 응답을 Supabase에 저장해 정상 결과 24시간, 정상 빈 결과 1시간 동안 재사용한다. 그러나 [KOBIS 이용약관](https://www.kobis.or.kr/kobisopenapi/homepg/board/findProvisionInfo.do)의 제6조는 결과의 실시간 사용을 요구하고 결과 복제·저장을 금지한다. 제3조는 API 키 공개 금지와 출처 표시도 요구한다.

따라서 아래 중 하나가 확인되기 전에는 `DATA_MODE=live` 공개 배포를 진행하지 않는다.

1. 영화진흥위원회로부터 현재 서버 캐시 방식에 대한 별도 승낙을 받는다.
2. DB에 KOBIS 결과를 저장하지 않는 실시간 조회 구조로 변경한다.
3. 약관을 충족하는 다른 데이터 이용 계약을 체결한다.

키가 필요 없는 `DATA_MODE=demo` 배포는 기술 검증용으로 가능하다. demo를 실제 서비스 데이터라고 표현해서는 안 된다.

## 2. 무료 조건과 제한사항

### Vercel Hobby

공식 근거: [Hobby Plan](https://vercel.com/docs/plans/hobby), [Limits](https://vercel.com/docs/limits), [이용약관](https://vercel.com/legal/terms)

| 항목 | 2026-10-25 확인 내용 | 프로젝트 영향 |
| --- | --- | --- |
| 허용 목적 | 개인·비상업적 사용 | 업계 업무, 수익화, 회사 서비스라면 Hobby를 사용하지 말고 Pro 등 적합한 플랜을 검토해야 한다. |
| 함수 호출 | 월 1,000,000회 포함 | 소규모 demo에는 충분할 가능성이 높지만 실제 사용량은 Usage 화면에서 확인한다. |
| Active CPU | 월 4 CPU-hours | 7/14/30일 조회는 내부 API 요청이 많으므로 캐시 정책을 확정한 뒤 측정해야 한다. |
| 메모리 | 360 GB-hours | 예상 사용량만으로 통과를 확정하지 않는다. |
| 빌드 | 6,000분, 일 100 deployments | 자동 배포 빈도와 Preview 생성을 모니터링한다. |
| 로그 | 런타임 로그 1시간·최대 4,000행 | 장기 장애 분석용 로그 보존 수단은 별도 검토가 필요하다. 로그에는 비밀값을 남기지 않는다. |
| 초과 시 | 대부분 기능이 다음 사용 기간까지 제한될 수 있음 | 무료 한도 초과를 자동 유료 전환으로 가정하지 않는다. |
| Rollback | Hobby는 바로 이전 production deployment로 제한 | 여러 버전을 건너뛰는 복구가 필요하면 Git revert 후 재배포한다. |

### Supabase Free

공식 근거: [Supabase Pricing](https://supabase.com/pricing), [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [Database](https://supabase.com/docs/guides/database/overview)

| 항목 | 2026-10-25 확인 내용 | 프로젝트 영향 |
| --- | --- | --- |
| 프로젝트 | 활성 Free 프로젝트 최대 2개 | 개인 계정의 다른 프로젝트와 합산해 확인한다. |
| DB 크기 | 프로젝트당 500MB 포함 | Top 10 기간 데이터만 저장해도 운영 기간이 길어지면 정기 측정이 필요하다. |
| Egress | 조직당 5GB 포함 | 인사이트의 다중 날짜 조회량을 배포 후 측정한다. |
| API 요청 | Free에 무제한 API 요청으로 안내 | CPU·DB·egress 제한이 별도로 존재하므로 요청 수만 보고 판단하지 않는다. |
| 비활성 | 1주 비활성 후 일시 중지 가능 | 장기간 사용하지 않은 demo는 첫 요청에서 즉시 준비되지 않을 수 있다. |
| 백업 | Free는 자동 백업 미포함 | 마이그레이션 전 수동 백업과 되돌리기 SQL을 준비한다. |
| 지원 | Community support | 운영 SLA가 필요한 서비스에는 적합하지 않을 수 있다. |

### KOBIS Open API

공식 근거: [서비스 이용안내](https://www.kobis.or.kr/kobisopenapi/homepg/board/findServiceGuideList.do), [이용약관](https://www.kobis.or.kr/kobisopenapi/homepg/board/findProvisionInfo.do)

- 회원가입과 발급키가 필요하다.
- 발급키는 타인에게 제공·공개·공유할 수 없다.
- 출처를 명확히 표시해야 한다.
- 서비스 범위·시간·횟수는 위원회가 제한할 수 있다.
- 현재 공개 약관상 결과는 실시간으로 사용해야 하며 복제·저장할 수 없다.
- 호출 한도가 공개 페이지에 고정 숫자로 명시되지 않은 경우 계정의 키 관리 화면과 공지사항을 배포 직전에 다시 확인한다.

## 3. 권장 배포 방식

현재 코드에는 Next.js App Router 화면과 서버 Route Handler가 함께 있으므로 Vercel 단일 프로젝트를 사용한다. DB는 허용 여부가 해결된 경우에만 Supabase Postgres를 연결한다.

| 설정 | 값 |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | 저장소 루트 `.` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Next.js 자동 감지, 수동 지정하지 않음 |
| Node.js | 22.x (`.node-version`과 `package.json` 기준) |
| Production Branch | `main` |

근거: [Vercel Git 배포](https://vercel.com/docs/git), [빌드 설정](https://vercel.com/docs/builds/configure-a-build)

## 4. 실제 배포 절차

### A. 사전 검사

1. Node.js 22.x에서 `npm ci`를 실행한다.
2. `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`가 모두 통과하는지 확인한다.
3. 화면 검사에는 `npx playwright install chromium` 후 `npm run test:e2e`를 사용한다.
4. `git status`에 `.env.local`이나 비밀 파일이 없는지 확인한다.
5. live라면 위 KOBIS 저장 금지 문제를 먼저 해결한다. 해결되지 않았다면 여기서 중단한다.

### B. Supabase 준비 — 사용자 직접 수행

> **사용자 직접 수행:** 로그인, 프로젝트 생성, SQL 실행, 비밀키 확인은 계정 소유자가 한다. 화면 공유·문서·채팅·로그에 값을 붙이지 않는다.

1. Supabase에 로그인하고 배포용 프로젝트를 생성한다.
2. 리전을 선택하고 Free 조건 및 현재 계정의 활성 프로젝트 수를 확인한다.
3. 저장이 허용된 경우에만 SQL Editor에서 `supabase/migrations/202610250001_box_office_cache.sql`을 실행한다.
4. `movies`, `box_office_periods`, `box_office_results`와 `save_box_office_period`, `read_box_office_period`의 존재를 확인한다.
5. RLS 활성화와 `anon`, `authenticated` 직접 권한 회수를 확인한다.
6. Project URL과 서버 전용 Secret key를 안전한 비밀 저장소에 보관한다. [Supabase API key 지침](https://supabase.com/docs/guides/getting-started/api-keys)

Supabase는 migration을 버전 관리할 것을 권장한다. 공식 참고: [Database migrations](https://supabase.com/docs/guides/local-development/database-migrations)

### C. Vercel 계정·배포 대상 — 사용자 직접 수행

1. Vercel에 로그인한다.
2. GitHub 연결 권한에서 `dreaminh07/vibe-coding-2026.10.25-` 저장소를 선택한다.
3. **Add New → Project → Import**를 선택한다.
4. 배포 계정이 Hobby라면 개인·비상업적 사용인지 확인한다. 아니라면 적합한 유료 플랜을 선택한다.
5. Production Branch가 `main`인지 확인한다.

### D. 빌드 설정

1. Framework Preset을 `Next.js`로 확인한다.
2. Root Directory는 저장소 루트로 둔다.
3. Install Command는 `npm ci`, Build Command는 `npm run build`를 사용한다.
4. Output Directory는 Next.js 자동 설정을 유지한다.
5. Node.js 22.x가 선택됐는지 확인한다.

### E. 환경변수 — 사용자 직접 수행

Vercel **Project → Settings → Environment Variables**에서 설정한다. Production과 Preview를 혼용하지 말고 필요한 환경을 명확히 선택한다. Secret 유형을 지원하는 값은 Secret으로 저장한다. 환경변수 변경은 기존 deployment에 적용되지 않으므로 반드시 새 deployment를 만든다. 공식 참고: [Environment variables](https://vercel.com/docs/environment-variables), [Sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

#### demo 배포

| 이름 | 값의 성격 | 저장 위치 |
| --- | --- | --- |
| `DATA_MODE` | 비밀 아님, `demo` | Vercel 환경변수 |

demo에는 KOBIS·Supabase 비밀값을 등록하지 않는다.

#### live 배포

| 이름 | 값의 성격 | 저장 위치 |
| --- | --- | --- |
| `DATA_MODE` | 비밀 아님, `live` | Vercel 환경변수 |
| `KOBIS_API_KEY` | 비밀 | Vercel Secret 환경변수 |
| `SUPABASE_URL` | 서버 설정 | Vercel 환경변수 |
| `SUPABASE_SECRET_KEY` | RLS를 우회할 수 있는 고권한 비밀 | Vercel Secret 환경변수 |

### F. 배포 — 사용자 직접 수행

1. 설정을 마지막으로 검토하고 **Deploy**를 누른다.
2. 빌드 로그에서는 키 값이 아니라 변수 누락 여부와 빌드 결과만 확인한다.
3. 배포가 완료되면 production URL과 배포 commit SHA를 기록한다.
4. 환경변수를 추가·변경했다면 같은 commit을 **Redeploy**한다. [Vercel Redeploy](https://vercel.com/docs/deployments/managing-deployments)

## 5. 배포 주소 확인표

아직 production URL에서 실제 검사를 수행하지 않았으므로 아래 결과를 통과로 표시하지 않는다.

| 확인 항목 | 기대 결과 | 결과 | 이유 |
| --- | --- | --- | --- |
| `/` 접속 | HTTP 200, 기본 날짜·일간 목록 | **미실행** | production URL 없음 |
| `/insights` 접속 | HTTP 200, 7일 조회 완료 | **미실행** | production URL 없음 |
| demo 상태 | 9/6 빈 결과, 9/14 오류, 검색 결과 없음 구분 | **미실행** | production URL 없음 |
| live 일간 | 실제 KOBIS 결과와 안전한 출처 표시 | **미실행** | KOBIS 약관 충돌 해결 전 live 배포 금지 |
| live 주간·주말 | KOBIS 실제 집계 범위 표시 | **미실행** | 동일 |
| DB 캐시 | 첫 요청 KOBIS, 두 번째 cache | **미실행** | 저장 허용 여부 미확인 |
| 오류 코드 | 400·502·504·503 구분 | **미실행** | production 장애 주입 미실행 |
| 비밀값 | HTML·JS·네트워크 응답·런타임 로그에 값 없음 | **미실행** | production 산출물·로그 없음 |
| 모바일 | 목록·인사이트 조작 가능 | **미실행** | production URL 없음 |
| 사용량 | Vercel·Supabase 무료 한도 내 | **미실행** | 실제 트래픽 없음 |

로컬에서는 `test`, `lint`, `typecheck`, `build`, demo Playwright 18개, 실제 KOBIS·DB 저장본 대조가 통과했다. 이는 production 배포 검증을 대신하지 않는다.

## 6. 비밀값 저장 원칙

### 저장할 곳

- 로컬 개발: Git에서 제외된 `.env.local`
- Vercel: Project Environment Variables의 Secret 유형
- Supabase: 프로젝트 Dashboard의 API Keys; 필요한 서버가 런타임에 주입받아 사용
- 팀 전달: 접근 통제된 비밀번호 관리자나 승인된 비밀 관리 도구

### 절대 넣지 않을 곳

- Git commit, 브랜치, 태그, PR 본문·댓글
- `.env.example`, README, Markdown 문서, fixture, 테스트 snapshot
- `NEXT_PUBLIC_` 접두사가 붙은 환경변수
- 브라우저 코드와 번들, URL query, HTML, API 응답
- 빌드 로그·런타임 로그·오류 원문·화면 캡처
- 메신저·이메일·이슈에 평문으로 붙여넣은 값

## 7. 운영 대응

### 환경변수를 변경했을 때

1. Vercel에서 올바른 환경(Production/Preview)의 변수만 수정한다.
2. 새 deployment를 생성하거나 기존 commit을 Redeploy한다. 기존 deployment는 이전 값을 계속 사용한다.
3. 배포 URL에서 목록·인사이트·오류 처리를 다시 확인한다.
4. 이전 키를 폐기하기 전 새 키로 정상 동작하는지 확인한다.

### 배포를 되돌릴 때

1. Vercel Project의 Deployments에서 직전 정상 production을 선택한다.
2. **Instant Rollback** 대상 URL과 commit을 확인한 뒤 실행한다. Hobby는 바로 이전 production으로 제한된다. [Instant Rollback](https://vercel.com/docs/instant-rollback)
3. DB migration과 외부 서비스 설정은 Vercel rollback으로 되돌아가지 않는다. 스키마 호환성을 별도로 확인한다.
4. 환경변수도 rollback된 코드와 호환되는지 확인한다. rollback이 최신 Secret을 자동 복구한다고 가정하지 않는다.
5. 원인을 수정한 새 deployment를 만든 뒤 Promote 또는 정상 배포로 자동 할당을 복구한다.

### 키가 노출됐을 때

1. 배포·로그·문서 공유를 중단하고 노출 범위를 확인한다. Git 기록에서 문자열만 지우는 것으로 끝내지 않는다.
2. KOBIS 키는 KOBIS 키 관리 화면에서 폐기·재발급 절차를 진행한다.
3. Supabase는 새 Secret key를 만든 뒤 모든 서버에 적용하고 동작을 확인한 다음 유출 키를 폐기한다. [Supabase 키 교체 지침](https://supabase.com/docs/guides/getting-started/api-keys)
4. Vercel의 Secret 환경변수를 교체하고 production·preview를 모두 재배포한다. 오래된 deployment URL도 구 키를 사용할 수 있으므로 접근·폐기 상태를 확인한다.
5. 로그와 Git 이력을 조사하고 필요하면 기록에서 비밀을 제거한다. 이미 노출된 키는 기록 삭제 여부와 관계없이 반드시 회전한다.
6. 브라우저 요청, 빌드 산출물, 로그에서 새 값이 노출되지 않는지 다시 검사한다.

## 8. 다른 컴퓨터에서 처음부터 재현

### 따라 하기

1. Node.js 22.x와 Git을 설치한다.
2. 저장소를 새 폴더에 clone하고 이동한다.
3. `node --version`이 22.x인지 확인한다.
4. `npm ci`를 실행한다.
5. 키 없이 `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`를 실행한다.
6. `npm run dev` 후 `/`와 `/insights`의 demo 화면을 확인한다.
7. 화면 테스트가 필요하면 `npx playwright install chromium`과 `npm run test:e2e`를 실행한다.
8. live는 사용자가 직접 `.env.local`을 만들고 환경변수를 입력한다. 파일 자체를 전달하지 않는다.
9. Supabase migration과 KOBIS 약관 해결 상태를 확인한 뒤에만 live를 사용한다.

### 실제 확인 범위

| 범위 | 결과 | 비고 |
| --- | --- | --- |
| 같은 PC의 별도 임시 폴더에서 GitHub 원격 clone | 통과 | 원본 폴더의 `node_modules`를 재사용하지 않음 |
| 새 clone에서 `npm ci` | 통과 | 376 packages, 알려진 취약점 0건. 실행 셸 Node 24라 engine 경고가 있었음 |
| 새 clone에서 `npm run test` | 통과 | 54개 |
| 새 clone에서 `npm run lint` | 통과 | 경고 0 |
| 새 clone에서 `npm run typecheck` | 통과 | Next route type 생성 포함 |
| 새 clone에서 키 없는 `npm run build` | 통과 | `/`, `/api/box-office`, `/insights` 생성 |
| Node.js 22.x의 완전 신규 PC | **미실행** | 현재 검증 셸은 Node 24였으므로 지원 버전 자체의 새 PC 재현은 확인하지 못함 |
| macOS·Linux | **미실행** | 해당 OS 환경 없음 |
| 새 Supabase 프로젝트에 migration 적용 | **미실행** | 계정 작업과 KOBIS 저장 정책 결정 필요 |
| 실제 Vercel production 배포 | **미실행** | 계정 인증·환경변수 등록과 배포 승인이 필요 |

첫 로컬 clone 시도는 원본 저장소 소유권 차이로 실패했으며 성공으로 계산하지 않았다. 이후 GitHub 원격을 새 임시 폴더에 clone해 위 범위를 확인했고 임시 폴더는 제거했다.
