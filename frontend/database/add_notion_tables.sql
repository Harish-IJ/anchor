-- ============================================================
-- Notion Integration tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- Notion Sources: registered databases to sync from
CREATE TABLE IF NOT EXISTS notion_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  filter JSONB,
  sorts JSONB,
  sync_enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notion Items: synced items with full properties
CREATE TABLE IF NOT EXISTS notion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES notion_sources(id) ON DELETE CASCADE,
  notion_page_id TEXT NOT NULL UNIQUE,
  title TEXT,
  properties JSONB NOT NULL,
  notion_url TEXT,
  is_deleted BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notion_items_source ON notion_items(source_id);
CREATE INDEX IF NOT EXISTS idx_notion_items_page_id ON notion_items(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_notion_items_deleted ON notion_items(is_deleted);
CREATE INDEX IF NOT EXISTS idx_notion_sources_database ON notion_sources(database_id);
