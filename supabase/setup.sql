-- Nursing School Pinkprint: tracking storage (phases 4 and 6).
-- Paste all of this into Supabase → SQL Editor → New query, then Run. Safe to run again.
--
-- What it makes:
--   vault              one row per tracking code: encrypted progress only. The row key is a
--                      hash of the lookup ID (which the browser derives from the code), so the
--                      code, and even the lookup ID, are never stored.
--   nickname_claims    one person per nickname. Claims hold a hash of a random claim ticket,
--                      never the lookup ID, so a nickname can't be tied to progress.
--   challenges,        challenge links: question list, expiry, the creator's ticket hash, and
--   challenge_players  nickname + score per player (with that player's ticket hash).
--                      No codes, lookup IDs or device info.
--   class_tally        (phase 6) per question: times answered and times wrong. Nothing else:
--                      no code, lookup ID, device or time. Only the owner's stats page reads it.
--
-- Nothing can read or write these tables directly. The site can only call the functions at
-- the bottom, and only through the Cloudflare function in front of Supabase.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Helpers (not callable from the site) ----------
create or replace function public.pp_hash(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

-- Lookup IDs and tickets are 32 random bytes written as 64 lowercase hex characters
create or replace function public.pp_is_hex64(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p ~ '^[0-9a-f]{64}$', false)
$$;

-- Random, hard-to-guess challenge ID: 8 characters, no look-alikes (0/O, 1/I/L)
create or replace function public.pp_short_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  s text := '';
  b int;
begin
  while length(s) < 8 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 248 then                              -- 248 = 8 × 31: no bias toward any letter
      s := s || substr(alphabet, (b % 31) + 1, 1);
    end if;
  end loop;
  return s;
end $$;

-- True when p_proof shows the nickname belongs to the caller: their nickname claim ticket, or
-- for "Miss Pinkprint" the owner phrase (same SHA-256 fingerprint as OWNER_HASH in the site).
create or replace function public.pp_owns_nickname(p_nickname text, p_proof text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_nickname = 'Miss Pinkprint'
    then public.pp_hash(coalesce(p_proof, '')) = 'cb84dd2509deb1db5485dbd495bc23928cd3cd90d2b6c2741539a3ff474793c5'
    else exists (select 1 from public.nickname_claims c
                 where c.nickname = p_nickname and c.ticket_hash = public.pp_hash(coalesce(p_proof, '')))
  end
$$;

-- ---------- Tables ----------
create table if not exists public.vault (
  lookup_hash text primary key,
  data text not null check (length(data) <= 1500000),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.nickname_claims (
  nickname text primary key,
  ticket_hash text,                              -- null = reserved for the site owner, never claimable
  claimed_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
insert into public.nickname_claims (nickname, ticket_hash) values ('Miss Pinkprint', null)
  on conflict (nickname) do nothing;

create table if not exists public.challenges (
  id text primary key,
  title text not null check (length(title) between 1 and 120),
  questions jsonb not null,
  creator_hash text not null,
  creator_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

alter table public.challenges add column if not exists creator_name text;

create table if not exists public.challenge_players (
  challenge_id text not null references public.challenges(id) on delete cascade,
  ticket_hash text not null,
  nickname text not null check (length(nickname) between 1 and 40),
  score integer,
  total integer not null,
  joined_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (challenge_id, ticket_hash)
);

create table if not exists public.class_tally (
  question_id text primary key check (question_id ~ '^nur[0-9]+-u[0-9]+-[a-z0-9-]+-[0-9]{3}$'),
  times_answered integer not null default 0,
  times_wrong integer not null default 0
);

-- Block all direct access: row level security on with no policies, and no table privileges
alter table public.vault enable row level security;
alter table public.nickname_claims enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_players enable row level security;
alter table public.class_tally enable row level security;
revoke all on table public.vault, public.nickname_claims, public.challenges, public.challenge_players,
  public.class_tally from public, anon, authenticated;

-- ---------- Vault: load and save by lookup ID ----------
create or replace function public.load_vault(p_lookup text)
returns table (data text, version integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_is_hex64(p_lookup) then raise exception 'bad lookup id'; end if;
  return query
    select v.data, v.version, v.updated_at from public.vault v
    where v.lookup_hash = public.pp_hash(p_lookup);
end $$;

-- Saves only if p_version matches the stored version (0 = first save). Otherwise returns
-- saved = false with the stored copy, so the browser can merge and try again.
-- saved = false with version 0 means the row no longer exists (deleted on another device).
create or replace function public.save_vault(p_lookup text, p_data text, p_version integer)
returns table (saved boolean, version integer, data text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  h text;
  cur public.vault%rowtype;
begin
  if not public.pp_is_hex64(p_lookup) then raise exception 'bad lookup id'; end if;
  if p_data is null or length(p_data) > 1500000 then raise exception 'bad data'; end if;
  h := public.pp_hash(p_lookup);
  select * into cur from public.vault v where v.lookup_hash = h for update;
  if not found then
    if coalesce(p_version, -1) <> 0 then
      return query select false, 0, null::text;
      return;
    end if;
    insert into public.vault (lookup_hash, data) values (h, p_data) on conflict (lookup_hash) do nothing;
    if not found then                            -- another device created it a moment ago
      return query select false, v.version, v.data from public.vault v where v.lookup_hash = h;
      return;
    end if;
    return query select true, 1, null::text;
    return;
  end if;
  if cur.version <> p_version then
    return query select false, cur.version, cur.data;
    return;
  end if;
  update public.vault v set data = p_data, version = cur.version + 1, updated_at = now()
    where v.lookup_hash = h;
  return query select true, cur.version + 1, null::text;
end $$;

create or replace function public.delete_vault(p_lookup text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_is_hex64(p_lookup) then raise exception 'bad lookup id'; end if;
  delete from public.vault v where v.lookup_hash = public.pp_hash(p_lookup);
  return found;
end $$;

-- ---------- Nicknames: one person per name, first come first served ----------
-- Names in use (including the owner's reserved name). A claim unused for a year is free again.
create or replace function public.taken_nicknames() returns setof text
language sql security definer set search_path = '' as $$
  select c.nickname from public.nickname_claims c
  where c.ticket_hash is null or c.last_seen > now() - interval '1 year'
$$;

-- Claims a free name, or refreshes your own claim (call it on each sync to keep the name).
-- Returns false if someone else has it.
create or replace function public.claim_nickname(p_nickname text, p_ticket text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if not public.pp_is_hex64(p_ticket) then raise exception 'bad ticket'; end if;
  if p_nickname is null or length(p_nickname) not between 1 and 40 then raise exception 'bad nickname'; end if;
  h := public.pp_hash(p_ticket);
  insert into public.nickname_claims as c (nickname, ticket_hash) values (p_nickname, h)
  on conflict (nickname) do update
    set ticket_hash = excluded.ticket_hash,
        claimed_at = case when c.ticket_hash = excluded.ticket_hash then c.claimed_at else now() end,
        last_seen = now()
    where c.ticket_hash is not null
      and (c.ticket_hash = excluded.ticket_hash or c.last_seen < now() - interval '1 year');
  return found;
end $$;

-- Frees a name (changing nickname, or Delete my data). Only the ticket holder can.
create or replace function public.release_nickname(p_nickname text, p_ticket text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_is_hex64(p_ticket) then raise exception 'bad ticket'; end if;
  delete from public.nickname_claims c
    where c.nickname = p_nickname and c.ticket_hash = public.pp_hash(p_ticket);
  return found;
end $$;

-- ---------- Challenges ----------
-- Makes a challenge from 10, 20 or 40 question IDs and returns its short ID. The sender's
-- nickname is shown to the people they send it to (p_proof as for join_challenge).
drop function if exists public.create_challenge(text, jsonb, text);
create or replace function public.create_challenge(p_title text, p_questions jsonb, p_creator_ticket text,
                                                   p_nickname text, p_proof text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  new_id text;
  n int;
begin
  if not public.pp_is_hex64(p_creator_ticket) then raise exception 'bad ticket'; end if;
  if p_title is null or length(p_title) not between 1 and 120 then raise exception 'bad title'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'bad questions'; end if;
  n := jsonb_array_length(p_questions);
  if n not in (10, 20, 40) then raise exception 'bad question count'; end if;
  if (select count(distinct q) from jsonb_array_elements_text(p_questions) q
        where q ~ '^nur[0-9]+-u[0-9]+-[a-z0-9-]+-[0-9]{3}$') <> n then
    raise exception 'bad question ids';
  end if;
  if not public.pp_owns_nickname(p_nickname, p_proof) then raise exception 'not your nickname'; end if;
  -- Old challenges are deleted 7 days after they expire
  delete from public.challenges c where c.expires_at < now() - interval '7 days';
  loop
    new_id := public.pp_short_id();
    begin
      insert into public.challenges (id, title, questions, creator_hash, creator_name)
        values (new_id, p_title, p_questions, public.pp_hash(p_creator_ticket), p_nickname);
      return new_id;
    exception when unique_violation then
      -- that ID is taken; draw another
    end;
  end loop;
end $$;

-- Joins (or rejoins) a challenge and returns its questions. Up to 10 players; not after it expires.
-- p_proof shows the nickname is yours (see pp_owns_nickname).
drop function if exists public.join_challenge(text, text, text);
create or replace function public.join_challenge(p_id text, p_ticket text, p_nickname text, p_proof text)
returns table (title text, questions jsonb, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  ch public.challenges%rowtype;
  h text;
begin
  if not public.pp_is_hex64(p_ticket) then raise exception 'bad ticket'; end if;
  if p_nickname is null or length(p_nickname) not between 1 and 40 then raise exception 'bad nickname'; end if;
  select * into ch from public.challenges c where c.id = upper(p_id) for update;
  if not found or ch.expires_at < now() then raise exception 'challenge not found or expired'; end if;
  if not public.pp_owns_nickname(p_nickname, p_proof) then raise exception 'not your nickname'; end if;
  h := public.pp_hash(p_ticket);
  if not exists (select 1 from public.challenge_players p where p.challenge_id = ch.id and p.ticket_hash = h) then
    if (select count(*) from public.challenge_players p where p.challenge_id = ch.id) >= 10 then
      raise exception 'challenge is full';
    end if;
    insert into public.challenge_players (challenge_id, ticket_hash, nickname, total)
      values (ch.id, h, p_nickname, jsonb_array_length(ch.questions));
  end if;
  return query select ch.title, ch.questions, ch.expires_at;
end $$;

-- Saves (or updates) your own score. Only the player holding the ticket can.
create or replace function public.submit_score(p_id text, p_ticket text, p_score integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_is_hex64(p_ticket) then raise exception 'bad ticket'; end if;
  update public.challenge_players p
    set score = p_score, finished_at = now()
    from public.challenges c
    where p.challenge_id = upper(p_id) and c.id = p.challenge_id and c.expires_at >= now()
      and p.ticket_hash = public.pp_hash(p_ticket)
      and p_score between 0 and p.total;
  return found;
end $$;

-- One challenge by its short ID. Everyone sees the title, size, expiry and how many joined.
-- Scores are shown only to players who have finished, and to the creator.
create or replace function public.load_challenge(p_id text, p_ticket text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ch public.challenges%rowtype;
  h text;
  me public.challenge_players%rowtype;
  is_creator boolean;
  can_see boolean;
begin
  select * into ch from public.challenges c where c.id = upper(p_id);
  if not found or ch.expires_at < now() then return null; end if;
  if public.pp_is_hex64(p_ticket) then h := public.pp_hash(p_ticket); end if;
  is_creator := h is not null and h = ch.creator_hash;
  select * into me from public.challenge_players p where p.challenge_id = ch.id and p.ticket_hash = h;
  can_see := is_creator or me.finished_at is not null;
  return jsonb_build_object(
    'id', ch.id,
    'title', ch.title,
    'from', ch.creator_name,
    'count', jsonb_array_length(ch.questions),
    'created_at', ch.created_at,
    'expires_at', ch.expires_at,
    'joined', (select count(*) from public.challenge_players p where p.challenge_id = ch.id),
    'is_creator', is_creator,
    'me', case when me.ticket_hash is null then null
               else jsonb_build_object('nickname', me.nickname, 'score', me.score, 'finished', me.finished_at is not null) end,
    'players', case when not can_see then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'score', p.score, 'total', p.total,
                                          'finished', p.finished_at is not null, 'me', p.ticket_hash = h)
                       order by p.score desc nulls last, p.finished_at, p.joined_at)
      from public.challenge_players p where p.challenge_id = ch.id), '[]'::jsonb) end
  );
end $$;

-- Deletes a challenge. Only its creator can.
create or replace function public.delete_challenge(p_id text, p_creator_ticket text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_is_hex64(p_creator_ticket) then raise exception 'bad ticket'; end if;
  delete from public.challenges c where c.id = upper(p_id) and c.creator_hash = public.pp_hash(p_creator_ticket);
  return found;
end $$;

-- ---------- Class tally (phase 6) ----------
-- Adds a batch of answers: [{"q": "<question id>", "ok": true|false}, ...], up to 50 at a time.
-- Only question IDs and right/wrong are stored, added into running totals.
create or replace function public.increment_tally(p_answers jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'bad answers'; end if;
  n := jsonb_array_length(p_answers);
  if n < 1 or n > 50 then raise exception 'bad answer count'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) a
             where jsonb_typeof(a) <> 'object'
                or coalesce(a->>'q', '') !~ '^nur[0-9]+-u[0-9]+-[a-z0-9-]+-[0-9]{3}$'
                or jsonb_typeof(a->'ok') is distinct from 'boolean') then
    raise exception 'bad answers';
  end if;
  insert into public.class_tally as t (question_id, times_answered, times_wrong)
    select a->>'q', count(*), count(*) filter (where not (a->>'ok')::boolean)
    from jsonb_array_elements(p_answers) a group by a->>'q'
  on conflict (question_id) do update
    set times_answered = t.times_answered + excluded.times_answered,
        times_wrong = t.times_wrong + excluded.times_wrong;
  return n;
end $$;

-- ---------- Keep-alive ----------
-- Called by the scheduled Cloudflare Worker so the free project doesn't pause. Also tidies up.
create or replace function public.ping() returns timestamptz
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.challenges c where c.expires_at < now() - interval '7 days';
  delete from public.nickname_claims c where c.ticket_hash is not null and c.last_seen < now() - interval '1 year';
  return now();
end $$;

-- ---------- Who can call what ----------
-- Only these functions are callable with the site's key. Everything else is blocked.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.load_vault(text), public.save_vault(text, text, integer), public.delete_vault(text),
  public.taken_nicknames(), public.claim_nickname(text, text), public.release_nickname(text, text),
  public.create_challenge(text, jsonb, text, text, text), public.join_challenge(text, text, text, text),
  public.submit_score(text, text, integer), public.load_challenge(text, text),
  public.delete_challenge(text, text), public.increment_tally(jsonb), public.ping()
  to anon;
