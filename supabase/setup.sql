-- SkillTrack database setup. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1) One table holds everything (roadmaps, topics, notes, file info) as JSON, per user.
create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coll text not null check (coll in ('roadmaps', 'skills', 'notes', 'files')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);

-- 2) Each signed-in user can only see and change their own rows.
alter table public.docs enable row level security;
drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Live updates (so changes Claude makes appear instantly in the app).
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 4) Private storage for attached files, one folder per user.
insert into storage.buckets (id, name, public) values ('files', 'files', false)
on conflict (id) do nothing;

drop policy if exists "own files read" on storage.objects;
drop policy if exists "own files write" on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
