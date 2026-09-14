-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste this → Run)

create table expenses (
  id bigint generated always as identity primary key,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  note text default '',
  -- "holder" is used for Loan entries: the name of the friend the money
  -- was loaned to or borrowed from. Left null for regular expenses.
  holder text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security. No policies are added because this app's
-- server talks to Supabase using the service_role key, which bypasses
-- RLS by design. This keeps the table locked down against any other
-- (e.g. anon/browser) access.
alter table expenses enable row level security;

-- ---------------------------------------------------------------------
-- MIGRATION: if you already created the `expenses` table before adding
-- loan support, run just this one line instead of the CREATE TABLE above:
--
--   alter table expenses add column if not exists holder text;
-- ---------------------------------------------------------------------
