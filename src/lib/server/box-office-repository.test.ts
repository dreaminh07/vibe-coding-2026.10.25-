import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { BoxOfficeResponse } from "@/lib/contracts/box-office";
import { readBoxOfficePeriod, saveBoxOfficePeriod } from "./box-office-repository";

const stored: BoxOfficeResponse = {
  data: { items: [{ movieCd: "M1", movieNm: "영화", rank: 1, openDt: null, salesAmt: "100", audiCnt: "10", salesAcc: "100", audiAcc: "10" }] },
  meta: {
    status: "ok", mode: "live", queryDate: "2026-09-06", type: "daily", rangeStart: "2026-09-06", rangeEnd: "2026-09-06",
    source: "cache", collectedAt: "2026-09-07T00:00:00Z", cachedAt: "2026-09-07T00:00:00Z", expiresAt: "2026-09-08T00:00:00Z",
  },
};

describe("Supabase box office repository", () => {
  it("reads through the named RPC without exposing credentials in the result", async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).has("apikey")).toBe(true);
      return new Response(JSON.stringify(stored), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await readBoxOfficePeriod("2026-09-06", "daily", {
      fetchImpl, supabaseUrl: "https://fixture.supabase.co", supabaseSecretKey: "fixture-secret",
    });
    expect(result?.meta).toMatchObject({ source: "cache", status: "ok" });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });

  it("returns null when no period has been saved", async () => {
    const fetchImpl = vi.fn(async () => new Response("null", { status: 200 })) as unknown as typeof fetch;
    await expect(readBoxOfficePeriod("2026-09-06", "daily", {
      fetchImpl, supabaseUrl: "https://fixture.supabase.co", supabaseSecretKey: "fixture-secret",
    })).resolves.toBeNull();
  });

  it("sends one save RPC and validates its read-back payload", async () => {
    const fetchImpl = vi.fn(async (input) => {
      expect(input.toString()).toContain("/rpc/save_box_office_period");
      return new Response(JSON.stringify({ saved: true, period: stored }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await saveBoxOfficePeriod(stored, {
      fetchImpl, supabaseUrl: "https://fixture.supabase.co", supabaseSecretKey: "fixture-secret",
    });
    expect(result.saved).toBe(true);
    expect(result.response.data.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps read and write failures to different service errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const options = { fetchImpl, supabaseUrl: "https://fixture.supabase.co", supabaseSecretKey: "fixture-secret" };
    await expect(readBoxOfficePeriod("2026-09-06", "daily", options)).rejects.toMatchObject({ code: "CACHE_READ_ERROR", statusCode: 503 });
    await expect(saveBoxOfficePeriod(stored, options)).rejects.toMatchObject({ code: "CACHE_WRITE_ERROR", statusCode: 503 });
  });
});
