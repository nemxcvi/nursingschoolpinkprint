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
--   challenge_answers  right/wrong per question per finished player, only to build the group's
--                      combined totals (Group focus). Never returned per player; deleted with
--                      the challenge (7 days after it expires).
--                      No codes, lookup IDs or device info.
--   class_tally        (phase 6) per question: times answered and times wrong. Nothing else:
--                      no code, lookup ID, device or time. Only the owner's stats page reads it.
--   shared_files       Library uploads: title, description, unit/topic tags, display name (or
--                      none = Anonymous), file name, type and size. The file itself is in the
--                      Cloudflare R2 bucket under the row's id. The uploader is a hash of their
--                      lookup ID made only for this table, so it can't be matched to the vault.
--   pp_settings        hashes of the owner's stats key and Library admin key (set once with
--                      set_stats_key / set_library_admin_key, below).
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

-- Random challenge code: 4 characters, no look-alikes (0/O, 1/I/L). Codes in use are never reused
-- (create_challenge draws again); older challenges may still have 8-character codes.
create or replace function public.pp_short_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  s text := '';
  b int;
begin
  while length(s) < 4 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 248 then                              -- 248 = 8 × 31: no bias toward any letter
      s := s || substr(alphabet, (b % 31) + 1, 1);
    end if;
  end loop;
  return s;
end $$;

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

-- (Previews let players choose whether to share; Group focus now counts everyone who finishes.
-- The column is kept so re-running this file never fails.)
alter table public.challenge_players add column if not exists share_focus boolean not null default false;

-- Right/wrong per question for each player who finished (Group focus). Only combined counts
-- ever leave the database. Deleted with the player row, so with the challenge.
create table if not exists public.challenge_answers (
  challenge_id text not null,
  ticket_hash text not null,
  question_id text not null,
  correct boolean not null,
  primary key (challenge_id, ticket_hash, question_id),
  foreign key (challenge_id, ticket_hash) references public.challenge_players (challenge_id, ticket_hash) on delete cascade
);

create table if not exists public.class_tally (
  question_id text primary key check (question_id ~ '^nur[0-9]+-u[0-9]+-[a-z0-9-]+-[0-9]{3}$'),
  times_answered integer not null default 0,
  times_wrong integer not null default 0
);

create table if not exists public.shared_files (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null,
  title text not null check (length(title) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  units jsonb not null,
  topics jsonb not null,
  display_name text check (display_name is null or length(display_name) between 1 and 40),
  file_name text not null check (length(file_name) between 1 and 160),
  mime text not null,
  size integer not null check (size between 1 and 20971520),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists shared_files_owner on public.shared_files (owner_hash, created_at);

create table if not exists public.pp_settings (
  key text primary key,
  value text not null
);

-- Block all direct access: row level security on with no policies, and no table privileges
alter table public.vault enable row level security;
alter table public.nickname_claims enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_players enable row level security;
alter table public.challenge_answers enable row level security;
alter table public.class_tally enable row level security;
alter table public.pp_settings enable row level security;
alter table public.shared_files enable row level security;
revoke all on table public.vault, public.nickname_claims, public.challenges, public.challenge_players,
  public.challenge_answers, public.class_tally, public.pp_settings, public.shared_files from public, anon, authenticated;

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

-- Saves your score from your answers: [{"q": "<question id>", "ok": true|false}, ...], one per
-- question in the challenge (unanswered = false). The score is the number right. Replaces any
-- answers saved before. Only the player holding the ticket can.
create or replace function public.submit_answers(p_id text, p_ticket text, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  ch public.challenges%rowtype;
  h text;
  n int;
begin
  if not public.pp_is_hex64(p_ticket) then raise exception 'bad ticket'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'bad answers'; end if;
  select * into ch from public.challenges c where c.id = upper(p_id);
  if not found or ch.expires_at < now() then return false; end if;
  h := public.pp_hash(p_ticket);
  if not exists (select 1 from public.challenge_players p where p.challenge_id = ch.id and p.ticket_hash = h) then
    return false;
  end if;
  n := jsonb_array_length(ch.questions);
  if exists (select 1 from jsonb_array_elements(p_answers) a
             where jsonb_typeof(a) <> 'object' or jsonb_typeof(a->'ok') is distinct from 'boolean'
                or not (ch.questions ? coalesce(a->>'q', ''))) then
    raise exception 'bad answers';
  end if;
  if jsonb_array_length(p_answers) <> n or (select count(distinct a->>'q') from jsonb_array_elements(p_answers) a) <> n then
    raise exception 'bad answers';
  end if;
  delete from public.challenge_answers a where a.challenge_id = ch.id and a.ticket_hash = h;
  insert into public.challenge_answers (challenge_id, ticket_hash, question_id, correct)
    select ch.id, h, a->>'q', (a->>'ok')::boolean from jsonb_array_elements(p_answers) a;
  update public.challenge_players p
    set score = (select count(*) from jsonb_array_elements(p_answers) a where (a->>'ok')::boolean), finished_at = now()
    where p.challenge_id = ch.id and p.ticket_hash = h;
  return true;
end $$;

-- No longer used by the site (Group focus counts everyone who finishes); kept so older pages don't
-- fail. Sets the old share choice before finishing.
create or replace function public.share_focus(p_id text, p_ticket text, p_share boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_is_hex64(p_ticket) then raise exception 'bad ticket'; end if;
  update public.challenge_players p
    set share_focus = coalesce(p_share, false)
    from public.challenges c
    where p.challenge_id = upper(p_id) and c.id = p.challenge_id and c.expires_at >= now()
      and p.ticket_hash = public.pp_hash(p_ticket)
      and p.finished_at is null;
  return found;
end $$;

-- One challenge by its short ID. Everyone sees the title, size, expiry and how many joined.
-- Scores are shown only to players who have finished, and to the creator, in the order people
-- finished. Group focus (challenges are for studying together, and players are told before they
-- start): once 2 or more players have finished with their answers saved, each of them sees how
-- many of those players missed each question. Combined counts only, never who missed what.
create or replace function public.load_challenge(p_id text, p_ticket text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ch public.challenges%rowtype;
  h text;
  me public.challenge_players%rowtype;
  is_creator boolean;
  can_see boolean;
  me_answered boolean;
  finishers int;
begin
  select * into ch from public.challenges c where c.id = upper(p_id);
  if not found or ch.expires_at < now() then return null; end if;
  if public.pp_is_hex64(p_ticket) then h := public.pp_hash(p_ticket); end if;
  is_creator := h is not null and h = ch.creator_hash;
  select * into me from public.challenge_players p where p.challenge_id = ch.id and p.ticket_hash = h;
  can_see := is_creator or me.finished_at is not null;
  me_answered := h is not null and exists (select 1 from public.challenge_answers a where a.challenge_id = ch.id and a.ticket_hash = h);
  select count(distinct a.ticket_hash) into finishers from public.challenge_answers a where a.challenge_id = ch.id;
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
                       order by p.finished_at nulls last, p.joined_at)
      from public.challenge_players p where p.challenge_id = ch.id), '[]'::jsonb) end,
    'focus', case when not (me_answered and finishers >= 2) then null else jsonb_build_object(
      'players', finishers,
      'missed', (select jsonb_object_agg(q.id, (select count(*) from public.challenge_answers a
                                                  where a.challenge_id = ch.id and a.question_id = q.id and not a.correct))
                 from jsonb_array_elements_text(ch.questions) q(id))) end
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

-- ---------- Library (shared resources) ----------
-- Every call needs the caller's lookup ID, and only works if that code has a saved copy (a real
-- tracking code). Ownership is a hash of the lookup ID made only for this table.
create or replace function public.pp_lib_owner(p_lookup text) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.pp_is_hex64(p_lookup)
               and exists (select 1 from public.vault v where v.lookup_hash = public.pp_hash(p_lookup))
         then public.pp_hash('library:' || p_lookup) end
$$;

-- Tags: ["all"] or course:unit codes like "nur114:U-03"; topics ["all"] or "nur114:U-03:safety"
create or replace function public.pp_lib_tags_ok(p jsonb, p_topics boolean) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 30
     and not exists (select 1 from jsonb_array_elements(p) t
                     where jsonb_typeof(t) <> 'string'
                        or not ((t #>> '{}') = 'all' or (t #>> '{}') ~ (case when p_topics
                              then '^[a-z0-9]{2,12}:U-[0-9]{2}:[a-z0-9-]{1,60}$' else '^[a-z0-9]{2,12}:U-[0-9]{2}$' end)))
$$;

-- Adds a file's details (the worker then stores the file in R2 under the returned id).
-- At most 10 uploads an hour and 30 a day per tracking code, so a slip can't flood the list.
create or replace function public.lib_add(p_lookup text, p_title text, p_description text, p_units jsonb, p_topics jsonb,
                                          p_display_name text, p_file_name text, p_mime text, p_size integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner text := public.pp_lib_owner(p_lookup);
  new_id uuid;
begin
  if owner is null then raise exception 'not tracking'; end if;
  if not public.pp_lib_tags_ok(p_units, false) or not public.pp_lib_tags_ok(p_topics, true) then raise exception 'bad tags'; end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'bad file type';
  end if;
  if (select count(*) from public.shared_files f where f.owner_hash = owner and f.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.shared_files f where f.owner_hash = owner and f.created_at > now() - interval '1 day') >= 30 then
    raise exception 'upload limit';
  end if;
  insert into public.shared_files (owner_hash, title, description, units, topics, display_name, file_name, mime, size)
    values (owner, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_units, p_topics,
            nullif(trim(coalesce(p_display_name, '')), ''), p_file_name, p_mime, p_size)
    returning id into new_id;
  return new_id;
end $$;

-- Every file, newest first, with 'mine' for the caller's own uploads. Never the owner hash.
create or replace function public.lib_list(p_lookup text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare owner text := public.pp_lib_owner(p_lookup);
begin
  if owner is null then raise exception 'not tracking'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'title', f.title, 'description', f.description, 'units', f.units, 'topics', f.topics,
      'name', f.display_name, 'file_name', f.file_name, 'mime', f.mime, 'size', f.size,
      'created_at', f.created_at, 'mine', f.owner_hash = owner) order by f.created_at desc)
    from public.shared_files f), '[]'::jsonb);
end $$;

-- One file's name and type, for a download link (tracking codes only)
create or replace function public.lib_get(p_lookup text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.pp_lib_owner(p_lookup) is null then raise exception 'not tracking'; end if;
  return (select jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime', f.mime, 'size', f.size)
          from public.shared_files f where f.id = p_id);
end $$;

-- Deletes your own file's details (the worker then removes the file from R2)
create or replace function public.lib_delete(p_lookup text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare owner text := public.pp_lib_owner(p_lookup);
begin
  if owner is null then raise exception 'not tracking'; end if;
  delete from public.shared_files f where f.id = p_id and f.owner_hash = owner;
  return found;
end $$;

-- Owner's Library admin key: run once in the SQL Editor with the same key as the Cloudflare secret
-- LIBRARY_ADMIN_KEY:   select public.set_library_admin_key('<your key>');   (only its hash is kept)
create or replace function public.set_library_admin_key(p_key text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 6 then raise exception 'use a key of at least 6 characters'; end if;
  insert into public.pp_settings (key, value) values ('library_admin_hash', public.pp_hash(p_key))
    on conflict (key) do update set value = excluded.value;
  return 'library admin key saved';
end $$;
create or replace function public.pp_lib_admin_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pp_settings s
                 where s.key = 'library_admin_hash' and s.value = public.pp_hash(coalesce(p_key, '')))
$$;
create or replace function public.lib_admin_list(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.pp_lib_admin_ok(p_key) then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'title', f.title, 'name', f.display_name, 'file_name', f.file_name, 'mime', f.mime,
      'size', f.size, 'created_at', f.created_at) order by f.created_at desc)
    from public.shared_files f), '[]'::jsonb);
end $$;
create or replace function public.lib_admin_delete(p_key text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pp_lib_admin_ok(p_key) then raise exception 'not allowed'; end if;
  delete from public.shared_files f where f.id = p_id;
  return found;
end $$;

-- ---------- Owner's stats page (phase 6) ----------
-- Run once in the SQL Editor (it can't be called from the site), with the same key you saved as
-- the Cloudflare secret STATS_KEY:   select public.set_stats_key('<your key>');
-- Only a hash of the key is stored. Run it again with a new key to change it.
create or replace function public.set_stats_key(p_key text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 32 then raise exception 'use a key of at least 32 characters'; end if;
  insert into public.pp_settings (key, value) values ('stats_key_hash', public.pp_hash(p_key))
    on conflict (key) do update set value = excluded.value;
  return 'stats key saved';
end $$;

-- Everything the stats page shows, only with the right key: the tally ([question id, answered,
-- wrong]), nicknames in use, and how many challenges are open.
create or replace function public.class_stats(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pp_settings s
                 where s.key = 'stats_key_hash' and s.value = public.pp_hash(coalesce(p_key, ''))) then
    raise exception 'not allowed';
  end if;
  return jsonb_build_object(
    'tally', coalesce((select jsonb_agg(jsonb_build_array(t.question_id, t.times_answered, t.times_wrong) order by t.question_id)
                       from public.class_tally t), '[]'::jsonb),
    'taken', coalesce((select jsonb_agg(c.nickname order by c.nickname) from public.nickname_claims c
                       where c.ticket_hash is not null and c.last_seen > now() - interval '1 year'), '[]'::jsonb),
    'open_challenges', (select count(*) from public.challenges c where c.expires_at >= now())
  );
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
  public.submit_score(text, text, integer), public.submit_answers(text, text, jsonb), public.share_focus(text, text, boolean),
  public.load_challenge(text, text),
  public.delete_challenge(text, text), public.increment_tally(jsonb), public.class_stats(text), public.ping(),
  public.lib_add(text, text, text, jsonb, jsonb, text, text, text, integer), public.lib_list(text),
  public.lib_get(text, uuid), public.lib_delete(text, uuid), public.lib_admin_list(text), public.lib_admin_delete(text, uuid)
  to anon;
