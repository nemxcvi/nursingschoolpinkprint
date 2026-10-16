-- Tests for setup.sql. Runs as the site's key (anon). Every check stops with an error if it fails.
-- Local only: psql -v ON_ERROR_STOP=1 -d <test db> -f supabase/test.sql
set role anon;
\set QUIET on

-- 1. Tables can't be read or written directly, and helpers can't be called
do $$
declare t text;
begin
  foreach t in array array['vault','nickname_claims','challenges','challenge_players','class_tally','pp_settings'] loop
    begin execute format('select count(*) from public.%I', t); raise exception 'READ ALLOWED on %', t;
    exception when insufficient_privilege then null; end;
    begin execute format('delete from public.%I', t); raise exception 'DELETE ALLOWED on %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  begin perform public.pp_hash('x'); raise exception 'helper callable';
  exception when insufficient_privilege then null; end;
  begin perform public.set_stats_key(repeat('k', 40)); raise exception 'set_stats_key callable from the site';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 1 - tables and helpers are blocked';
end $$;

-- 2. Vault
do $$
declare
  lk text := encode(extensions.gen_random_bytes(32), 'hex');
  r record;
begin
  assert (select count(*) from public.load_vault(lk)) = 0, 'empty at first';
  select * into r from public.save_vault(lk, 'cipher-1', 0);
  assert r.saved and r.version = 1, 'first save';
  select * into r from public.save_vault(lk, 'cipher-x', 0);
  assert not r.saved and r.version = 1 and r.data = 'cipher-1', 'second "first save" gets the stored copy back';
  select * into r from public.save_vault(lk, 'cipher-2', 1);
  assert r.saved and r.version = 2, 'save with the right version';
  select * into r from public.save_vault(lk, 'cipher-old', 1);
  assert not r.saved and r.version = 2 and r.data = 'cipher-2', 'stale version is refused with the newer copy';
  select * into r from public.load_vault(lk);
  assert r.data = 'cipher-2' and r.version = 2, 'load';
  begin perform public.load_vault('not-a-lookup-id'); raise exception 'bad lookup accepted';
  exception when raise_exception then if sqlerrm <> 'bad lookup id' then raise; end if; end;
  begin perform public.save_vault(lk, repeat('x', 1500001), 2); raise exception 'oversized data accepted';
  exception when raise_exception then if sqlerrm <> 'bad data' then raise; end if; end;
  assert public.delete_vault(lk), 'delete';
  assert not public.delete_vault(lk), 'already gone';
  select * into r from public.save_vault(lk, 'cipher-3', 2);
  assert not r.saved and r.version = 0, 'saving after delete reports the row is gone';
  raise notice 'ok 2 - vault load, save, conflicts and delete';
end $$;

-- 3. Nicknames
do $$
declare
  a text := encode(extensions.gen_random_bytes(32), 'hex');
  b text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  assert 'Miss Pinkprint' in (select public.taken_nicknames()), 'owner name is reserved';
  assert not public.claim_nickname('Miss Pinkprint', a), 'nobody can claim the owner name';
  assert public.claim_nickname('Lab Legend', a), 'first come';
  assert not public.claim_nickname('Lab Legend', b), 'first served';
  assert public.claim_nickname('Lab Legend', a), 'the owner of a claim can refresh it';
  assert 'Lab Legend' in (select public.taken_nicknames()), 'listed as taken';
  assert not public.release_nickname('Lab Legend', b), 'only the ticket holder can free it';
  assert public.release_nickname('Lab Legend', a), 'freed';
  assert public.claim_nickname('Lab Legend', b), 'free name can be claimed again';
  assert not public.release_nickname('Miss Pinkprint', a), 'owner name cannot be freed';
  raise notice 'ok 3 - nicknames: one per person, first come first served';
end $$;

-- 4. Challenges
do $$
declare
  creator text := encode(extensions.gen_random_bytes(32), 'hex');
  t0 text := encode(extensions.gen_random_bytes(32), 'hex');
  qs jsonb;
  cid text;
  t text[] := array[]::text[];
  i int;
  j jsonb;
begin
  select jsonb_agg('nur114-u3-safety-' || lpad(g::text, 3, '0')) into qs from generate_series(1, 20) g;
  perform public.claim_nickname('Quiz Queen', creator);
  begin perform public.create_challenge('Safety', qs, creator, 'Quiz Queen', t0); raise exception 'created under someone else''s nickname';
  exception when raise_exception then if sqlerrm <> 'not your nickname' then raise; end if; end;
  cid := public.create_challenge('Safety', qs, creator, 'Quiz Queen', creator);
  assert public.load_challenge(cid)->>'from' = 'Quiz Queen', 'shows who sent it';
  assert cid ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$', 'random 4-character code: ' || cid;
  begin perform public.create_challenge('x', qs - 0, creator, 'Quiz Queen', creator); raise exception 'odd count accepted';
  exception when raise_exception then if sqlerrm <> 'bad question count' then raise; end if; end;
  begin perform public.create_challenge('x', (qs - 0) || '["nur114-u3-safety-002"]'::jsonb, creator, 'Quiz Queen', creator); raise exception 'repeat question accepted';
  exception when raise_exception then if sqlerrm <> 'bad question ids' then raise; end if; end;
  begin perform public.create_challenge('x', (qs - 0) || '["drop table vault"]'::jsonb, creator, 'Quiz Queen', creator); raise exception 'junk question accepted';
  exception when raise_exception then if sqlerrm <> 'bad question ids' then raise; end if; end;

  for i in 1..10 loop
    t := t || encode(extensions.gen_random_bytes(32), 'hex');
    perform public.claim_nickname('Player ' || i, t[i]);           -- (tests reuse the ticket as the name ticket)
    perform public.join_challenge(lower(cid), t[i], 'Player ' || i, t[i]);
  end loop;
  perform public.join_challenge(cid, t[1], 'Player 1', t[1]);      -- rejoining is fine
  perform public.claim_nickname('Player 11', creator);
  begin perform public.join_challenge(cid, encode(extensions.gen_random_bytes(32), 'hex'), 'Player 11', creator); raise exception '11th player accepted';
  exception when raise_exception then if sqlerrm <> 'challenge is full' then raise; end if; end;
  assert (select count(*) from public.join_challenge(cid, t[2], 'Player 2', t[2]) where jsonb_array_length(questions) = 20) = 1, 'join returns the questions';
  begin perform public.join_challenge(cid, t[3], 'Player 4', t[3]); raise exception 'joined with someone else''s nickname';
  exception when raise_exception then if sqlerrm <> 'not your nickname' then raise; end if; end;
  begin perform public.join_challenge(cid, t[3], 'Miss Pinkprint', 'wrong phrase'); raise exception 'joined as the owner without the phrase';
  exception when raise_exception then if sqlerrm <> 'not your nickname' then raise; end if; end;

  j := public.load_challenge(cid);
  assert (j->>'joined')::int = 10 and jsonb_array_length(j->'players') = 0, 'outsiders see the count, not scores';
  j := public.load_challenge(cid, t[1]);
  assert jsonb_array_length(j->'players') = 0, 'a player who has not finished sees no scores yet';

  assert public.submit_score(cid, t[1], 17), 'player saves own score';
  assert public.submit_score(cid, t[1], 18), 'and can update it';
  assert not public.submit_score(cid, t[1], 21), 'not more than the question count';
  assert not public.submit_score(cid, encode(extensions.gen_random_bytes(32), 'hex'), 20), 'nobody else can submit for a player';
  j := public.load_challenge(cid, t[1]);
  assert jsonb_array_length(j->'players') = 10 and (j->'players'->0->>'score')::int = 18 and (j->'players'->0->>'me')::boolean, 'a finished player sees the scores';
  assert (public.load_challenge(cid, creator)->>'is_creator')::boolean and jsonb_array_length(public.load_challenge(cid, creator)->'players') = 10, 'the creator sees the scores';

  assert not public.delete_challenge(cid, t[1]), 'only the creator can delete';
  assert public.delete_challenge(cid, creator), 'creator deletes';
  assert public.load_challenge(cid) is null, 'gone';
  raise notice 'ok 4 - challenges: create and join (own nickname only, max 10), scores, privacy, delete';
end $$;

-- 6. Class tally: totals only, input checked
do $$
begin
  assert public.increment_tally('[{"q":"nur114-u3-safety-001","ok":true},{"q":"nur114-u3-safety-001","ok":false},{"q":"nur114-u3-safety-002","ok":false}]') = 3, 'batch counted';
  begin perform public.increment_tally('[{"q":"drop table vault","ok":true}]'); raise exception 'junk id accepted';
  exception when raise_exception then if sqlerrm <> 'bad answers' then raise; end if; end;
  begin perform public.increment_tally('[{"q":"nur114-u3-safety-001","ok":"yes"}]'); raise exception 'non-boolean accepted';
  exception when raise_exception then if sqlerrm <> 'bad answers' then raise; end if; end;
  begin perform public.increment_tally((select jsonb_agg('{"q":"nur114-u3-safety-001","ok":true}'::jsonb) from generate_series(1, 51))); raise exception '51 accepted';
  exception when raise_exception then if sqlerrm <> 'bad answer count' then raise; end if; end;
  raise notice 'ok 6 - class tally: batches of up to 50, checked';
end $$;

reset role;

do $$
begin
  assert (select times_answered = 2 and times_wrong = 1 from public.class_tally where question_id = 'nur114-u3-safety-001'), 'tally totals';
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'class_tally') = 3, 'tally stores nothing else';
end $$;

-- 7. Stats: only with the owner's key (set as the owner, read as the site)
do $$
begin
  begin perform public.set_stats_key('short'); raise exception 'short key accepted';
  exception when raise_exception then if sqlerrm <> 'use a key of at least 32 characters' then raise; end if; end;
  perform public.set_stats_key('test-stats-key-0123456789-abcdefghijkl');
  assert not exists (select 1 from public.pp_settings where value like '%test-stats-key%'), 'only the hash is stored';
end $$;
set role anon;
do $$
declare j jsonb;
begin
  begin perform public.class_stats('wrong key'); raise exception 'stats with a wrong key';
  exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if; end;
  begin perform public.class_stats(null); raise exception 'stats with no key';
  exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if; end;
  j := public.class_stats('test-stats-key-0123456789-abcdefghijkl');
  assert j->'tally' @> '[["nur114-u3-safety-001", 2, 1]]'::jsonb, 'tally rows';
  assert jsonb_typeof(j->'taken') = 'array' and not (j->'taken' ? 'Miss Pinkprint'), 'nicknames in use, without the reserved one';
  raise notice 'ok 7 - stats only with the owner''s key';
end $$;
reset role;

-- 5. Expiry and clean-up (setting dates needs the owner role)
do $$
declare
  creator text := encode(extensions.gen_random_bytes(32), 'hex');
  p text := encode(extensions.gen_random_bytes(32), 'hex');
  qs jsonb;
  cid text;
  old_cid text;
begin
  select jsonb_agg('nur114-u3-safety-' || lpad(g::text, 3, '0')) into qs from generate_series(1, 10) g;
  perform public.claim_nickname('Scrub Star', creator);
  cid := public.create_challenge('Expired', qs, creator, 'Scrub Star', creator);
  old_cid := public.create_challenge('Long gone', qs, creator, 'Scrub Star', creator);
  update public.challenges set expires_at = now() - interval '1 day' where id = cid;
  update public.challenges set expires_at = now() - interval '8 days' where id = old_cid;
  assert public.load_challenge(cid) is null, 'expired challenges are not shown';
  begin perform public.join_challenge(cid, p, 'Late', p); raise exception 'joined an expired challenge';
  exception when raise_exception then if sqlerrm <> 'challenge not found or expired' then raise; end if; end;
  perform public.ping();
  assert exists (select 1 from public.challenges where id = cid), 'kept until 7 days after expiry';
  assert not exists (select 1 from public.challenges where id = old_cid), 'deleted 7 days after expiry';

  perform public.claim_nickname('Pharm Fairy', p);
  update public.nickname_claims set last_seen = now() - interval '13 months' where nickname = 'Pharm Fairy';
  assert 'Pharm Fairy' not in (select public.taken_nicknames()), 'a name unused for a year is free';
  assert public.claim_nickname('Pharm Fairy', creator), 'and can be claimed by someone new';

  -- Nothing stored can be traced back: no lookup IDs or tickets, only hashes
  assert not exists (select 1 from public.vault where length(lookup_hash) <> 64), 'vault keys are hashes';
  raise notice 'ok 5 - expiry, clean-up and year-old nicknames';
end $$;
