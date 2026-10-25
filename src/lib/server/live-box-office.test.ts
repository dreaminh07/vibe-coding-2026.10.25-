import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { BoxOfficeResponse } from "@/lib/contracts/box-office";
import { BoxOfficeError } from "./box-office-error";
import { getLiveBoxOffice } from "./live-box-office";

const base: BoxOfficeResponse = {
  data: { items: [{ movieCd: "M1", movieNm: "영화", rank: 1, openDt: null, salesAmt: "100", audiCnt: "10", salesAcc: "100", audiAcc: "10" }] },
  meta: {
    status: "ok", mode: "live", queryDate: "2026-09-06", type: "daily",
    rangeStart: "2026-09-06", rangeEnd: "2026-09-06", source: "kobis",
    collectedAt: "2026-09-07T00:00:00.000Z", cachedAt: null, expiresAt: "2026-09-08T00:00:00.000Z",
  },
};
const cached: BoxOfficeResponse = { ...base, meta: { ...base.meta, source: "cache", cachedAt: base.meta.collectedAt } };

describe("live cache flow", () => {
  it("returns a valid cache without calling KOBIS", async () => {
    const fetchKobis = vi.fn();
    const save = vi.fn();
    const result = await getLiveBoxOffice("2026-09-06", "daily", {
      now: () => new Date("2026-09-07T12:00:00Z"), read: vi.fn(async () => cached), fetchKobis, save,
    });
    expect(result.meta.source).toBe("cache");
    expect(fetchKobis).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("fetches, stores, compares and returns KOBIS on a miss", async () => {
    const fetchKobis = vi.fn(async () => base);
    const save = vi.fn(async () => ({ saved: true, response: cached }));
    const result = await getLiveBoxOffice("2026-09-06", "daily", {
      now: () => new Date("2026-09-07T00:00:00Z"), read: vi.fn(async () => null), fetchKobis, save,
    });
    expect(result.meta.source).toBe("kobis");
    expect(fetchKobis).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(base);
  });

  it("refreshes an expired cache", async () => {
    const expired = { ...cached, meta: { ...cached.meta, expiresAt: "2026-09-06T23:00:00Z" } };
    const fetchKobis = vi.fn(async () => base);
    await getLiveBoxOffice("2026-09-06", "daily", {
      now: () => new Date("2026-09-07T00:00:00Z"), read: vi.fn(async () => expired), fetchKobis,
      save: vi.fn(async () => ({ saved: true, response: cached })),
    });
    expect(fetchKobis).toHaveBeenCalledOnce();
  });

  it("returns the newer stored result when a stale request loses the write race", async () => {
    const newer = { ...cached, data: { items: [{ ...cached.data.items[0], salesAmt: "200" }] } };
    const result = await getLiveBoxOffice("2026-09-06", "daily", {
      read: vi.fn(async () => null), fetchKobis: vi.fn(async () => base),
      save: vi.fn(async () => ({ saved: false, response: newer })),
    });
    expect(result).toBe(newer);
  });

  it("returns fresh data with a warning when saving fails", async () => {
    const result = await getLiveBoxOffice("2026-09-06", "daily", {
      read: vi.fn(async () => null), fetchKobis: vi.fn(async () => base),
      save: vi.fn(async () => { throw new BoxOfficeError("CACHE_WRITE_ERROR", 503, "fixture"); }),
    });
    expect(result.meta.source).toBe("kobis");
    expect(result.meta.warning?.code).toBe("CACHE_WRITE_FAILED");
  });

  it("does not treat a read failure as a cache miss", async () => {
    const fetchKobis = vi.fn();
    await expect(getLiveBoxOffice("2026-09-06", "daily", {
      read: vi.fn(async () => { throw new BoxOfficeError("CACHE_READ_ERROR", 503, "fixture"); }), fetchKobis,
    })).rejects.toMatchObject({ code: "CACHE_READ_ERROR", statusCode: 503 });
    expect(fetchKobis).not.toHaveBeenCalled();
  });

  it("rejects a stored result that differs from the accepted source", async () => {
    const different = { ...cached, data: { items: [{ ...cached.data.items[0], audiCnt: "11" }] } };
    await expect(getLiveBoxOffice("2026-09-06", "daily", {
      read: vi.fn(async () => null), fetchKobis: vi.fn(async () => base),
      save: vi.fn(async () => ({ saved: true, response: different })),
    })).rejects.toMatchObject({ code: "CACHE_VERIFY_ERROR", statusCode: 503 });
  });
});
