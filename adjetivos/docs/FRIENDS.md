# Turning on friends and the leaderboard (2 minutes)

Friends and the leaderboard use the same Supabase project as sign-in
([SIGN-IN.md](SIGN-IN.md)). They need two more tables. Until they exist, the
Friends tab says "Friends aren't switched on yet" and everything else works.

Supabase → left menu → **SQL Editor** → **New query**. Paste all of this and
tap **Run**:

```sql
-- Each signed-in player's public card: name, climber, height and XP.
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  name text not null default 'Climber' check (char_length(name) <= 20),
  climber text not null default '🧗' check (char_length(climber) <= 16),
  height int not null default 0,
  xp int not null default 0,
  week text not null default '',
  week_xp int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "add own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "update own profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Who is friends with whom (both ways round).
create table public.friends (
  user_id uuid references auth.users on delete cascade,
  friend_id uuid references auth.users on delete cascade,
  primary key (user_id, friend_id)
);
alter table public.friends enable row level security;
create policy "read own friends" on public.friends for select using (auth.uid() = user_id);

-- Add a friend by their 6-letter code. Returns their name.
create function public.add_friend(friend_code text) returns text
language plpgsql security definer set search_path = public as $$
declare f public.profiles;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into f from public.profiles where code = upper(trim(friend_code));
  if f.user_id is null then raise exception 'no such code'; end if;
  if f.user_id = auth.uid() then raise exception 'that is your own code'; end if;
  insert into public.friends values (auth.uid(), f.user_id), (f.user_id, auth.uid()) on conflict do nothing;
  return f.name;
end $$;

-- Stop being friends.
create function public.remove_friend(friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friends
  where (user_id = auth.uid() and friend_id = friend) or (user_id = friend and friend_id = auth.uid());
$$;

-- You and your friends, for the leaderboard. Nobody else is ever shown.
create function public.friends_leaderboard(this_week text)
returns table (user_id uuid, name text, climber text, height int, xp int, week_xp int, me boolean)
language sql security definer set search_path = public stable as $$
  select p.user_id, p.name, p.climber, p.height, p.xp,
         case when p.week = this_week then p.week_xp else 0 end,
         p.user_id = auth.uid()
  from public.profiles p
  where p.user_id = auth.uid()
     or p.user_id in (select f.friend_id from public.friends f where f.user_id = auth.uid());
$$;
```

It should say **Success. No rows returned.** (On a phone, if the editor adds a
stray `)` at the end, delete it before tapping Run.)

## What other players can see

Only your friends — people who typed your code, or whose code you typed — see
your name, climber, height and XP. Your email is never shown to anyone.
Removing a friend removes you from each other's leaderboards.
