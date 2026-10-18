# Switching on leaderboards and friends (5 minutes)

Lingo Peak gives every player an anonymous account automatically (no email),
backs up their progress, and shows leaderboards: this week, learners of the
same language, all time, and friends. It uses the same free Supabase project
as before.

## 1. Allow anonymous accounts

Supabase → **Authentication** → **Sign In / Providers** (or **Settings**) →
turn on **Allow anonymous sign-ins** → **Save**.

## 2. Make the tables

Supabase → **SQL Editor** → **New query**. Paste all of this and tap **Run**
(on a phone, delete the stray `)` the editor sometimes adds at the end):

```sql
-- What other players see: name, character, badges and XP. Never an email.
create table public.lp_profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  name text not null check (char_length(name) between 3 and 16),
  look jsonb not null default '{}',
  badges text[] not null default '{}',
  learning text not null default 'es' check (char_length(learning) <= 5),
  xp int not null default 0,
  week text not null default '',
  week_xp int not null default 0,
  week_streak int not null default 0,
  words int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.lp_profiles enable row level security;
create policy "anyone signed in can see the leaderboard" on public.lp_profiles for select using (auth.uid() is not null);
create policy "add own profile" on public.lp_profiles for insert with check (auth.uid() = user_id);
create policy "update own profile" on public.lp_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index lp_profiles_week on public.lp_profiles (week, week_xp desc);
-- No two players can have the same username (ignoring capitals).
create unique index lp_profiles_name on public.lp_profiles (lower(name));

-- Lets the app check a username is free before you pick it.
create function public.lp_name_free(wanted text) returns boolean
language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.lp_profiles where lower(name) = lower(trim(wanted)) and user_id is distinct from auth.uid());
$$;
grant execute on function public.lp_name_free(text) to anon, authenticated;
create index lp_profiles_xp on public.lp_profiles (xp desc);

-- Each player's saved progress (only they can see it).
create table public.lp_progress (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.lp_progress enable row level security;
create policy "read own progress" on public.lp_progress for select using (auth.uid() = user_id);
create policy "add own progress" on public.lp_progress for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.lp_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Friends (both ways round).
create table public.lp_friends (
  user_id uuid references auth.users on delete cascade,
  friend_id uuid references auth.users on delete cascade,
  primary key (user_id, friend_id)
);
alter table public.lp_friends enable row level security;
create policy "read own friends" on public.lp_friends for select using (auth.uid() = user_id);

create function public.lp_add_friend(friend_code text) returns text
language plpgsql security definer set search_path = public as $$
declare f public.lp_profiles;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into f from public.lp_profiles where code = upper(trim(friend_code));
  if f.user_id is null then raise exception 'no such code'; end if;
  if f.user_id = auth.uid() then raise exception 'that is your own code'; end if;
  insert into public.lp_friends values (auth.uid(), f.user_id), (f.user_id, auth.uid()) on conflict do nothing;
  return f.name;
end $$;

create function public.lp_remove_friend(friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.lp_friends
  where (user_id = auth.uid() and friend_id = friend) or (user_id = friend and friend_id = auth.uid());
$$;
```

It should say **Success. No rows returned.** That's it — open the app's
**Ranks** tab.

## Good to know

- Anonymous accounts live on the phone. When email sign-in is added later,
  players will be able to attach an email so their account moves with them.
- To remove a player: **Authentication → Users** → ⋯ → **Delete user**.
