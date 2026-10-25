import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BoxOfficeError } from "./box-office-error";
import { fetchKobisBoxOffice, normalizeKobisItem } from "./kobis";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const row = {
  movieCd: "20260001",
  movieNm: "검증 영화",
  rank: "1",
  openDt: "20260901",
  salesAmt: "9007199254740993",
  audiCnt: "100",
  salesAcc: "9007199254740993",
  audiAcc: "1000",
};

function payload(type: "daily" | "weekly", list: unknown[] = [row]) {
  return {
    boxOfficeResult: {
      boxofficeType: type === "daily" ? "일별 박스오피스" : "주간 박스오피스",
      showRange: type === "daily" ? "20260906~20260906" : "20260831~20260906",
      [type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList"]: list,
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("KOBIS box office adapter", () => {
  it.each([
    ["daily", undefined, "dailyBoxOfficeList"],
    ["weekly", "0", "weeklyBoxOfficeList"],
    ["weekend", "1", "weeklyBoxOfficeList"],
  ] as const)("maps %s request parameters and response", async (type, weekGb, listName) => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      expect(url.searchParams.has("key")).toBe(true);
      expect(url.searchParams.get("targetDt")).toBe("20260906");
      expect(url.searchParams.get("itemPerPage")).toBe("10");
      expect(url.searchParams.get("weekGb") ?? undefined).toBe(weekGb);
      expect(url.pathname).toContain(type === "daily" ? "searchDailyBoxOfficeList" : "searchWeeklyBoxOfficeList");
      expect(listName).toBe(type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList");
      return jsonResponse(payload(type === "daily" ? "daily" : "weekly"));
    }) as typeof fetch;
    const result = await fetchKobisBoxOffice("2026-09-06", type, {
      apiKey: "fixture-key",
      fetchImpl,
      now: () => new Date("2026-09-07T00:00:00Z"),
    });
    expect(result.meta).toMatchObject({ status: "ok", mode: "live", source: "kobis", queryDate: "2026-09-06" });
    expect(result.data.items[0]).toEqual({
      movieCd: "20260001", movieNm: "검증 영화", rank: 1, openDt: "2026-09-01",
      salesAmt: "9007199254740993", audiCnt: "100", salesAcc: "9007199254740993", audiAcc: "1000",
    });
  });

  it("accepts a valid zero and an empty opening date", () => {
    expect(normalizeKobisItem({ ...row, openDt: "", salesAmt: "0" })).toMatchObject({ openDt: null, salesAmt: "0" });
    expect(normalizeKobisItem({ ...row, openDt: "2026-09-01" }).openDt).toBe("2026-09-01");
  });

  it.each(["", "-1", "1.5", "1e3", " 9 ", "9223372036854775808"])("rejects invalid numeric value %s", (salesAmt) => {
    expect(() => normalizeKobisItem({ ...row, salesAmt })).toThrowError(BoxOfficeError);
  });

  it.each([
    undefined,
    {},
    { boxOfficeResult: { showRange: "20260906~20260906" } },
    { boxOfficeResult: { showRange: "invalid", dailyBoxOfficeList: [] } },
    { faultInfo: { errorCode: "fixture" } },
  ])("rejects malformed or body-level error payloads", async (body) => {
    const fetchImpl = vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch;
    await expect(fetchKobisBoxOffice("2026-09-06", "daily", { apiKey: "fixture-key", fetchImpl }))
      .rejects.toMatchObject({ statusCode: 502 });
  });

  it("distinguishes HTTP, network and timeout failures", async () => {
    const httpFailure = vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;
    await expect(fetchKobisBoxOffice("2026-09-06", "daily", { apiKey: "fixture-key", fetchImpl: httpFailure }))
      .rejects.toMatchObject({ code: "UPSTREAM_ERROR", statusCode: 502 });

    const networkFailure = vi.fn(async () => { throw new Error("network fixture"); }) as unknown as typeof fetch;
    await expect(fetchKobisBoxOffice("2026-09-06", "daily", { apiKey: "fixture-key", fetchImpl: networkFailure }))
      .rejects.toMatchObject({ code: "UPSTREAM_ERROR", statusCode: 502 });

    const timeout = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("fixture timeout", "AbortError")));
    })) as unknown as typeof fetch;
    await expect(fetchKobisBoxOffice("2026-09-06", "daily", { apiKey: "fixture-key", fetchImpl: timeout, timeoutMs: 1 }))
      .rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", statusCode: 504 });
  });

  it("fails safely when the server key is missing", async () => {
    vi.stubEnv("KOBIS_API_KEY", "");
    await expect(fetchKobisBoxOffice("2026-09-06", "daily"))
      .rejects.toMatchObject({ code: "SERVER_MISCONFIGURED", statusCode: 500 });
  });
});
