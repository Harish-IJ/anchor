-- ============================================================
-- Security & Data Integrity Layer
-- ============================================================

-- 1. External Source Deduplication
-- Ensures that no two activities can have the same external_id for a given source
-- Note: column was renamed from external_source → source in upgrade_activities.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_external_unique 
ON activities (source, external_id)
WHERE external_id IS NOT NULL;

-- 2. Activity Override Protection
-- Prevents bulk syncs from overwriting user-edited fields
ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS local_override BOOLEAN DEFAULT false;

-- 3. Database Update Tracking
-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at columns (activities already has it from upgrade_activities.sql)
ALTER TABLE execution_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE notion_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE email_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Create Triggers (activities already has one from upgrade_activities.sql)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_execution_logs_updated_at') THEN
        CREATE TRIGGER trg_execution_logs_updated_at
        BEFORE UPDATE ON execution_logs
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_focus_sessions_updated_at') THEN
        CREATE TRIGGER trg_focus_sessions_updated_at
        BEFORE UPDATE ON focus_sessions
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notion_items_updated_at') THEN
        CREATE TRIGGER trg_notion_items_updated_at
        BEFORE UPDATE ON notion_items
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_email_items_updated_at') THEN
        CREATE TRIGGER trg_email_items_updated_at
        BEFORE UPDATE ON email_items
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;
END $$;
