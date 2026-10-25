import "server-only";
import type { BoxOfficeResponse, PeriodType } from "@/lib/contracts/box-office";
import { BoxOfficeError } from "@/lib/server/box-office-error";
import { readBoxOfficePeriod, saveBoxOfficePeriod } from "@/lib/server/box-office-repository";
import { fetchKobisBoxOffice } from "@/lib/server/kobis";

interface LiveDependencies {
  now?: () => Date;
  read?: typeof readBoxOfficePeriod;
  save?: typeof saveBoxOfficePeriod;
  fetchKobis?: typeof fetchKobisBoxOffice;
}

function comparable(response: BoxOfficeResponse) {
  return {
    status: response.meta.status,
    queryDate: response.meta.queryDate,
    type: response.meta.type,
    rangeStart: response.meta.rangeStart,
    rangeEnd: response.meta.rangeEnd,
    items: [...response.data.items].sort((left, right) => left.rank - right.rank || left.movieCd.localeCompare(right.movieCd)),
  };
}

export function sameBoxOfficeData(left: BoxOfficeResponse, right: BoxOfficeResponse): boolean {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export async function getLiveBoxOffice(date: string, type: PeriodType, dependencies: LiveDependencies = {}): Promise<BoxOfficeResponse> {
  const now = (dependencies.now ?? (() => new Date()))();
  const read = dependencies.read ?? readBoxOfficePeriod;
  const save = dependencies.save ?? saveBoxOfficePeriod;
  const fetchKobis = dependencies.fetchKobis ?? fetchKobisBoxOffice;
  const cached = await read(date, type);
  if (cached && Date.parse(cached.meta.expiresAt) > now.getTime()) return cached;

  const upstream = await fetchKobis(date, type, { now: () => now });
  let saved;
  try {
    saved = await save(upstream);
  } catch (error) {
    if (error instanceof BoxOfficeError && error.code === "SERVER_MISCONFIGURED") throw error;
    return {
      ...upstream,
      meta: {
        ...upstream.meta,
        warning: {
          code: "CACHE_WRITE_FAILED",
          message: "최신 데이터는 표시했지만 저장하지 못했습니다. 다음 조회에서 다시 가져옵니다.",
        },
      },
    };
  }

  if (!saved.saved) return saved.response;
  if (!sameBoxOfficeData(upstream, saved.response)) {
    throw new BoxOfficeError("CACHE_VERIFY_ERROR", 503, "저장된 데이터가 원본과 일치하지 않습니다.");
  }
  return upstream;
}
