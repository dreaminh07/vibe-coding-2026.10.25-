export type InsightItem = {
  movieCd: string;
  movieNm: string;
  salesAmt: string;
  audiCnt: string;
};

export type InsightDay = {
  date: string;
  status: "loading" | "ok" | "empty" | "error";
  items?: InsightItem[];
  error?: string;
};

export type DailyPoint = {
  date: string;
  status: InsightDay["status"];
  sales: bigint | null;
};

export type MovieTotal = {
  movieCd: string;
  movieNm: string;
  sales: bigint;
  audience: bigint;
};

export type InsightSummary = {
  complete: boolean;
  points: DailyPoint[];
  sales: bigint | null;
  audience: bigint | null;
  revenuePerAudience: bigint | null;
  topMovies: MovieTotal[];
};

function integer(value: string, field: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${field} 값이 0 이상의 정수 문자열이 아닙니다.`);
  }
  return BigInt(value);
}

export function summarizeInsights(days: InsightDay[]): InsightSummary {
  const movies = new Map<string, MovieTotal>();
  let sales = 0n;
  let audience = 0n;

  const points = days.map((day) => {
    if (day.status !== "ok" || !day.items) {
      return { date: day.date, status: day.status, sales: null };
    }

    let dailySales = 0n;
    for (const item of day.items) {
      const itemSales = integer(item.salesAmt, "salesAmt");
      const itemAudience = integer(item.audiCnt, "audiCnt");
      dailySales += itemSales;
      sales += itemSales;
      audience += itemAudience;

      const current = movies.get(item.movieCd);
      if (current) {
        current.sales += itemSales;
        current.audience += itemAudience;
      } else {
        movies.set(item.movieCd, {
          movieCd: item.movieCd,
          movieNm: item.movieNm,
          sales: itemSales,
          audience: itemAudience,
        });
      }
    }
    return { date: day.date, status: day.status, sales: dailySales };
  });

  const complete = days.length > 0 && days.every((day) => day.status === "ok");
  const topMovies = complete
    ? [...movies.values()]
        .sort((a, b) => {
          if (a.sales !== b.sales) return a.sales > b.sales ? -1 : 1;
          if (a.audience !== b.audience) return a.audience > b.audience ? -1 : 1;
          return a.movieCd.localeCompare(b.movieCd);
        })
        .slice(0, 5)
    : [];

  return {
    complete,
    points,
    sales: complete ? sales : null,
    audience: complete ? audience : null,
    revenuePerAudience:
      complete && audience > 0n ? (sales + audience / 2n) / audience : null,
    topMovies,
  };
}

export function formatEok(value: bigint): string {
  const tenths = (value + 5_000_000n) / 10_000_000n;
  return `${tenths / 10n}.${tenths % 10n}억원`;
}

export function formatThousands(value: bigint): string {
  const tenths = (value + 50n) / 100n;
  return `${tenths / 10n}.${tenths % 10n}천명`;
}

export function formatWon(value: bigint | null): string {
  return value === null ? "—" : `${value.toLocaleString("ko-KR")}원`;
}

export function insightDates(endDate: string, count: number): string[] {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}
