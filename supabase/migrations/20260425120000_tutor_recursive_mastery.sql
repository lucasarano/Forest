-- Recursive Mastery Graph tutor: clean slate.
-- Drops legacy MVP tables, introduces a single tutor_sessions row per student run
-- with the entire runtime state serialized as JSONB.

-- 1. Drop legacy session-related tables (keep courses/homeworks/concepts).
drop table if exists public.mvp_v2_survey_responses cascade;
drop table if exists public.mvp_v2_evaluation_scores cascade;
drop table if exists public.mvp_v2_evaluation_answers cascade;
drop table if exists public.mvp_v2_evidence_records cascade;
drop table if exists public.mvp_v2_messages cascade;
drop table if exists public.mvp_v2_events cascade;
drop table if exists public.mvp_v2_graph_nodes cascade;
drop table if exists public.mvp_v2_sessions cascade;
drop table if exists public.mvp_sessions cascade;
drop table if exists public.mvp_messages cascade;
drop table if exists public.mvp_events cascade;

-- 2. Trim concepts to the fields the new system actually needs.
alter table public.concepts drop column if exists planner_graph;
alter table public.concepts drop column if exists evaluation_bundle;
alter table public.concepts drop column if exists graph_model;

-- 3. Fresh tutor session table. The full runtime state lives in the JSONB column.
create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  student_name text not null default '',
  session_token_hash text not null unique,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  turn_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index tutor_sessions_concept_idx on public.tutor_sessions (concept_id);
create index tutor_sessions_updated_idx on public.tutor_sessions (updated_at desc);

alter table public.tutor_sessions enable row level security;

drop policy if exists "service role full access tutor_sessions" on public.tutor_sessions;
create policy "service role full access tutor_sessions"
  on public.tutor_sessions
  for all
  to service_role
  using (true)
  with check (true);

-- 4. Minimal telemetry table for research-grade event logging.
create table public.tutor_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tutor_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tutor_events_session_idx on public.tutor_events (session_id, created_at);

alter table public.tutor_events enable row level security;

drop policy if exists "service role full access tutor_events" on public.tutor_events;
create policy "service role full access tutor_events"
  on public.tutor_events
  for all
  to service_role
  using (true)
  with check (true);
