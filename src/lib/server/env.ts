import "server-only";

const requiredVariables = ["KOBIS_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

type ServerEnvironment = Record<(typeof requiredVariables)[number], string>;

export function getSupabaseServerEnvironment(): Pick<ServerEnvironment, "SUPABASE_URL" | "SUPABASE_SECRET_KEY"> {
  const names = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new Error(`서버 환경변수 설정이 필요합니다: ${missing.join(", ")}`);
  return { SUPABASE_URL: process.env.SUPABASE_URL!.trim(), SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY!.trim() };
}

/** Read only when an external service is needed, never at build time. */
export function getServerEnvironment(): ServerEnvironment {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    // Only variable names may appear in diagnostic messages.
    throw new Error(`서버 환경변수 설정이 필요합니다: ${missing.join(", ")}`);
  }

  return Object.fromEntries(requiredVariables.map((name) => [name, process.env[name]!])) as ServerEnvironment;
}
