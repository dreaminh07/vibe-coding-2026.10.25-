const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [name, ...value] = argument.replace(/^--/, "").split("=");
  return [name, value.join("=")];
}));
const date = args.date;
const period = args.period;
const validDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const validPeriods = ["daily", "weekly", "weekend"];

function finish(code, lines) {
  for (const line of lines) console.log(line);
  process.exitCode = code;
}

if (!validDate || !validPeriods.includes(period)) {
  finish(1, ["비교하지 못했습니다: --date=YYYY-MM-DD와 --period=daily|weekly|weekend를 확인해 주세요."]);
} else if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.KOBIS_API_KEY) {
  finish(1, ["비교하지 못했습니다: 서버 환경변수 설정을 확인해 주세요."]);
} else {
  const maximumBigInt = 9_223_372_036_854_775_807n;
  const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const integer = (value) => typeof value === "string" && /^\d+$/.test(value) && BigInt(value) <= maximumBigInt;
  const normalizeDate = (value) => {
    if (value === "") return null;
    if (typeof value !== "string") throw new Error("invalid date");
    const formatted = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted) || new Date(`${formatted}T00:00:00Z`).toISOString().slice(0, 10) !== formatted) throw new Error("invalid date");
    return formatted;
  };
  const normalizeItem = (value) => {
    if (!isRecord(value) || typeof value.movieCd !== "string" || !value.movieCd.trim()
      || typeof value.movieNm !== "string" || !value.movieNm.trim()
      || !integer(value.rank) || Number(value.rank) <= 0 || !Number.isSafeInteger(Number(value.rank))
      || !integer(value.salesAmt) || !integer(value.audiCnt) || !integer(value.salesAcc) || !integer(value.audiAcc)) {
      throw new Error("invalid item");
    }
    return {
      movieCd: value.movieCd.trim(), movieNm: value.movieNm.trim(), rank: Number(value.rank), openDt: normalizeDate(value.openDt),
      salesAmt: BigInt(value.salesAmt).toString(), audiCnt: BigInt(value.audiCnt).toString(),
      salesAcc: BigInt(value.salesAcc).toString(), audiAcc: BigInt(value.audiAcc).toString(),
    };
  };
  const canonical = (response) => JSON.stringify({
    status: response.meta.status, queryDate: response.meta.queryDate, type: response.meta.type,
    rangeStart: response.meta.rangeStart, rangeEnd: response.meta.rangeEnd,
    items: [...response.data.items].sort((a, b) => a.rank - b.rank || a.movieCd.localeCompare(b.movieCd)),
  });

  try {
    const rpcUrl = new URL("/rest/v1/rpc/read_box_office_period", process.env.SUPABASE_URL);
    const storedResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_period_type: period, p_query_date: date, p_schema_version: 1 }),
    });
    if (!storedResponse.ok) throw new Error("stored read failed");
    const stored = await storedResponse.json();
    if (stored === null) {
      finish(2, [`저장된 데이터가 아직 없습니다: ${date} / ${period}`]);
    } else {
      if (!isRecord(stored) || !isRecord(stored.data) || !isRecord(stored.meta) || !Array.isArray(stored.data.items)) throw new Error("invalid stored response");
      if ((stored.meta.status === "ok" && stored.data.items.length === 0) || (stored.meta.status === "empty" && stored.data.items.length !== 0)) throw new Error("invalid stored status");
      const storedCodes = new Set(stored.data.items.map((item) => item.movieCd));
      if (storedCodes.size !== stored.data.items.length) throw new Error("duplicate stored movie");
      const normalizedStored = {
        data: {
          items: stored.data.items.map((item) => normalizeItem({
            ...item,
            rank: String(item.rank),
            openDt: item.openDt ?? "",
          })),
        },
        meta: stored.meta,
      };

      const kobisUrl = new URL(period === "daily"
        ? "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json"
        : "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchWeeklyBoxOfficeList.json");
      kobisUrl.searchParams.set("key", process.env.KOBIS_API_KEY);
      kobisUrl.searchParams.set("targetDt", date.replaceAll("-", ""));
      kobisUrl.searchParams.set("itemPerPage", "10");
      if (period !== "daily") kobisUrl.searchParams.set("weekGb", period === "weekly" ? "0" : "1");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      let freshResponse;
      try {
        freshResponse = await fetch(kobisUrl, { signal: controller.signal, cache: "no-store" });
      } finally {
        clearTimeout(timeout);
      }
      if (!freshResponse.ok) throw new Error("KOBIS request failed");
      const payload = await freshResponse.json();
      if (!isRecord(payload) || isRecord(payload.faultInfo) || isRecord(payload.errorMessage) || !isRecord(payload.boxOfficeResult)) throw new Error("KOBIS body error");
      const result = payload.boxOfficeResult;
      const list = result[period === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList"];
      const range = typeof result.showRange === "string" ? /^(\d{8})~(\d{8})$/.exec(result.showRange) : null;
      if (!Array.isArray(list) || !range) throw new Error("invalid KOBIS response");
      const fresh = {
        data: { items: list.map(normalizeItem) },
        meta: {
          status: list.length === 0 ? "empty" : "ok", queryDate: date, type: period,
          rangeStart: normalizeDate(range[1]), rangeEnd: normalizeDate(range[2]),
        },
      };
      const matches = canonical(normalizedStored) === canonical(fresh);
      finish(matches ? 0 : 1, [
        `저장본 내부 정합성: 통과 (${stored.data.items.length}건)`,
        `KOBIS 최신 응답 대조: ${matches ? "일치" : "불일치"} (${fresh.data.items.length}건)`,
        matches ? "검증 결과: 모두 같습니다." : "검증 결과: 저장본과 최신 KOBIS 응답이 다릅니다.",
      ]);
    }
  } catch {
    finish(1, ["비교하지 못했습니다: 저장소 또는 KOBIS 응답을 확인해 주세요."]);
  }
}
