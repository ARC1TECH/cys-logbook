-- =============================================
-- Cy's Logbook — Supabase schema
-- =============================================
-- Paste this into the SQL Editor in your Supabase project and click "Run".
-- This creates all the tables Cy's Logbook uses, plus seed data for the
-- starting state we already built together.
-- =============================================

-- NPCs in Cy's orbit
create table if not exists npcs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null check (tag in ('avoid','owe','owed','ally','cold','complicated','dead')),
  detail text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Open story threads
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null check (status in ('open','hot','cold','closed')),
  detail text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Faction standings
create table if not exists factions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lean int default 50 check (lean >= 0 and lean <= 100),
  note text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Quick session log entries (one-line notes)
create table if not exists log_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date default current_date,
  text text not null,
  created_at timestamptz default now()
);

-- Full session recaps (longer narrative summaries)
create table if not exists recaps (
  id uuid primary key default gen_random_uuid(),
  session_number int,
  session_date date default current_date,
  raw_notes text,
  recap_text text not null,
  highlights text,
  created_at timestamptz default now()
);

-- Generic key-value store for character sheet data, settings, etc.
-- Lets us add features without schema migrations.
create table if not exists character_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Rate limiting log (tracks API calls per IP for spam/loop protection)
create table if not exists rate_limit_log (
  id bigserial primary key,
  key text not null,
  created_at timestamptz default now()
);
create index if not exists idx_rate_limit_key_created on rate_limit_log(key, created_at);

-- API usage tracker (cost monitoring, daily ceiling enforcement)
create table if not exists api_usage (
  id bigserial primary key,
  kind text not null,
  input_tokens int default 0,
  output_tokens int default 0,
  cache_write_tokens int default 0,
  cache_read_tokens int default 0,
  cost_usd numeric(10, 6) default 0,
  usage_date date default current_date,
  created_at timestamptz default now()
);
create index if not exists idx_api_usage_date on api_usage(usage_date);

-- =============================================
-- Auto-update the "updated_at" column when rows change
-- =============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_npcs_updated on npcs;
create trigger trg_npcs_updated before update on npcs
  for each row execute function update_updated_at();

drop trigger if exists trg_threads_updated on threads;
create trigger trg_threads_updated before update on threads
  for each row execute function update_updated_at();

drop trigger if exists trg_factions_updated on factions;
create trigger trg_factions_updated before update on factions
  for each row execute function update_updated_at();

drop trigger if exists trg_chardata_updated on character_data;
create trigger trg_chardata_updated before update on character_data
  for each row execute function update_updated_at();

-- =============================================
-- Row Level Security (RLS)
-- =============================================
-- Since this is a personal app for one user, we'll allow full access
-- with the anon key. If you ever want to share with friends or add
-- other characters, we'd add proper auth here.
alter table npcs enable row level security;
alter table threads enable row level security;
alter table factions enable row level security;
alter table log_entries enable row level security;
alter table recaps enable row level security;
alter table character_data enable row level security;
alter table rate_limit_log enable row level security;
alter table api_usage enable row level security;

-- Allow all operations for anyone with the anon key (single-user setup)
create policy "Allow all on npcs" on npcs for all using (true) with check (true);
create policy "Allow all on threads" on threads for all using (true) with check (true);
create policy "Allow all on factions" on factions for all using (true) with check (true);
create policy "Allow all on log_entries" on log_entries for all using (true) with check (true);
create policy "Allow all on recaps" on recaps for all using (true) with check (true);
create policy "Allow all on character_data" on character_data for all using (true) with check (true);
create policy "Allow all on rate_limit_log" on rate_limit_log for all using (true) with check (true);
create policy "Allow all on api_usage" on api_usage for all using (true) with check (true);

-- =============================================
-- Seed data — Cy's starting state
-- =============================================

insert into npcs (name, tag, detail, sort_order) values
  ('Douglas Barker', 'dead', 'First mate. Best friend. Business partner. Lost ten years ago in fog, reaching for a drifting survivor. Body never found. Cy carries his absence the way a ship carries ballast — and his compass in his pocket.', 1),
  ('Eda Oweland', 'complicated', 'Council leader of Saltmarsh. Once — for several years, before her rise — something quiet between them. It faded as her influence grew. They drifted. Neither of them speaks of it.', 2),
  ('Anders Solmor', 'ally', 'Head of the Solmor fleet. Still throws Cy work when he can. Cy is quietly loyal to him. The kind of loyalty that doesn''t get spoken aloud but shows up when needed.', 3),
  ('Hanna Rist', 'ally', 'Runs The Snapping Line. Keeps Cy on as bouncer despite his surly temperament. Values his steady presence. Trouble usually ends quickly when Cy steps in.', 4),
  ('The Snapping Line', 'cold', 'Not a person — but it functions like one. The dockside tavern where Cy works nights. He knows its regulars, its drafts, its sticking door. It''s where stories find him.', 5)
on conflict do nothing;

insert into threads (title, status, detail, sort_order) values
  ('The Rowboat at the Dock', 'cold', 'She''s still seaworthy. He maintains her out of habit, he tells himself. Hasn''t taken her past the breakwater for anything but Solmor work in a long while.', 1),
  ('The Fog Before the Wreck', 'cold', 'Twenty years ago, sailors told stories of a strange vessel and unnatural fog before the first galley went down. Inconsistent. Dismissed. Then ten years ago, the same fog took Barker. He has never put the two together. He should.', 2),
  ('The Dreams of Distant Oars', 'open', 'Fog-bound waters. Oars in still seas. Barker at the edge, never close enough to speak. He calls it guilt. He may be wrong.', 3),
  ('Eda''s Door', 'cold', 'Years of silence between them. She runs the Council. He works security at a dockside tavern. The distance has its own shape now.', 4),
  ('The Solmor Question', 'open', 'Anders is good to Cy. But the Solmors lean toward the Crown — not where Cy''s instincts go. The day will come when those loyalties pull in opposite directions.', 5),
  ('Barker''s Compass', 'cold', 'He''s carried it ten years. It always seems to know when bad weather is coming. He''s never tested this. He should.', 6),
  ('The Chart Case', 'cold', 'Twenty years of his own coastal notes. Including the night of the first wreck. Including everything that didn''t add up. He hasn''t opened the older pages in a long time.', 7)
on conflict do nothing;

insert into factions (name, lean, note, sort_order) values
  ('Traditionalists', 75, 'Old families, working sailors, fishermen. Keep the town small, the Crown out, the docks ours. Cy''s natural home.', 1),
  ('Loyalists', 20, 'Closer ties to the Crown of Keoland. The Solmors lean here — which complicates Cy''s quiet loyalty to Anders.', 2),
  ('Dwellers in the Deep', 30, 'The newer faction. Sea-tied. Strange in places. The sea took Barker — Cy''s relationship with the sea is not simple.', 3),
  ('Council of Saltmarsh', 50, 'The town''s governing body. Eda Oweland leads it. Cy respects the office. The person is harder.', 4)
on conflict do nothing;

-- Done!
-- =============================================
