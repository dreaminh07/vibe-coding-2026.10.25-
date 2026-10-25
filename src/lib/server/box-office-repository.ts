import "server-only";
import { periodTypes, type BoxOfficeItem, type BoxOfficeResponse, type PeriodType } from "@/lib/contracts/box-office";
import { BoxOfficeError } from "@/lib/server/box-office-error";
import { isDate } from "@/lib/server/box-office-validation";
import { getSupabaseServerEnvironment } from "@/lib/server/env";

const schemaVersion = 1;
const databaseTimeoutMs = 3_000;
const maximumBigInt = 9_223_372_036_854_775_807n;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

interface RepositoryOptions {
  fetchImpl?: FetchLike;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
  timeoutMs?: number;
}

export interface SaveResult {
  saved: boolean;
  response: BoxOfficeResponse;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: UnknownRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`invalid ${field}`);
  return value;
}

function integerString(record: UnknownRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) > maximumBigInt) throw new Error(`invalid ${field}`);
  return BigInt(value).toString();
}

function parseItem(value: unknown): BoxOfficeItem {
  if (!isRecord(value)) throw new Error("invalid item");
  const rank = value.rank;
  if (typeof rank !== "number" || !Number.isSafeInteger(rank) || rank <= 0 || rank > 2_147_483_647) throw new Error("invalid rank");
  const openDt = value.openDt;
  if (openDt !== null && (typeof openDt !== "string" || !isDate(openDt))) throw new Error("invalid openDt");
  return {
    movieCd: requiredString(value, "movieCd"),
    movieNm: requiredString(value, "movieNm"),
    rank,
    openDt,
    salesAmt: integerString(value, "salesAmt"),
    audiCnt: integerString(value, "audiCnt"),
    salesAcc: integerString(value, "salesAcc"),
    audiAcc: integerString(value, "audiAcc"),
  };
}

function parseIso(value: unknown, field: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`invalid ${field}`);
  return value;
}

export function parseStoredResponse(value: unknown): BoxOfficeResponse {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.meta) || !Array.isArray(value.data.items)) {
    throw new Error("invalid stored response");
  }
  const type = value.meta.type;
  const status = value.meta.status;
  if (typeof type !== "string" || !periodTypes.includes(type as PeriodType) || (status !== "ok" && status !== "empty")) {
    throw new Error("invalid stored metadata");
  }
  const items = value.data.items.map(parseItem);
  if ((status === "ok" && items.length === 0) || (status === "empty" && items.length !== 0)) throw new Error("invalid stored status");
  const queryDate = requiredString(value.meta, "queryDate");
  const rangeStart = requiredString(value.meta, "rangeStart");
  const rangeEnd = requiredString(value.meta, "rangeEnd");
  if (!isDate(queryDate) || !isDate(rangeStart) || !isDate(rangeEnd) || rangeStart > rangeEnd) throw new Error("invalid stored dates");
  const movieCodes = new Set(items.map((item) => item.movieCd));
  if (movieCodes.size !== items.length) throw new Error("duplicate stored movie");
  return {
    data: { items },
    meta: {
      status,
      mode: "live",
      queryDate,
      type: type as PeriodType,
      rangeStart,
      rangeEnd,
      source: "cache",
      collectedAt: parseIso(value.meta.collectedAt, "collectedAt"),
      cachedAt: parseIso(value.meta.cachedAt, "cachedAt"),
      expiresAt: parseIso(value.meta.expiresAt, "expiresAt"),
    },
  };
}

async function rpc(name: string, body: UnknownRecord, options: RepositoryOptions): Promise<unknown> {
  let supabaseUrl = options.supabaseUrl;
  let supabaseSecretKey = options.supabaseSecretKey;
  if (!supabaseUrl || !supabaseSecretKey) {
    let environment;
    try {
      environment = getSupabaseServerEnvironment();
    } catch {
      throw new BoxOfficeError("SERVER_MISCONFIGURED", 500, "서버 설정을 확인해 주세요.");
    }
    supabaseUrl ??= environment.SUPABASE_URL;
    supabaseSecretKey ??= environment.SUPABASE_SECRET_KEY;
  }
  let endpoint: URL;
  try {
    endpoint = new URL(`/rest/v1/rpc/${name}`, supabaseUrl);
  } catch {
    throw new BoxOfficeError("SERVER_MISCONFIGURED", 500, "서버 설정을 확인해 주세요.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? databaseTimeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: supabaseSecretKey,
        Authorization: `Bearer ${supabaseSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("database rpc failed");
    return await response.json();
  } catch (error) {
    if (error instanceof BoxOfficeError) throw error;
    throw new BoxOfficeError("CACHE_RPC_ERROR", 503, "저장된 데이터를 처리하지 못했습니다.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function readBoxOfficePeriod(date: string, type: PeriodType, options: RepositoryOptions = {}): Promise<BoxOfficeResponse | null> {
  let payload: unknown;
  try {
    payload = await rpc("read_box_office_period", { p_period_type: type, p_query_date: date, p_schema_version: schemaVersion }, options);
    return payload === null ? null : parseStoredResponse(payload);
  } catch (error) {
    if (error instanceof BoxOfficeError && error.code === "SERVER_MISCONFIGURED") throw error;
    throw new BoxOfficeError("CACHE_READ_ERROR", 503, "저장된 데이터를 확인하지 못했습니다.");
  }
}

export async function saveBoxOfficePeriod(response: BoxOfficeResponse, options: RepositoryOptions = {}): Promise<SaveResult> {
  let payload: unknown;
  try {
    payload = await rpc("save_box_office_period", {
      p_period_type: response.meta.type,
      p_query_date: response.meta.queryDate,
      p_schema_version: schemaVersion,
      p_range_start: response.meta.rangeStart,
      p_range_end: response.meta.rangeEnd,
      p_status: response.meta.status,
      p_fetched_at: response.meta.collectedAt,
      p_expires_at: response.meta.expiresAt,
      p_items: response.data.items,
    }, options);
    if (!isRecord(payload) || typeof payload.saved !== "boolean") throw new Error("invalid save response");
    return { saved: payload.saved, response: parseStoredResponse(payload.period) };
  } catch (error) {
    if (error instanceof BoxOfficeError && error.code === "SERVER_MISCONFIGURED") throw error;
    throw new BoxOfficeError("CACHE_WRITE_ERROR", 503, "데이터를 저장하지 못했습니다.");
  }
}
