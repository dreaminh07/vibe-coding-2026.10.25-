# Architecture Decision Records

## ADR-001: 웹·API·캐시 및 배포 스택 선택

- 상태: 채택 — 구현 전 설계 결정
- 결정일: 2026-10-24
- 관련 문서: [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

### 배경

두 화면에서 KOBIS 일간·주간·주말 박스오피스를 조회하고, 최근 7/14/30일의 일간 데이터를 집계한다. 회원가입이나 복잡한 분석 모델은 MVP에 없다. KOBIS 키와 DB 비밀키는 서버에만 보관해야 하며, 반복 조회와 최대 30일 분석으로 발생하는 외부 호출을 줄여야 한다. PRD에서 DB는 선택 사항이었지만 이번 요청의 최종 기술 선택에 맞춰 공유 캐시로 사용한다.

### 대안

| 대안 | 검토 결과 |
| --- | --- |
| Next.js(App Router) + TypeScript 단일 프로젝트 | 화면과 서버 API를 같은 프로젝트에서 관리할 수 있다. 현재 조회·집계 중심의 범위와 작은 운영 구성에 가장 적합하다. |
| React + Express + TypeScript | 독립 API 운영과 확장에 유리하지만 별도 배포·서비스 경계 및 API 규칙 관리가 늘어난다. 현재 MVP에서는 독립 백엔드의 필요성이 낮다. |
| React + FastAPI | Python 검증·분석 생태계와 연결하기 좋지만 두 언어의 API 계약과 런타임을 관리해야 한다. 현재 집계에는 Python 전용 도구가 필요하지 않다. |

기능 근거: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Express](https://expressjs.com/), [FastAPI](https://fastapi.tiangolo.com/). 적합성 평가는 이 프로젝트 요구사항에 대한 설계 판단이다.

### 결정

**Next.js(App Router) + TypeScript + Supabase(Postgres) + Vercel**을 채택한다.

- Next.js는 화면과 Node.js 런타임 Route Handlers 기반 내부 API를 제공한다.
- TypeScript로 UI·API 계약을 공유하고, 외부 응답은 별도 런타임 검증을 수행한다.
- Supabase Postgres는 날짜·유형별 검증된 응답과 정상 빈 응답의 공유 캐시로 사용한다.
- Vercel은 Next.js를 배포한다. Hobby 사용은 배포 시 용도와 무료 조건 충족을 확인하는 것을 전제로 한다.

### 선택 이유

1. **개발·배포 단순화:** UI와 내부 API를 한 프로젝트로 관리해 두 화면을 위한 별도 백엔드 운영 부담을 줄인다. Route Handlers로 브라우저와 외부 API 사이의 서버 경계를 구성할 수 있다.
2. **비밀키 보호:** KOBIS·Supabase 접근을 서버 전용 모듈에 모으고, 브라우저에는 정규화된 DTO만 전달한다.
3. **공유 캐시:** 프로세스 메모리 대신 Postgres에 캐시를 두어 서로 다른 서버 실행에서도 동일한 날짜·유형 데이터를 재사용한다. 7/14/30일 분석과 목록이 일간 캐시를 공유한다.
4. **현재 분석 범위에 충분:** 기간 합계·정렬·Top 영화는 TypeScript 서버 코드로 처리할 수 있다. 문자열 숫자는 검증 후 `bigint`로 계산하고 JSON에는 정확한 정수 문자열로 전달한다.
5. **오류와 빈 데이터 구분:** `ok/empty`만 TTL과 함께 저장하고 외부 오류는 정상 캐시에 기록하지 않아 PRD의 상태별 안내를 일관되게 적용한다.

### 트레이드오프

| 얻는 점 | 감수하는 점과 대응 |
| --- | --- |
| 단일 프로젝트와 배포 흐름 | Next.js 실행·서버/클라이언트 경계에 의존한다. 서버 서비스를 Route Handler와 분리해 향후 독립 API 이전을 준비한다. |
| 별도 상시 API 서버 운영 부담 감소 | 서버리스 실행 시간·동시성·콜드 스타트 제약을 고려해야 한다. 인사이트는 캐시 일괄 조회, 제한된 외부 동시 호출과 요청 시간 예산을 사용한다. 장기 배치는 별도 작업 실행기로 분리한다. |
| 실행 인스턴스 간 캐시 공유 | DB 지연·장애·용량 관리가 추가된다. DB 조회 실패는 `503`, 외부 성공 후 저장 실패는 현재 결과 반환과 운영 기록으로 구분한다. |
| 외부 호출 절감 | TTL 동안 데이터 정정 반영이 늦을 수 있다. 초기 TTL은 정상 결과 1시간·빈 응답 5분이며 운영 결과로 조정한다. |
| 최신성 및 실패 상태의 명확성 | 만료 캐시가 있어도 외부 실패 시 오류를 보여 가용성이 낮아질 수 있다. PRD에 맞춰 만료 데이터 대체 제공은 MVP에서 도입하지 않는다. |
| 정수 계산의 정확성 | `bigint`를 JSON에 직접 담을 수 없어 DTO의 정수 문자열 변환과 차트용 안전 범위 검사가 필요하다. |
| 관리형 DB와 배포 서비스 활용 | 두 공급자의 운영 조건에 의존한다. Postgres 스키마를 마이그레이션으로 관리하고 배포 전에 무료 조건과 예상 사용량을 검증한다. |

Supabase 서버 비밀키는 높은 권한과 RLS 우회 권한을 가지므로 서버 보관만으로 충분하다고 가정하지 않고 공개 DB 접근을 차단한다. [Supabase 공식 키 가이드](https://supabase.com/docs/guides/getting-started/api-keys)

Vercel Hobby는 개인 비상업 용도로 제한되며, Supabase Free에도 용량·전송량과 비활성 프로젝트 중지 조건이 있다. **이 선택은 무료 운영 가능성을 확정한 결정이 아니다.** 실제 용도·사용량이 조건에 맞지 않으면 유료 플랜이나 다른 배포 방식을 검토하고 이 ADR을 갱신한다. [Vercel 공식 가이드](https://vercel.com/docs/limits/fair-use-guidelines), [Supabase 요금 안내](https://supabase.com/pricing)

### 재검토 조건

외부 API의 독립 제공, Python 분석 모델 도입, 서버 실행 시간 초과, 캐시 미스·중복 호출 증가, 무료 조건 미충족이 발생하면 백엔드 분리·작업 실행기·배포 플랜을 재검토한다. 구체적인 요청 흐름, 데이터 계약과 캐시 정책은 [ARCHITECTURE.md](./ARCHITECTURE.md)를 따른다.
