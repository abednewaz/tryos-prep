-- TRYOS Prep: profiles, reviews, avatars, row level security.
-- Run once in the Supabase SQL editor. Do not put this file's comments into the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_len check (char_length(display_name) between 2 and 32),
  constraint display_name_chars check (display_name ~ '^[A-Za-z0-9_ ]+$')
);

create unique index if not exists profiles_display_name_lower
  on public.profiles (lower(display_name));

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  review_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_len check (char_length(review_text) between 1 and 500)
);

create index if not exists reviews_created_at on public.reviews (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.guard_review_edit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.updated_at > now() - interval '15 seconds'
     and new.review_text is distinct from old.review_text then
    raise exception 'slow_down';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch
  before update on public.reviews
  for each row execute function public.guard_review_edit();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  name text;
  n int := 0;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1));
  base := left(regexp_replace(base, '[^A-Za-z0-9_ ]', '', 'g'), 24);
  if base is null or char_length(base) < 2 then
    base := 'student';
  end if;
  name := base;
  while exists (select 1 from public.profiles where lower(display_name) = lower(name)) loop
    n := n + 1;
    name := left(base, 20) || n::text;
  end loop;
  insert into public.profiles (id, display_name) values (new.id, name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.reviews enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews
  for select using (true);

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews
  for delete using (auth.uid() = user_id);

-- Public review list. Returns a verified flag only. Does not return email.
create or replace function public.public_reviews(lim int, off int)
returns table (
  id uuid,
  user_id uuid,
  review_text text,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  avatar_path text,
  joined_at timestamptz,
  email_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.user_id, r.review_text, r.created_at, r.updated_at,
         p.display_name, p.avatar_path, p.created_at,
         (u.email_confirmed_at is not null)
  from public.reviews r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  order by r.created_at desc
  limit least(coalesce(lim, 6), 20)
  offset greatest(coalesce(off, 0), 0);
$$;

revoke all on function public.public_reviews(int, int) from public;
grant execute on function public.public_reviews(int, int) to anon, authenticated;

create or replace function public.public_profile(uid uuid)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  joined_at timestamptz,
  email_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_path, p.created_at,
         (u.email_confirmed_at is not null)
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = uid;
$$;

revoke all on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
