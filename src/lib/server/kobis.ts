import "server-only";
import type { BoxOfficeItem, BoxOfficeResponse, PeriodType } from "@/lib/contracts/box-office";
import { BoxOfficeError } from "@/lib/server/box-office-error";
import { isDate } from "@/lib/server/box-office-validation";

const endpoints = {
  daily: "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json",
  weekly: "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchWeeklyBoxOfficeList.json",
} as const;
const maximumBigInt = 9_223_372_036_854_775_807n;
const maximumRank = 2_147_483_647;
const defaultTimeoutMs = 5_000;

type FetchLike = typeof fetch;
type UnknownRecord = Record<string, unknown>;

interface KobisOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: UnknownRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  }
  return value.trim();
}

function integerString(record: UnknownRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) > maximumBigInt) {
    throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  }
  return BigInt(value).toString();
}

function kobisDate(value: unknown, nullable = false): string | null {
  if (nullable && value === "") return null;
  if (typeof value !== "string") {
    throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  }
  const formatted = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
  if (!isDate(formatted)) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  return formatted;
}

function parseRange(value: unknown): { rangeStart: string; rangeEnd: string } {
  if (typeof value !== "string") throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  const match = /^(\d{8})~(\d{8})$/.exec(value);
  if (!match) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  const rangeStart = kobisDate(match[1]);
  const rangeEnd = kobisDate(match[2]);
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
    throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  }
  return { rangeStart, rangeEnd };
}

export function normalizeKobisItem(value: unknown): BoxOfficeItem {
  if (!isRecord(value)) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  const rankText = integerString(value, "rank");
  const rank = Number(rankText);
  if (!Number.isSafeInteger(rank) || rank <= 0 || rank > maximumRank) {
    throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  }
  return {
    movieCd: requiredString(value, "movieCd"),
    movieNm: requiredString(value, "movieNm"),
    rank,
    openDt: kobisDate(value.openDt, true),
    salesAmt: integerString(value, "salesAmt"),
    audiCnt: integerString(value, "audiCnt"),
    salesAcc: integerString(value, "salesAcc"),
    audiAcc: integerString(value, "audiAcc"),
  };
}

function parseKobisPayload(payload: unknown, date: string, type: PeriodType, collectedAt: Date): BoxOfficeResponse {
  if (!isRecord(payload)) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  if (isRecord(payload.faultInfo) || isRecord(payload.errorMessage)) {
    throw new BoxOfficeError("UPSTREAM_ERROR", 502, "KOBIS에서 데이터를 가져오지 못했습니다.");
  }
  const resultName = type === "daily" ? "boxOfficeResult" : "boxOfficeResult";
  const result = payload[resultName];
  if (!isRecord(result)) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  const listName = type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList";
  const list = result[listName];
  if (!Array.isArray(list)) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  const items = list.map(normalizeKobisItem);
  const movieCodes = new Set(items.map((item) => item.movieCd));
  if (movieCodes.size !== items.length) throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
  const { rangeStart, rangeEnd } = parseRange(result.showRange);
  const collectedAtIso = collectedAt.toISOString();
  const expiresAt = new Date(collectedAt.getTime() + (items.length === 0 ? 60 : 24 * 60) * 60_000).toISOString();
  return {
    data: { items },
    meta: {
      status: items.length === 0 ? "empty" : "ok",
      mode: "live",
      queryDate: date,
      type,
      rangeStart,
      rangeEnd,
      source: "kobis",
      collectedAt: collectedAtIso,
      cachedAt: null,
      expiresAt,
    },
  };
}

export async function fetchKobisBoxOffice(date: string, type: PeriodType, options: KobisOptions = {}): Promise<BoxOfficeResponse> {
  const apiKey = options.apiKey ?? process.env.KOBIS_API_KEY?.trim();
  if (!apiKey) throw new BoxOfficeError("SERVER_MISCONFIGURED", 500, "서버 설정을 확인해 주세요.");
  const url = new URL(type === "daily" ? endpoints.daily : endpoints.weekly);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("targetDt", date.replaceAll("-", ""));
  url.searchParams.set("itemPerPage", "10");
  if (type !== "daily") url.searchParams.set("weekGb", type === "weekly" ? "0" : "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultTimeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new BoxOfficeError("UPSTREAM_ERROR", 502, "KOBIS에서 데이터를 가져오지 못했습니다.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BoxOfficeError("UPSTREAM_INVALID_RESPONSE", 502, "KOBIS 응답 형식을 확인할 수 없습니다.");
    }
    return parseKobisPayload(payload, date, type, (options.now ?? (() => new Date()))());
  } catch (error) {
    if (error instanceof BoxOfficeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new BoxOfficeError("UPSTREAM_TIMEOUT", 504, "KOBIS 응답 시간이 초과되었습니다.");
    }
    throw new BoxOfficeError("UPSTREAM_ERROR", 502, "KOBIS에서 데이터를 가져오지 못했습니다.");
  } finally {
    clearTimeout(timeout);
  }
}
