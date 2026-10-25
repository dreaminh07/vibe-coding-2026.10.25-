import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("returns success, empty, simulated error and invalid input distinctly without external I/O", async () => {
  vi.stubEnv("DATA_MODE", "demo");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const [date, type, status, code] of [
    ["2026-09-07", "daily", 200, "ok"],
    ["2026-09-06", "weekly", 200, "empty"],
    ["2026-09-14", "daily", 502, "error"],
    ["2026-02-30", "daily", 400, "error"],
    ["2026-09-07", "invalid", 400, "error"],
  ] as const) {
    const response = await GET(new Request(`http://localhost/api/box-office?date=${date}&type=${type}`));
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(status === 200 ? body.meta.status : "error").toBe(code);
    if (status === 200) {
      expect(body.meta).toMatchObject({ source: "fixture", collectedAt: "2026-09-14T09:00:00+09:00", cachedAt: null });
      expect(Array.isArray(body.data.items)).toBe(true);
    } else {
      expect(body.error).toMatchObject({ retryable: status >= 500 });
    }
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("fails closed for live and unknown modes, defaults to demo when unset", async () => {
  for (const [mode, status, code] of [["live", 501, "LIVE_NOT_IMPLEMENTED"], ["bad", 500, "INVALID_DATA_MODE"]] as const) {
    vi.stubEnv("DATA_MODE", mode);
    const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-07&type=daily"));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  }
  vi.stubEnv("DATA_MODE", undefined);
  const response = await GET(new Request("http://localhost/api/box-office?date=2026-09-07&type=daily"));
  expect((await response.json()).meta.mode).toBe("demo");
});
