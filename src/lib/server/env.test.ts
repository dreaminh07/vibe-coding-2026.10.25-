import { afterEach, describe, expect, it, vi } from "vitest";

// Unit tests run outside React Server Components; production retains the guard.
vi.mock("server-only", () => ({}));

import { getServerEnvironment } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("server configuration", () => {
  it("rejects missing settings with variable names only", () => {
    vi.stubEnv("KOBIS_API_KEY", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    expect(getServerEnvironment).toThrow(
      "서버 환경변수 설정이 필요합니다: KOBIS_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY",
    );
  });

  it("rejects whitespace-only settings", () => {
    vi.stubEnv("KOBIS_API_KEY", "   ");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    expect(getServerEnvironment).toThrow("KOBIS_API_KEY");
  });
});
