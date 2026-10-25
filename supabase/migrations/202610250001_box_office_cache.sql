begin;

create table if not exists public.movies (
  movie_cd text primary key check (btrim(movie_cd) <> ''),
  movie_nm text not null check (btrim(movie_nm) <> ''),
  open_dt date null
);

create table if not exists public.box_office_periods (
  period_id bigint generated always as identity primary key,
  period_type text not null check (period_type in ('daily', 'weekly', 'weekend')),
  query_date date not null,
  schema_version integer not null default 1 check (schema_version > 0),
  range_start date not null,
  range_end date not null,
  status text not null check (status in ('ok', 'empty')),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  unique (period_type, query_date, schema_version),
  check (range_start <= range_end),
  check (expires_at > fetched_at),
  check (period_type <> 'daily' or (range_start = query_date and range_end = query_date))
);

create table if not exists public.box_office_results (
  period_id bigint not null references public.box_office_periods(period_id) on delete cascade,
  movie_cd text not null references public.movies(movie_cd) on delete restrict,
  rank integer not null check (rank > 0),
  sales_amt bigint not null check (sales_amt >= 0),
  audi_cnt bigint not null check (audi_cnt >= 0),
  sales_acc bigint not null check (sales_acc >= 0),
  audi_acc bigint not null check (audi_acc >= 0),
  primary key (period_id, movie_cd)
);

create index if not exists box_office_results_period_rank_idx
  on public.box_office_results(period_id, rank);
create index if not exists box_office_results_movie_period_idx
  on public.box_office_results(movie_cd, period_id);

alter table public.movies enable row level security;
alter table public.box_office_periods enable row level security;
alter table public.box_office_results enable row level security;

revoke all on table public.movies, public.box_office_periods, public.box_office_results from public, anon, authenticated;
revoke all on sequence public.box_office_periods_period_id_seq from public, anon, authenticated;

create or replace function public.read_box_office_period(
  p_period_type text,
  p_query_date date,
  p_schema_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.box_office_periods%rowtype;
  v_items jsonb;
begin
  select * into v_period
  from public.box_office_periods
  where period_type = p_period_type
    and query_date = p_query_date
    and schema_version = p_schema_version;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'movieCd', m.movie_cd,
        'movieNm', m.movie_nm,
        'rank', r.rank,
        'openDt', case when m.open_dt is null then null else to_char(m.open_dt, 'YYYY-MM-DD') end,
        'salesAmt', r.sales_amt::text,
        'audiCnt', r.audi_cnt::text,
        'salesAcc', r.sales_acc::text,
        'audiAcc', r.audi_acc::text
      ) order by r.rank, m.movie_cd
    ) filter (where r.movie_cd is not null),
    '[]'::jsonb
  ) into v_items
  from public.box_office_results r
  join public.movies m on m.movie_cd = r.movie_cd
  where r.period_id = v_period.period_id;

  if (v_period.status = 'ok' and jsonb_array_length(v_items) = 0)
     or (v_period.status = 'empty' and jsonb_array_length(v_items) <> 0) then
    raise exception 'box office period status and result count disagree';
  end if;

  return jsonb_build_object(
    'data', jsonb_build_object('items', v_items),
    'meta', jsonb_build_object(
      'status', v_period.status,
      'mode', 'live',
      'queryDate', to_char(v_period.query_date, 'YYYY-MM-DD'),
      'type', v_period.period_type,
      'rangeStart', to_char(v_period.range_start, 'YYYY-MM-DD'),
      'rangeEnd', to_char(v_period.range_end, 'YYYY-MM-DD'),
      'source', 'cache',
      'collectedAt', to_jsonb(v_period.fetched_at),
      'cachedAt', to_jsonb(v_period.fetched_at),
      'expiresAt', to_jsonb(v_period.expires_at)
    )
  );
end;
$$;

create or replace function public.save_box_office_period(
  p_period_type text,
  p_query_date date,
  p_schema_version integer,
  p_range_start date,
  p_range_end date,
  p_status text,
  p_fetched_at timestamptz,
  p_expires_at timestamptz,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.box_office_periods%rowtype;
  v_period_id bigint;
  v_item jsonb;
begin
  if p_period_type not in ('daily', 'weekly', 'weekend')
     or p_schema_version <= 0
     or p_range_start > p_range_end
     or p_expires_at <= p_fetched_at
     or (p_period_type = 'daily' and (p_range_start <> p_query_date or p_range_end <> p_query_date))
     or jsonb_typeof(p_items) <> 'array'
     or (p_status = 'ok' and jsonb_array_length(p_items) = 0)
     or (p_status = 'empty' and jsonb_array_length(p_items) <> 0)
     or p_status not in ('ok', 'empty') then
    raise exception 'invalid box office period payload';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_period_type || ':' || p_query_date::text || ':' || p_schema_version::text, 0)
  );

  select * into v_existing
  from public.box_office_periods
  where period_type = p_period_type
    and query_date = p_query_date
    and schema_version = p_schema_version
  for update;

  if found and v_existing.fetched_at >= p_fetched_at then
    return jsonb_build_object(
      'saved', false,
      'period', public.read_box_office_period(p_period_type, p_query_date, p_schema_version)
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.movies(movie_cd, movie_nm, open_dt)
    values (
      btrim(v_item->>'movieCd'),
      btrim(v_item->>'movieNm'),
      nullif(v_item->>'openDt', '')::date
    )
    on conflict (movie_cd) do update
      set movie_nm = excluded.movie_nm,
          open_dt = excluded.open_dt;
  end loop;

  if v_existing.period_id is null then
    insert into public.box_office_periods(
      period_type, query_date, schema_version, range_start, range_end, status, fetched_at, expires_at
    ) values (
      p_period_type, p_query_date, p_schema_version, p_range_start, p_range_end, p_status, p_fetched_at, p_expires_at
    ) returning period_id into v_period_id;
  else
    v_period_id := v_existing.period_id;
    update public.box_office_periods
    set range_start = p_range_start,
        range_end = p_range_end,
        status = p_status,
        fetched_at = p_fetched_at,
        expires_at = p_expires_at
    where period_id = v_period_id;
  end if;

  delete from public.box_office_results where period_id = v_period_id;

  insert into public.box_office_results(period_id, movie_cd, rank, sales_amt, audi_cnt, sales_acc, audi_acc)
  select
    v_period_id,
    btrim(value->>'movieCd'),
    (value->>'rank')::integer,
    (value->>'salesAmt')::bigint,
    (value->>'audiCnt')::bigint,
    (value->>'salesAcc')::bigint,
    (value->>'audiAcc')::bigint
  from jsonb_array_elements(p_items);

  return jsonb_build_object(
    'saved', true,
    'period', public.read_box_office_period(p_period_type, p_query_date, p_schema_version)
  );
end;
$$;

revoke execute on function public.read_box_office_period(text, date, integer) from public, anon, authenticated;
revoke execute on function public.save_box_office_period(text, date, integer, date, date, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.read_box_office_period(text, date, integer) to service_role;
grant execute on function public.save_box_office_period(text, date, integer, date, date, text, timestamptz, timestamptz, jsonb) to service_role;

commit;
