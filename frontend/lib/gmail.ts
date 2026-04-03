import { google } from "googleapis";
import { supabase } from "@/lib/database";
import { encryptToken, decryptToken } from "@/lib/crypto";

// Known sender → source_app mapping for auto-tagging
const SOURCE_APP_MAP: Record<string, string> = {
  "hubspot.com": "hubspot",
  "notifications@hubspot.com": "hubspot",
  "github.com": "github",
  "no-reply@github.com": "github",
  "jira": "jira",
  "atlassian.com": "jira",
  "notion.so": "notion",
  "linear.app": "linear",
  "asana.com": "asana",
  "slack.com": "slack",
};

// Keywords in subject that suggest actionable/task email
const TASK_KEYWORDS = [
  "assigned to you",
  "action required",
  "action needed",
  "due",
  "deadline",
  "please review",
  "follow up",
  "task",
  "todo",
  "to-do",
  "reminder",
  "urgent",
  "asap",
];

const GMAIL_REDIRECT_URI =
  process.env.GMAIL_REDIRECT_URI ?? "http://localhost:3000/api/auth/gmail/callback";

// ─── OAuth ───────────────────────────────────────────────────

export function createGmailOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
}

/**
 * Generate Gmail OAuth consent URL for a specific account label.
 * State encodes the account label so callback knows which account it's for.
 */
export function getGmailAuthUrl(accountLabel: string) {
  const oauth2Client = createGmailOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.labels",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "select_account consent", // Force account picker + consent always
    include_granted_scopes: false,    // Don't merge with previously granted scopes
    state: accountLabel,
  });
}

/**
 * Exchange code for tokens and store/update the gmail_accounts row.
 */
export async function exchangeGmailCode(code: string, accountLabel: string) {
  const oauth2Client = createGmailOAuth2Client();
  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: GMAIL_REDIRECT_URI });

  oauth2Client.setCredentials(tokens);

  // Get the email address for this account
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();
  const emailAddress = userInfo.email ?? null;

  // Upsert the account row
  const { data, error } = await supabase
    .from("gmail_accounts")
    .upsert(
      {
        account_label: accountLabel,
        email_address: emailAddress,
        access_token: encryptToken(tokens.access_token!),
        refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_label" }
    )
    .select()
    .single();

  if (error) throw error;
  return { account: data, emailAddress };
}

/**
 * Get an authenticated Gmail OAuth2 client for a given account label.
 * Auto-refreshes tokens and persists them.
 */
export async function getGmailClient(accountLabel: string) {
  const { data: account, error } = await supabase
    .from("gmail_accounts")
    .select("*")
    .eq("account_label", accountLabel)
    .single();

  if (error || !account) {
    throw new Error(`Gmail account "${accountLabel}" not connected.`);
  }

  const oauth2Client = createGmailOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decryptToken(account.access_token),
    refresh_token: account.refresh_token ? decryptToken(account.refresh_token) : undefined,
    expiry_date: account.token_expiry
      ? new Date(account.token_expiry).getTime()
      : undefined,
  });

  // Persist refreshed tokens automatically
  oauth2Client.on("tokens", async (newTokens) => {
    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (newTokens.access_token) {
      updateData.access_token = encryptToken(newTokens.access_token);
    }
    if (newTokens.refresh_token) {
      updateData.refresh_token = encryptToken(newTokens.refresh_token);
    }
    if (newTokens.expiry_date) {
      updateData.token_expiry = new Date(newTokens.expiry_date).toISOString();
    }
    await supabase
      .from("gmail_accounts")
      .update(updateData)
      .eq("account_label", accountLabel);
  });

  return { oauth2Client, account };
}

/**
 * List all connected Gmail accounts (without exposing tokens).
 */
export async function listGmailAccounts() {
  const { data, error } = await supabase
    .from("gmail_accounts")
    .select("id, account_label, email_address, sync_query, last_synced_at, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// ─── Parsing Helpers ─────────────────────────────────────────

/**
 * Detect source app from sender email/domain.
 */
function detectSourceApp(sender: string): string {
  const lowerSender = sender.toLowerCase();
  for (const [key, app] of Object.entries(SOURCE_APP_MAP)) {
    if (lowerSender.includes(key)) return app;
  }
  return "other";
}

/**
 * Auto-detect if email is likely a task/action item.
 */
function detectIsTask(subject: string, snippet: string): boolean {
  const combined = `${subject} ${snippet}`.toLowerCase();
  return TASK_KEYWORDS.some((kw) => combined.includes(kw));
}

/**
 * Parse sender name and email from "Name <email>" format.
 */
function parseSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw, email: raw };
}

/**
 * Extract plain text from email body parts (handles multipart).
 */
function extractBodyText(payload: Record<string, unknown>): string | null {
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

  const findText = (parts: Part[]): string | null => {
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8").slice(0, 1000);
      }
      if (part.parts) {
        const found = findText(part.parts);
        if (found) return found;
      }
    }
    return null;
  };

  const p = payload as Part;
  if (p.mimeType === "text/plain" && p.body?.data) {
    return Buffer.from(p.body.data, "base64").toString("utf-8").slice(0, 1000);
  }
  if (p.parts) return findText(p.parts);
  return null;
}

// ─── Sync ────────────────────────────────────────────────────

/**
 * Sync emails for a specific Gmail account.
 * Uses the stored sync_query for filtering.
 */
export async function syncGmailAccount(accountLabel: string, maxResults = 50) {
  const { oauth2Client, account } = await getGmailClient(accountLabel);

  if (account.last_synced_at) {
    if (Date.now() - new Date(account.last_synced_at).getTime() < 30000) {
      throw new Error("Rate limit exceeded. Minimum 30 seconds between Gmail syncs.");
    }
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // List messages matching the sync query
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: account.sync_query || "is:unread",
    maxResults,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return { synced: 0, skipped: 0, items: [] };

  // Batch dedup: fetch all known message IDs in one query
  const incomingIds = messages.map((m) => m.id!).filter(Boolean);
  const { data: existingRows } = await supabase
    .from("email_items")
    .select("gmail_message_id")
    .in("gmail_message_id", incomingIds);

  const existingIds = new Set((existingRows ?? []).map((r) => r.gmail_message_id));
  const newMessages = messages.filter((m) => m.id && !existingIds.has(m.id));
  const skipped = messages.length - newMessages.length;

  // Fetch full content only for new messages
  const insertPayload: Record<string, unknown>[] = [];

  for (const msg of newMessages) {
    if (!msg.id) continue;

    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const message = msgRes.data;
    const headers = message.payload?.headers ?? [];

    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    const subject = getHeader("Subject") || "(no subject)";
    const rawSender = getHeader("From");
    const { name: senderName, email: senderEmail } = parseSender(rawSender);
    const dateStr = getHeader("Date");
    const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
    const snippet = message.snippet ?? null;
    const threadId = message.threadId ?? null;
    const gmailLabels = message.labelIds ?? [];

    const bodyText = message.payload
      ? extractBodyText(message.payload as Record<string, unknown>)
      : null;

    const sourceApp = detectSourceApp(senderEmail || rawSender);
    const isTask = detectIsTask(subject, snippet ?? "");

    insertPayload.push({
      account_id: account.id,
      account_label: accountLabel,
      gmail_message_id: msg.id,
      thread_id: threadId,
      subject,
      sender: senderName || rawSender,
      sender_email: senderEmail ?? null,
      received_at: receivedAt,
      snippet,
      body_text: bodyText,
      gmail_labels: gmailLabels,
      source_app: sourceApp,
      is_task: isTask,
    });
  }

  // Batch insert all new emails in one query
  let synced: unknown[] = [];
  if (insertPayload.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("email_items")
      .insert(insertPayload)
      .select();

    if (insertError) throw insertError;
    synced = inserted ?? [];
  }

  // Update last_synced_at
  await supabase
    .from("gmail_accounts")
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("account_label", accountLabel);

  return { synced: synced.length, skipped, items: synced };
}

/**
 * Update an email item (e.g. mark as task, update subject).
 */
export async function updateEmailItem(
  itemId: string,
  updates: { is_task?: boolean; subject?: string }
) {
  const { data, error } = await supabase
    .from("email_items")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft-delete an email item.
 */
export async function deleteEmailItem(itemId: string) {
  const { error } = await supabase
    .from("email_items")
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) throw error;
}

/**
 * List email items — unified view across all accounts.
 */
export async function listEmailItems(opts: {
  accountLabel?: string;
  isTask?: boolean;
  sourceApp?: string;
  includeDeleted?: boolean;
  limit?: number;
}) {
  let query = supabase
    .from("email_items")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.accountLabel) query = query.eq("account_label", opts.accountLabel);
  if (opts.isTask !== undefined) query = query.eq("is_task", opts.isTask);
  if (opts.sourceApp) query = query.eq("source_app", opts.sourceApp);
  if (!opts.includeDeleted) query = query.eq("is_deleted", false);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Update sync query for a Gmail account.
 */
export async function updateSyncQuery(accountLabel: string, syncQuery: string) {
  const { data, error } = await supabase
    .from("gmail_accounts")
    .update({ sync_query: syncQuery, updated_at: new Date().toISOString() })
    .eq("account_label", accountLabel)
    .select("id, account_label, email_address, sync_query, last_synced_at")
    .single();

  if (error) throw error;
  return data;
}
