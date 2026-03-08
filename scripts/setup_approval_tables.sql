-- Approval workflow: table requests and created tables.
-- Run once (e.g. Supabase SQL Editor) or rely on app startup to create these.

CREATE SCHEMA IF NOT EXISTS datatools;

-- Requests for table creation (PROD goes here first; DEV/UAT can be recorded too)
CREATE TABLE IF NOT EXISTS datatools.table_requests (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  sql_statement TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  submitted_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT
);

-- Tables that were actually created (direct DEV/UAT or after PROD approval)
CREATE TABLE IF NOT EXISTS datatools.created_tables (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  sql_statement TEXT NOT NULL,
  environment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  creation_source TEXT NOT NULL
);

-- Optional: ensure uat schema exists for direct UAT creates
CREATE SCHEMA IF NOT EXISTS uat;
