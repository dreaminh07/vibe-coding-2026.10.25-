import { describe, expect, it } from "vitest";
import { insightDates, summarizeInsights } from "./insights";

const day = (date: string, sales: string[], audience: string[]) => ({
  date,
  status: "ok" as const,
  items: sales.map((salesAmt, index) => ({
    movieCd: `M${index + 1}`,
    movieNm: `영화 ${index + 1}`,
    salesAmt,
    audiCnt: audience[index],
  })),
});

describe("insight aggregation", () => {
  it("두 날짜의 검증 기준을 BigInt로 합산한다", () => {
    const summary = summarizeInsights([
      day("2026-09-07", ["300000000", "102200000"], ["30000", "10220"]),
      day("2026-09-08", ["320000000", "127900000"], ["32000", "12790"]),
    ]);
    expect(summary.points.map((point) => point.sales)).toEqual([402_200_000n, 447_900_000n]);
    expect(summary.sales).toBe(850_100_000n);
    expect(summary.audience).toBe(85_010n);
    expect(summary.revenuePerAudience).toBe(10_000n);
  });

  it("빈 날짜나 실패 날짜가 있으면 기간 집계를 공개하지 않는다", () => {
    const summary = summarizeInsights([
      day("2026-09-07", ["100"], ["10"]),
      { date: "2026-09-08", status: "empty" },
      { date: "2026-09-09", status: "error" },
    ]);
    expect(summary.complete).toBe(false);
    expect(summary.sales).toBeNull();
    expect(summary.topMovies).toEqual([]);
    expect(summary.points.map((point) => point.sales)).toEqual([100n, null, null]);
  });

  it("영화 코드로 묶고 매출·관객·코드 순으로 정렬한다", () => {
    const summary = summarizeInsights([
      { date: "2026-09-07", status: "ok", items: [
        { movieCd: "B", movieNm: "같은 이름", salesAmt: "100", audiCnt: "9" },
        { movieCd: "A", movieNm: "같은 이름", salesAmt: "100", audiCnt: "10" },
      ] },
    ]);
    expect(summary.topMovies.map((movie) => movie.movieCd)).toEqual(["A", "B"]);
  });

  it("종료일을 포함한 기간 날짜를 생성한다", () => {
    expect(insightDates("2026-09-13", 7)).toEqual([
      "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10",
      "2026-09-11", "2026-09-12", "2026-09-13",
    ]);
  });
});
