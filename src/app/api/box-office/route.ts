import { setTimeout } from "node:timers/promises";
import { BoxOfficeError } from "@/lib/server/box-office-error";
import { getBoxOffice, getDataMode, parseQuery } from "@/lib/server/demo-box-office";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const mode = getDataMode();
    const { date, type } = parseQuery(new URL(request.url).searchParams);
    // Demo-only delay makes loading reproducible without external I/O.
    if (mode === "demo") await setTimeout(600);
    return Response.json(await getBoxOffice(date, type, mode), { headers });
  } catch (error) {
    if (error instanceof BoxOfficeError) {
      return Response.json({ error: { code: error.code, message: error.message, retryable: error.statusCode >= 500 } }, { status: error.statusCode, headers });
    }
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", retryable: true } }, { status: 500, headers });
  }
}
