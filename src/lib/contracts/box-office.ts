export const periodTypes = ["daily", "weekly", "weekend"] as const;
export type PeriodType = (typeof periodTypes)[number];
export type DataMode = "demo" | "live";
export const periodLabels: Record<PeriodType, string> = { daily: "일간", weekly: "주간", weekend: "주말" };

export interface BoxOfficeItem {
  movieCd: string;
  movieNm: string;
  rank: number;
  openDt: string | null;
  salesAmt: string;
  audiCnt: string;
  salesAcc: string;
  audiAcc: string;
}

export interface BoxOfficeResponse {
  status: "ok" | "empty";
  mode: DataMode;
  items: BoxOfficeItem[];
  queryDate: string;
  type: PeriodType;
  rangeStart: string;
  rangeEnd: string;
}

export const demoDates = {
  start: "2026-09-07", end: "2026-09-13", empty: "2026-09-06", error: "2026-09-14",
} as const;

/** BigInt formatting preserves integers above Number.MAX_SAFE_INTEGER. */
export function formatInteger(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error("올바른 정수 문자열이 아닙니다.");
  return BigInt(value).toLocaleString("ko-KR");
}

export function searchMovies(items: BoxOfficeItem[], search: string): BoxOfficeItem[] {
  const query = search.trim().toLocaleLowerCase("ko-KR");
  return items.filter((item) => item.movieNm.toLocaleLowerCase("ko-KR").includes(query));
}
