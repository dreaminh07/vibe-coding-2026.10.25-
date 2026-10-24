import "server-only";

const requiredVariables = ["KOBIS_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

type ServerEnvironment = Record<(typeof requiredVariables)[number], string>;

/** Read only when an external service is needed, never at build time. */
export function getServerEnvironment(): ServerEnvironment {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    // Only variable names may appear in diagnostic messages.
    throw new Error(`서버 환경변수 설정이 필요합니다: ${missing.join(", ")}`);
  }

  return Object.fromEntries(requiredVariables.map((name) => [name, process.env[name]!])) as ServerEnvironment;
}
