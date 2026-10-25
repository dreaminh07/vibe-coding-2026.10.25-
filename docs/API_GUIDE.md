# KOBIS 박스오피스 API 연동 가이드

## 1. 범위와 보안 원칙

이 단계는 KOBIS 호출, 응답 검증, 내부 API 응답까지만 구현한다. DB 저장과 캐시는 다음 B단계에서 구현한다. 브라우저는 KOBIS를 직접 호출하지 않고 `GET /api/box-office`만 사용한다.

- 인증키는 서버 환경변수 `KOBIS_API_KEY`에서만 읽는다.
- 인증키에 `NEXT_PUBLIC_` 접두사를 붙이지 않으며 화면, 내부 API 응답, 문서, 테스트 fixture, 오류 메시지와 로그에 넣지 않는다.
- 인증 쿼리가 포함된 외부 요청 URL 전체를 로그에 기록하지 않는다.
- `DATA_MODE=demo`는 기존 fixture만 사용하고 외부 요청을 하지 않는다. `DATA_MODE=live`만 KOBIS를 호출한다.

공식 기준은 [KOBIS Open API](https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do)와 다음 REST 서비스를 사용한다.

- 일간: `https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json`
- 주간·주말: `https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchWeeklyBoxOfficeList.json`

## 2. 외부 요청 계약

내부 API의 `YYYY-MM-DD` 날짜는 KOBIS 요청 전에 구분자를 제거해 `yyyyMMdd`로 변환한다. 반환 개수, 다양성 영화·국적·지역 조건은 이번 단계에서 사용자 입력으로 노출하지 않는다.

| 기간 유형 | KOBIS 서비스 | 보내는 파라미터 | 값과 의미 |
| --- | --- | --- | --- |
| 일간 | `searchDailyBoxOfficeList.json` | `key` | 서버의 `KOBIS_API_KEY` 값. 외부 요청에만 포함 |
| 일간 | 동일 | `targetDt` | 조회일 `yyyyMMdd` |
| 일간 | 동일 | `itemPerPage` | `10`으로 고정 |
| 주간 | `searchWeeklyBoxOfficeList.json` | `key`, `targetDt`, `itemPerPage` | 일간과 같은 변환·고정값 |
| 주간 | 동일 | `weekGb` | `0`: 월요일부터 일요일까지의 주간 집계 |
| 주말 | `searchWeeklyBoxOfficeList.json` | `key`, `targetDt`, `itemPerPage` | 일간과 같은 변환·고정값 |
| 주말 | 동일 | `weekGb` | `1`: 금요일부터 일요일까지의 주말 집계 |

KOBIS가 지원하는 `multiMovieYn`, `repNationCd`, `wideAreaCd`는 현재 MVP에서 보내지 않는다. 고정 조건을 나중에 추가하면 캐시 고유키와 문서를 함께 변경한다.

### 응답 구조

| 유형 | 결과 객체 | 목록 배열 | 공통 메타데이터 |
| --- | --- | --- | --- |
| 일간 | `boxOfficeResult` | `dailyBoxOfficeList` | `boxofficeType`, `showRange` |
| 주간·주말 | `boxOfficeResult` | `weeklyBoxOfficeList` | `boxofficeType`, `showRange`, `yearWeekTime` |

`showRange`는 `yyyyMMdd~yyyyMMdd` 형식이며 내부 응답의 `meta.rangeStart`, `meta.rangeEnd`로 변환한다. 일간은 같은 날짜, 주간·주말은 KOBIS가 반환한 실제 집계 범위를 사용한다. 정상 목록 배열이 비어 있을 때만 내부 상태를 `empty`로 판정한다. 결과 객체나 목록 배열이 누락되면 빈 결과가 아니라 응답 형식 오류다.

## 3. ERD 컬럼 매핑

이번 단계에서는 아래 구조로 변환만 하며 DB에는 저장하지 않는다.

| KOBIS 필드 | 내부 DTO | ERD 테이블·컬럼 | 검증과 변환 |
| --- | --- | --- | --- |
| `movieCd` | `movieCd` | `movies.movie_cd` 및 `box_office_results.movie_cd` | 비어 있지 않은 문자열 식별자로 유지 |
| `movieNm` | `movieNm` | `movies.movie_nm` | 비어 있지 않은 문자열, 앞뒤 공백 제거 |
| `openDt` | `openDt` | `movies.open_dt` | 실제 응답에서 확인되는 `yyyyMMdd` 또는 `YYYY-MM-DD`를 검증해 `YYYY-MM-DD`로 통일, 빈 문자열은 `null` |
| `rank` | `rank` | `box_office_results.rank` | 10진 정수 문자열 검증 후 양의 PostgreSQL `integer` 범위의 `number` |
| `salesAmt` | `salesAmt` | `box_office_results.sales_amt` | 음수 없는 정수 문자열, PostgreSQL `bigint` 범위 검증. 계산 시 `bigint`, DTO는 정수 문자열 |
| `audiCnt` | `audiCnt` | `box_office_results.audi_cnt` | `salesAmt`와 동일 |
| `salesAcc` | `salesAcc` | `box_office_results.sales_acc` | `salesAmt`와 동일. 기간 합계에는 사용하지 않음 |
| `audiAcc` | `audiAcc` | `box_office_results.audi_acc` | `salesAmt`와 동일. 날짜별로 합산하지 않음 |
| 요청 기간 유형 | `meta.type` | `box_office_periods.period_type` | `daily`, `weekly`, `weekend` 중 하나 |
| 내부 요청 날짜 | `meta.queryDate` | `box_office_periods.query_date` | 실제 유효한 비미래 `YYYY-MM-DD` |
| `showRange` | `meta.rangeStart`, `meta.rangeEnd` | `box_office_periods.range_start`, `range_end` | 양 끝 날짜 검증 및 시작일 `<=` 종료일 확인 |
| 서버 수집 시각 | `meta.collectedAt` | `box_office_periods.fetched_at` | UTC ISO-8601 |

숫자 정규화에서 유효한 `"0"`은 허용한다. 빈 문자열, 음수, 소수, 지수 표기, 공백 포함 문자열, `9223372036854775807`을 초과하는 값은 거부한다. 큰 정수를 JavaScript `number`로 바꾸지 않으므로 정밀도를 잃지 않는다.

## 4. 실패와 내부 오류 코드

내부 실패 응답은 다음 형태를 사용한다.

```json
{
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "안전한 사용자 안내",
    "retryable": true
  }
}
```

| 상황 | HTTP | 내부 코드 | 처리 |
| --- | --- | --- | --- |
| 내부 날짜·기간 유형 오류 | `400` | `INVALID_QUERY` | KOBIS를 호출하지 않고 입력 교정 안내 |
| 키가 서버에 설정되지 않음 | `500` | `SERVER_MISCONFIGURED` | 키 이름이나 값을 브라우저에 노출하지 않고 안전한 설정 오류 반환 |
| KOBIS HTTP 실패·네트워크 실패·본문 오류 객체 | `502` | `UPSTREAM_ERROR` | 정상 빈 결과로 바꾸지 않고 재시도 가능 오류 반환 |
| 결과 객체·목록·필드 누락, JSON 파싱 실패, 잘못된 숫자·날짜·중복 영화 코드 | `502` | `UPSTREAM_INVALID_RESPONSE` | 전체 응답을 거부하고 일부 목록을 반환하지 않음 |
| 5초 안에 KOBIS 응답이 완료되지 않음 | `504` | `UPSTREAM_TIMEOUT` | 요청을 중단하고 재시도 가능 오류 반환 |
| 알 수 없는 내부 오류 | `500` | `INTERNAL_ERROR` | 원문 오류·외부 URL·비밀값을 제거한 일반 안내 반환 |

외부 오류 원문은 브라우저에 전달하지 않는다. 현재 구현은 별도 서버 로그를 남기지 않는다.

## 5. 저장 전 검증 순서

1. 내부 API에서 실제 존재하는 날짜인지, 미래 날짜인지, 기간 유형이 허용값인지 확인한다.
2. HTTP 성공 여부와 JSON 파싱 가능 여부를 확인한다.
3. KOBIS 본문의 `faultInfo` 또는 `errorMessage` 객체를 확인한다.
4. `boxOfficeResult`, 기간별 목록 배열과 `showRange`가 존재하는지 확인한다.
5. 각 목록 항목이 객체이며 8개 필수 필드가 계약에 맞는지 확인한다.
6. `movieCd`, `movieNm`이 비어 있지 않은지 확인하고, 한 응답 안의 `movieCd` 중복을 거부한다.
7. `openDt`가 빈 문자열 또는 실제 유효한 `yyyyMMdd`/`YYYY-MM-DD`인지 확인한다.
8. `rank`가 양의 PostgreSQL `integer` 범위인지 확인한다.
9. 금액·인원 4개 필드가 음수 없는 10진 정수 문자열이고 PostgreSQL `bigint` 범위인지 확인한다.
10. `showRange`의 두 날짜가 유효하고 시작일이 종료일보다 늦지 않은지 확인한다.
11. 모든 항목이 통과한 뒤에만 내부 DTO를 만들며, 빈 배열만 정상 `empty`로 반환한다.

B단계에서는 이 검증을 통과한 DTO만 트랜잭션 저장 대상으로 사용한다.

## 6. 모드별 동작과 확인 방법

| 모드 | 동작 | 확인 기준 |
| --- | --- | --- |
| `DATA_MODE=demo` | KOBIS를 호출하지 않고 기존 fixture 반환 | `2026-09-06`은 `empty`, `2026-09-07`~`2026-09-13`은 fixture 성공, `2026-09-14`는 재현용 오류 |
| `DATA_MODE=live` | 서버가 `KOBIS_API_KEY`로 KOBIS를 호출하고 검증된 결과 반환 | 같은 내부 API에서 `meta.mode="live"`, `meta.source="kobis"`. `2026-09-06`은 실제 KOBIS 목록이므로 `ok`이며 항목이 한 건 이상이어야 함 |

개발 서버는 시작 시 환경변수를 읽으므로 모드를 변경한 뒤 재시작한다. 키 값은 확인 출력에 포함하지 않고 상태, 항목 수, 출처와 집계 범위만 확인한다.
