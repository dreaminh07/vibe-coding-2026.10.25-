import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getBoxOffice, getDataMode, getDemoBoxOffice, koreaToday, normalizeFixture, parseQuery, yesterdayInKorea } from "./demo-box-office";
import { formatInteger, searchMovies } from "@/lib/contracts/box-office";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const raw = { movieCd: "DEMO", movieNm: "바다", rank: "1", openDt: "", salesAmt: "100", audiCnt: "9", salesAcc: "100", audiAcc: "9" };

describe("demo fixtures and contracts", () => {
  it("returns all 7 daily dates with numeric ranks and exact fixture amounts", () => {
    for (let day = 7; day <= 13; day++) {
      const response = getDemoBoxOffice(`2026-09-${String(day).padStart(2, "0")}`, "daily");
      expect(response.meta.status).toBe("ok");
      expect(response.data.items).toHaveLength(5);
      expect(response.data.items.map((movie) => movie.rank)).toEqual([1, 2, 3, 4, 5]);
    }
    const first = getDemoBoxOffice("2026-09-07", "daily").data.items[0];
    expect(first).toMatchObject({ movieNm: "바다 너머의 우리", salesAmt: "145200000", audiCnt: "14520", audiAcc: "64520" });
    expect(getDemoBoxOffice("2026-09-13", "daily").data.items[0].movieNm).toBe("밤의 도서관");
  });
  it("uses weekly and weekend ranges and sums period values rather than accumulated counts", () => {
    const week = getDemoBoxOffice("2026-09-09", "weekly");
    expect([week.meta.rangeStart, week.meta.rangeEnd]).toEqual(["2026-09-07", "2026-09-13"]);
    expect(week.data.items[0]).toMatchObject({ salesAmt: "1310400000", audiCnt: "131040", audiAcc: "181040" });
    const weekend = getDemoBoxOffice("2026-09-09", "weekend");
    expect([weekend.meta.rangeStart, weekend.meta.rangeEnd]).toEqual(["2026-09-11", "2026-09-13"]);
    expect(weekend.data.items.find((item) => item.movieCd === "DEMO001")?.audiCnt).toBe("64560");
  });
  it.each(["daily", "weekly", "weekend"] as const)("returns normal empty outside sample (%s)", (type) => {
    expect(getDemoBoxOffice("2026-09-06", type)).toMatchObject({ data: { items: [] }, meta: { status: "empty", source: "fixture" } });
    expect(getDemoBoxOffice("2026-09-15", type).meta.status).toBe("empty");
    expect(() => getDemoBoxOffice("2026-09-14", type)).toThrow("데이터를 불러오지 못했습니다");
  });
  it("trims partial search and restores the original list", () => {
    const items = getDemoBoxOffice("2026-09-07", "daily").data.items;
    expect(searchMovies(items, " 바다 ").map((item) => item.movieCd)).toEqual(["DEMO001"]);
    expect(searchMovies(items, "없는 제목")).toEqual([]);
    expect(searchMovies(items, "")).toHaveLength(5);
  });
  it("normalizes zero and missing opening date without losing integer precision", () => {
    expect(normalizeFixture({ ...raw, salesAmt: "0" })).toMatchObject({ salesAmt: "0", openDt: null, rank: 1 });
    const item = normalizeFixture({ ...raw, salesAmt: "9007199254740993" });
    expect(JSON.parse(JSON.stringify(item)).salesAmt).toBe("9007199254740993");
    expect(formatInteger(item.salesAmt)).toBe("9,007,199,254,740,993");
  });
  it.each(["", "-1", "1.5", "NaN", "1e3", " 9 ", "9223372036854775808"])("rejects invalid numeric fixture %s", (value) => {
    expect(() => normalizeFixture({ ...raw, salesAmt: value })).toThrow("데모 데이터 형식");
  });
  it.each(["0", "9007199254740992"])("rejects invalid rank %s", (rank) => {
    expect(() => normalizeFixture({ ...raw, rank })).toThrow();
  });
  it("rejects malformed dates, future dates and invalid period types", () => {
    for (const query of ["date=2026-02-30&type=daily", "date=2027-01-01&type=daily", "date=2026-09-07&type=other", "type=daily"]) {
      expect(() => parseQuery(new URLSearchParams(query), "2026-10-24")).toThrow();
    }
    expect(koreaToday(new Date("2026-09-06T16:00:00Z"))).toBe("2026-09-07");
    expect(yesterdayInKorea(new Date("2026-09-06T16:00:00Z"))).toBe("2026-09-06");
  });
  it("makes no external fetch in demo mode", async () => {
    const fetch = vi.fn(() => { throw new Error("External call forbidden"); });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("DATA_MODE", "demo");
    expect(getDataMode()).toBe("demo");
    expect((await getBoxOffice("2026-09-07", "daily")).meta.status).toBe("ok");
    vi.stubEnv("DATA_MODE", "typo");
    expect(getDataMode).toThrow("DATA_MODE 설정");
    expect(fetch).not.toHaveBeenCalled();
  });
});
