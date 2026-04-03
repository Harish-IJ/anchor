-- ============================================================
-- Upgrade Activities to Universal Event Container
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Rename time columns
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='start_time') AND
     NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='scheduled_start') THEN
      ALTER TABLE activities RENAME COLUMN start_time TO scheduled_start;
  END IF;
  
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='end_time') AND
     NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='scheduled_end') THEN
      ALTER TABLE activities RENAME COLUMN end_time TO scheduled_end;
  END IF;
END $$;

-- 2. Make scheduled_start optional (for backlog tasks)
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='scheduled_start') THEN
    ALTER TABLE activities ALTER COLUMN scheduled_start DROP NOT NULL;
  END IF;
END $$;

-- 3. Upgrade the source column (drop the rigid check constraint)
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='external_source') AND
     NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='source') THEN
      ALTER TABLE activities RENAME COLUMN external_source TO source;
  END IF;
END $$;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_external_source_check;

-- 4. Add new core and metadata fields
ALTER TABLE activities 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS source_account TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority INTEGER,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_sources_unique_null_account ON activity_sources (source, external_id) WHERE source_account IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_scheduled_start ON activities(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_activities_source_external ON activity_sources(source, external_id);

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
