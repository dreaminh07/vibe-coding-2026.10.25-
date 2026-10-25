import "server-only";
import { demoDates, periodTypes, type BoxOfficeItem, type BoxOfficeResponse, type DataMode, type PeriodType } from "@/lib/contracts/box-office";
import { BoxOfficeError } from "@/lib/server/box-office-error";
import { isDate } from "@/lib/server/box-office-validation";
import { getLiveBoxOffice } from "@/lib/server/live-box-office";

export function getDataMode(): DataMode {
  const mode = process.env.DATA_MODE ?? "demo";
  if (mode !== "demo" && mode !== "live") throw new BoxOfficeError("INVALID_DATA_MODE", 500, "DATA_MODE 설정을 확인해 주세요.");
  return mode;
}

export function koreaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}

export function yesterdayInKorea(now = new Date()): string {
  return new Date(Date.parse(`${koreaToday(now)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function parseQuery(params: URLSearchParams, today = koreaToday()) {
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "";
  if (!isDate(date) || date > today || !periodTypes.includes(type as PeriodType)) {
    throw new BoxOfficeError("INVALID_QUERY", 400, "조회 날짜와 기간 유형을 확인해 주세요.");
  }
  return { date, type: type as PeriodType };
}

type RawItem = Record<"movieCd" | "movieNm" | "rank" | "openDt" | "salesAmt" | "audiCnt" | "salesAcc" | "audiAcc", string>;
const maximumInteger = 9_223_372_036_854_775_807n;
const demoCollectedAt = "2026-09-14T09:00:00+09:00";

export function normalizeFixture(raw: RawItem): BoxOfficeItem {
  for (const field of ["rank", "salesAmt", "audiCnt", "salesAcc", "audiAcc"] as const) {
    const value = raw[field];
    if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) > maximumInteger) {
      throw new BoxOfficeError("INVALID_FIXTURE", 500, "데모 데이터 형식을 확인해 주세요.");
    }
  }
  const rank = Number(raw.rank);
  if (!Number.isSafeInteger(rank) || rank <= 0 || !raw.movieCd || !raw.movieNm || (raw.openDt !== "" && !isDate(raw.openDt))) {
    throw new BoxOfficeError("INVALID_FIXTURE", 500, "데모 데이터 형식을 확인해 주세요.");
  }
  return {
    ...raw, rank, openDt: raw.openDt || null,
    salesAmt: BigInt(raw.salesAmt).toString(), audiCnt: BigInt(raw.audiCnt).toString(),
    salesAcc: BigInt(raw.salesAcc).toString(), audiAcc: BigInt(raw.audiAcc).toString(),
  };
}

// Invented films and deterministic counts; no external API or DB dependency.
const movies = [
  { movieCd: "DEMO001", movieNm: "바다 너머의 우리", openDt: "2026-09-02", base: 14520n, growth: 1400n },
  { movieCd: "DEMO002", movieNm: "밤의 도서관", openDt: "2026-09-03", base: 11300n, growth: 2000n },
  { movieCd: "DEMO003", movieNm: "다시 만난 계절", openDt: "2026-09-04", base: 8200n, growth: 700n },
  { movieCd: "DEMO004", movieNm: "여름의 마지막 편지", openDt: "2026-09-05", base: 5300n, growth: 350n },
  { movieCd: "DEMO005", movieNm: "파란 행성", openDt: "", base: 900n, growth: 120n },
] as const;

export function getDemoBoxOffice(date: string, type: PeriodType): BoxOfficeResponse {
  if (date === demoDates.error) throw new BoxOfficeError("DEMO_ERROR", 502, "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const result: BoxOfficeResponse = {
    data: { items: [] },
    meta: {
      status: "empty",
      mode: "demo",
      queryDate: date,
      type,
      rangeStart: date,
      rangeEnd: date,
      source: "fixture",
      collectedAt: demoCollectedAt,
      cachedAt: null,
      expiresAt: "2026-09-14T09:05:00+09:00",
    },
  };
  if (date < demoDates.start || date > demoDates.end) return result;

  const selectedDay = Number(date.slice(-2)) - 7;
  const startDay = type === "weekly" ? 0 : type === "weekend" ? 4 : selectedDay;
  const endDay = type === "daily" ? selectedDay : 6;
  result.meta.rangeStart = `2026-09-${String(7 + startDay).padStart(2, "0")}`;
  result.meta.rangeEnd = `2026-09-${String(7 + endDay).padStart(2, "0")}`;
  const rows = movies.map((movie) => {
    let audience = 0n;
    let accumulated = 50_000n;
    for (let day = 0; day <= endDay; day++) {
      const count = movie.base + movie.growth * BigInt(day);
      accumulated += count;
      if (day >= startDay) audience += count;
    }
    return {
      movieCd: movie.movieCd, movieNm: movie.movieNm, openDt: movie.openDt,
      salesAmt: (audience * 10_000n).toString(), audiCnt: audience.toString(),
      salesAcc: (accumulated * 10_000n).toString(), audiAcc: accumulated.toString(),
    };
  });
  rows.sort((a, b) => BigInt(a.salesAmt) === BigInt(b.salesAmt)
    ? a.movieCd.localeCompare(b.movieCd)
    : BigInt(a.salesAmt) > BigInt(b.salesAmt) ? -1 : 1);
  result.data.items = rows.map((row, index) => normalizeFixture({ ...row, rank: String(index + 1) }));
  result.meta.status = "ok";
  result.meta.expiresAt = "2026-09-14T10:00:00+09:00";
  return result;
}

export async function getBoxOffice(date: string, type: PeriodType, mode = getDataMode()): Promise<BoxOfficeResponse> {
  if (mode === "live") return getLiveBoxOffice(date, type);
  return getDemoBoxOffice(date, type);
}
