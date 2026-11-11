-- schema.sql – legt die Tabellen für "Unser Kalender" in Supabase an.
-- Einmal komplett im Supabase-Dashboard unter "SQL Editor" ausführen.
-- Darf auch nochmal ausgeführt werden: Vorhandenes bleibt erhalten.
--
-- Sicherheit: Der "anon"-Schlüssel steht öffentlich im Code. Deshalb schützt
-- Row Level Security (RLS) jede Tabelle. Lesen und schreiben darf nur, wer
-- angemeldet ist UND in der Tabelle "members" steht.

-- ---------- Mitglieder: wer den Kalender benutzen darf ----------
create table if not exists public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Prüft, ob die angemeldete Person Mitglied ist.
-- "security definer" = läuft mit Admin-Rechten, damit die Prüfung selbst nicht an RLS scheitert.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

-- ---------- Kategorien (geteilt) ----------
create table if not exists public.categories (
  id         text primary key,
  name       text not null check (char_length(name) between 1 and 30),
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

-- ---------- Termine (geteilt) ----------
-- Wiederkehrende Termine sind nur einmal gespeichert (repeat_until = letzter Tag der Serie).
create table if not exists public.events (
  id           text primary key,
  title        text not null check (char_length(title) between 1 and 100),
  category_id  text not null references public.categories (id) on delete restrict,
  date         date not null,
  all_day      boolean not null default true,
  start_time   time,
  end_time     time,
  repeat_until date check (repeat_until is null or repeat_until >= date),
  note         text not null default '' check (char_length(note) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time))
);

-- ---------- Gespeicherte Ansichten (pro Person, nicht geteilt) ----------
create table if not exists public.views (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 30),
  category_ids text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ---------- Zugriffsregeln ----------
alter table public.members    enable row level security;
alter table public.categories enable row level security;
alter table public.events     enable row level security;
alter table public.views      enable row level security;

drop policy if exists "eigene Mitgliedschaft sehen" on public.members;
create policy "eigene Mitgliedschaft sehen" on public.members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Mitglieder duerfen alles" on public.categories;
create policy "Mitglieder duerfen alles" on public.categories
  for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "Mitglieder duerfen alles" on public.events;
create policy "Mitglieder duerfen alles" on public.events
  for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "nur eigene Ansichten" on public.views;
create policy "nur eigene Ansichten" on public.views
  for all to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

-- Nicht angemeldete Besucher bekommen gar nichts, Angemeldete nur das Nötige.
revoke all on public.members, public.categories, public.events, public.views from anon;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.categories, public.events, public.views to authenticated;

-- ---------- Live-Updates ----------
-- Damit Änderungen der anderen Person sofort auf dem eigenen Handy erscheinen.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
end $$;

-- ---------- Start-Kategorien ----------
-- Gleiche ids wie in der alten, rein lokalen Version. Die Zeitabstände halten die Reihenfolge fest.
insert into public.categories (id, name, color, created_at) values
  ('uni',       'Uni',       '#3b82f6', now()),
  ('privat',    'Privat',    '#22c55e', now() + interval '1 second'),
  ('gemeinsam', 'Gemeinsam', '#a855f7', now() + interval '2 seconds')
on conflict (id) do nothing;
