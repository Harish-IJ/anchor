import { supabase } from "@/lib/database";
import { encryptToken, decryptToken } from "@/lib/crypto";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * Make an authenticated request to the Notion API.
 * Uses the provided apiKey, or falls back to the env var.
 */
async function notionFetch(
  endpoint: string,
  options: RequestInit = {},
  apiKey?: string
) {
  const key = apiKey || process.env.NOTION_API_KEY;
  if (!key) throw new Error("No Notion API key provided");

  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Notion API error: ${response.status}`);
  }
  return data;
}

/**
 * Check if Notion is configured (env var or any sources with API keys).
 */
export async function isNotionConfigured(): Promise<boolean> {
  if (process.env.NOTION_API_KEY) return true;

  const { data } = await supabase
    .from("notion_sources")
    .select("id")
    .not("api_key", "is", null)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

// ─── Source Management ───────────────────────────────────────

/**
 * List all registered Notion sources.
 * Excludes api_key from response for security.
 */
export async function listSources() {
  const { data, error } = await supabase
    .from("notion_sources")
    .select("id, database_id, name, filter, sorts, sync_enabled, last_synced_at, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Register a new Notion database source.
 */
export async function createSource(
  databaseId: string,
  name: string,
  apiKey?: string,
  filter?: Record<string, unknown>,
  sorts?: Record<string, unknown>[]
) {
  const key = apiKey || process.env.NOTION_API_KEY;
  if (!key) throw new Error("No API key provided and NOTION_API_KEY env var not set");

  // Verify the database is accessible
  try {
    await notionFetch(`/databases/${databaseId}`, {}, key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Cannot access Notion database: ${message}. Make sure it's shared with the integration.`);
  }

  const { data, error } = await supabase
    .from("notion_sources")
    .insert({
      database_id: databaseId,
      name,
      api_key: encryptToken(key),
      filter: filter || null,
      sorts: sorts || null,
    })
    .select("id, database_id, name, filter, sorts, sync_enabled, last_synced_at, created_at")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a source and all its items.
 */
export async function deleteSource(sourceId: string) {
  const { error } = await supabase
    .from("notion_sources")
    .delete()
    .eq("id", sourceId);

  if (error) throw error;
}

// ─── Sync ────────────────────────────────────────────────────

/**
 * Extract a readable title from a Notion page's properties.
 */
function extractTitle(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const prop = value as Record<string, unknown>;
    if (prop.type === "title") {
      const titleArr = prop.title as Array<{ plain_text: string }>;
      if (titleArr && titleArr.length > 0) {
        return titleArr.map((t) => t.plain_text).join("");
      }
    }
  }
  return "Untitled";
}

/**
 * Sync items from a single Notion source.
 * Handles pagination automatically.
 */
export async function syncSource(sourceId: string) {
  // Get source config
  const { data: source, error: srcErr } = await supabase
    .from("notion_sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (srcErr || !source) throw new Error("Source not found");

  // Rate Limiting: Minimum 60 seconds between syncs
  if (source.last_synced_at) {
    const lastSync = new Date(source.last_synced_at).getTime();
    if (Date.now() - lastSync < 60000) {
      throw new Error("Rate limit exceeded. Minimum 60 seconds between Notion syncs for this source.");
    }
  }

  const allPages: Array<Record<string, unknown>> = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  // Paginate through all results
  while (hasMore) {
    const body: Record<string, unknown> = {
      page_size: 100,
    };

    if (source.filter) body.filter = source.filter;
    if (source.sorts) body.sorts = source.sorts;
    if (startCursor) body.start_cursor = startCursor;

    const response = await notionFetch(
      `/databases/${source.database_id}/query`,
      { method: "POST", body: JSON.stringify(body) },
      decryptToken(source.api_key)
    );

    allPages.push(...(response.results as Array<Record<string, unknown>>));
    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  // Batch upsert all pages in a single query (replaces N+1 loop)
  const now = new Date().toISOString();
  const upsertPayload = [];

  for (const page of allPages) {
    try {
      const pageId = page.id as string;
      const properties = page.properties as Record<string, unknown>;
      const url = (page.url as string) || null;
      const title = extractTitle(properties);

      upsertPayload.push({
        source_id: sourceId,
        notion_page_id: pageId,
        title,
        properties,
        notion_url: url,
        is_deleted: false, // un-delete if re-synced
        last_synced_at: now,
        updated_at: now,
      });
    } catch (e) {
      console.error(`Skipping malformed Notion page ${page.id}:`, e);
    }
  }

  const { data: syncedItems, error: upsertError } = await supabase
    .from("notion_items")
    .upsert(upsertPayload, {
      onConflict: "notion_page_id",
      ignoreDuplicates: false, // merge/update on conflict
    })
    .select();

  if (upsertError) throw upsertError;

  // Update source last_synced_at
  await supabase
    .from("notion_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", sourceId);

  return syncedItems;
}

/**
 * Sync all enabled sources.
 */
export async function syncAllSources() {
  const { data: sources, error } = await supabase
    .from("notion_sources")
    .select("id")
    .eq("sync_enabled", true);

  if (error) throw error;

  const results = [];
  for (const source of sources || []) {
    try {
      const items = await syncSource(source.id);
      results.push({ source_id: source.id, synced_count: items.length });
    } catch (e: unknown) {
      console.error(`Failed to sync source ${source.id}:`, e);
      results.push({ source_id: source.id, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }
  return results;
}

// ─── Item CRUD ───────────────────────────────────────────────

/**
 * List items, optionally filtered by source.
 */
export async function listItems(sourceId?: string, includeDeleted = false) {
  let query = supabase
    .from("notion_items")
    .select("*, notion_sources(name, database_id)")
    .order("updated_at", { ascending: false });

  if (sourceId) query = query.eq("source_id", sourceId);
  if (!includeDeleted) query = query.eq("is_deleted", false);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Update a Notion item's properties.
 * Pushes the change back to Notion, then updates local copy.
 */
export async function updateItem(
  itemId: string,
  propertyUpdates: Record<string, unknown>
) {
  // Get the item and its source's API key
  const { data: item, error: fetchErr } = await supabase
    .from("notion_items")
    .select("notion_page_id, properties, source_id, notion_sources(api_key)")
    .eq("id", itemId)
    .single();

  if (fetchErr || !item) throw new Error("Item not found");

  const sourceApiKey = (item.notion_sources as unknown as { api_key: string })?.api_key;

  // Push update to Notion
  try {
    await notionFetch(
      `/pages/${item.notion_page_id}`,
      { method: "PATCH", body: JSON.stringify({ properties: propertyUpdates }) },
      decryptToken(sourceApiKey)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to update in Notion: ${message}`);
  }

  // Merge property updates into local copy
  const mergedProperties = { ...item.properties, ...propertyUpdates };

  const { data, error } = await supabase
    .from("notion_items")
    .update({
      properties: mergedProperties,
      title: extractTitle(mergedProperties as Record<string, unknown>),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft-delete an item. Optionally archive in Notion too.
 */
export async function deleteItem(itemId: string, archiveInNotion = false) {
  if (archiveInNotion) {
    // Get the item and its source's API key
    const { data: item, error: fetchErr } = await supabase
      .from("notion_items")
      .select("notion_page_id, source_id, notion_sources(api_key)")
      .eq("id", itemId)
      .single();

    if (fetchErr || !item) throw new Error("Item not found");

    const sourceApiKey = (item.notion_sources as unknown as { api_key: string })?.api_key;

    // Archive the page in Notion (moves to trash)
    await notionFetch(
      `/pages/${item.notion_page_id}`,
      { method: "PATCH", body: JSON.stringify({ archived: true }) },
      decryptToken(sourceApiKey)
    );
  }

  const { error } = await supabase
    .from("notion_items")
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) throw error;
}
