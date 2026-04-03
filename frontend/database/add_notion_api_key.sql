-- ============================================================
-- Add api_key column to notion_sources for multi-workspace support
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE notion_sources
ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Migrate existing sources to use the current env key
-- (you can update this manually in Supabase if needed)
