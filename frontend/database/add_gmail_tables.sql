-- ============================================================
-- Gmail Multi-Account Integration Tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- gmail_accounts: one row per connected Gmail account
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_label TEXT NOT NULL UNIQUE,          -- 'work' | 'personal' | user-defined
  email_address TEXT,                          -- populated after first sync
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  -- filter query stored per-account (Gmail search syntax)
  sync_query TEXT DEFAULT 'is:unread',         -- e.g. 'from:hubspot.com OR label:Tasks'
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- email_items: synced emails treated as tasks/signals
CREATE TABLE IF NOT EXISTS email_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  account_label TEXT NOT NULL,                 -- denormalized for easy querying
  gmail_message_id TEXT NOT NULL UNIQUE,       -- deduplication key
  thread_id TEXT,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_email TEXT,                           -- parsed email address only
  received_at TIMESTAMPTZ NOT NULL,
  snippet TEXT,                                -- Gmail auto-generated 150-char preview
  body_text TEXT,                              -- plain text body if parseable
  gmail_labels TEXT[],                         -- Gmail label names on the message
  source_app TEXT,                             -- 'hubspot' | 'github' | 'jira' | 'other'
  is_task BOOLEAN DEFAULT false,               -- user or auto marked as actionable
  is_deleted BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_email_items_account ON email_items(account_id);
CREATE INDEX IF NOT EXISTS idx_email_items_received ON email_items(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_items_source_app ON email_items(source_app);
CREATE INDEX IF NOT EXISTS idx_email_items_is_task ON email_items(is_task) WHERE is_task = true;
CREATE INDEX IF NOT EXISTS idx_email_items_message_id ON email_items(gmail_message_id);
