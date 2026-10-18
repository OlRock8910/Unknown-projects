# Turning on sign-in (about 10 minutes)

Sign-in lets players type their email, get a 6-digit code, and have their XP,
stars, best scores and learned words saved to their account, so it follows
them to any phone. It is optional: until it's set up, the app works exactly as
before and the sign-in card doesn't appear.

It runs on a free [Supabase](https://supabase.com) project.

## 1. Make the project

1. Go to **supabase.com** → **Start your project** → **Continue with Google**.
2. **New project**. Name it `adjetivos`, make up a database password (you
   won't need it again), pick the region nearest you, **Create new project**.
3. Wait a minute while it sets up.

## 2. Make the table that holds the saves

Left menu → **SQL Editor** → **New query**. Paste all of this and tap **Run**:

```sql
-- One saved-progress row per account.
create table public.progress (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Everyone can only ever read or write their own row.
alter table public.progress enable row level security;

create policy "read own progress" on public.progress
  for select using (auth.uid() = user_id);
create policy "add own progress" on public.progress
  for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

It should say **Success. No rows returned.**

## 3. Make the email show the code

Supabase's emails send a link by default; the app needs the code instead.

Left menu → **Authentication** → **Emails** (or **Email Templates**). Change
**both** the **Confirm signup** and the **Magic Link** templates:

- **Subject:** `Your Adjetivos code`
- **Body:** replace everything with

```html
<h2>Your Adjetivos code</h2>
<p>Type this code into the app:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>If you didn't ask for it, you can ignore this email.</p>
```

Save each one.

## 4. Send Claude two values

Left menu → **Project Settings** (⚙️) → **API** (or **Data API** / **API Keys**):

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long text starting `eyJ…`

Both are designed to be inside apps, so they're fine to share. (Never share
the **service_role** key.) They go into `web/js/config.js`, and the app is
rebuilt with sign-in switched on.

## Good to know

- **Email limits.** Supabase's built-in email sends only a few codes an hour
  for the whole app — fine for you and some friends. For more, plug in a free
  email service under **Authentication → SMTP Settings** (for example Resend
  or Brevo).
- **Privacy.** With sign-in on, the app stores each player's email address and
  game progress in your Supabase project. Nothing else, and only if they choose
  to sign in.
- **Deleting someone's account:** **Authentication → Users** → ⋯ → **Delete
  user**. Their saved progress is deleted with it.
