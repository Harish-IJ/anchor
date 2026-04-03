-- ============================================================
-- Upgrade Activities to Universal Event Container
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Rename time columns
ALTER TABLE activities RENAME COLUMN start_time TO scheduled_start;
ALTER TABLE activities RENAME COLUMN end_time TO scheduled_end;

-- 2. Make scheduled_start optional (for backlog tasks)
ALTER TABLE activities ALTER COLUMN scheduled_start DROP NOT NULL;

-- 3. Upgrade the source column (drop the rigid check constraint)
ALTER TABLE activities RENAME COLUMN external_source TO source;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_external_source_check;

-- 4. Add new core and metadata fields
ALTER TABLE activities 
  ADD COLUMN description TEXT,
  ADD COLUMN source_account TEXT,
  ADD COLUMN source_url TEXT,
  ADD COLUMN duration_minutes INTEGER,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN priority INTEGER,
  ADD COLUMN tags TEXT[],
  ADD COLUMN metadata JSONB,
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Create activity_sources linking table (Many-to-Many sources)
CREATE TABLE IF NOT EXISTS activity_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_account TEXT,
  external_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_account, external_id)
);

-- 6. Add performance indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_tags ON activities USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_activities_metadata ON activities USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_activity_sources_activity ON activity_sources(activity_id);

-- 7. Add updated_at trigger for activities
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_activities_modtime ON activities;

CREATE TRIGGER update_activities_modtime
BEFORE UPDATE ON activities
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
