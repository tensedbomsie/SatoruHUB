-- Run once in the Supabase SQL Editor for the SatoruHUB project
-- (kufihbkjowmxivemmpds.supabase.co) — same project as the AI chat function.
--
-- Fixed set of 4 daily quests (defined in code, not DB) — this table only
-- tracks completions per day, per owner. "Reset every 24h" needs no cron:
-- a new day naturally starts unchecked because no row exists for that date yet.

create table if not exists daily_quest_completions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  quest_key text not null check (quest_key in ('work', 'body', 'creative', 'rest')),
  completed_date date not null,
  created_at timestamptz not null default now(),
  unique (owner, quest_key, completed_date)
);

create index if not exists daily_quest_completions_owner_date_idx
  on daily_quest_completions (owner, completed_date);

alter table daily_quest_completions enable row level security;

drop policy if exists "own daily quest completions" on daily_quest_completions;
create policy "own daily quest completions" on daily_quest_completions
  for all using (owner = auth.uid()) with check (owner = auth.uid());
