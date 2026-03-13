-- ============================================================
-- Personal Time Observatory — Database Schema
-- ============================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Activities: any time-bound activity from any source
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_source TEXT NOT NULL CHECK (external_source IN ('google_calendar', 'notion', 'manual', 'email')),
  external_id TEXT,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Execution Logs: records whether planned blocks were executed
CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'skipped')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Focus Sessions: Pomodoro sessions
CREATE TABLE IF NOT EXISTS focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Routine Definitions: structured routines
CREATE TABLE IF NOT EXISTS routine_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_duration INTEGER NOT NULL, -- total duration in seconds
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Routine Steps: individual timed steps within a routine
CREATE TABLE IF NOT EXISTS routine_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routine_definitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  order_index INTEGER NOT NULL
);

-- Routine Runs: records each run of a routine
CREATE TABLE IF NOT EXISTS routine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routine_definitions(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  completion_percentage NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities(start_time);
CREATE INDEX IF NOT EXISTS idx_activities_external_source ON activities(external_source);
CREATE INDEX IF NOT EXISTS idx_activities_external_id ON activities(external_source, external_id);

CREATE INDEX IF NOT EXISTS idx_execution_logs_date ON execution_logs(date);
CREATE INDEX IF NOT EXISTS idx_execution_logs_activity ON execution_logs(activity_id);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_activity ON focus_sessions(activity_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_start ON focus_sessions(start_time);

CREATE INDEX IF NOT EXISTS idx_routine_steps_routine ON routine_steps(routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_runs_routine ON routine_runs(routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_runs_start ON routine_runs(start_time);
