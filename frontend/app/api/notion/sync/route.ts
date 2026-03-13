import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { syncSource, syncAllSources } from "@/lib/notion";

/**
 * POST /api/notion/sync
 * Sync items from Notion.
 * Body: { source_id? } — if omitted, syncs all enabled sources.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { source_id } = body as { source_id?: string };

    if (source_id) {
      const items = await syncSource(source_id);
      return successResponse({
        source_id,
        synced_count: items.length,
        items,
      });
    } else {
      const results = await syncAllSources();
      return successResponse({
        sources_synced: results.length,
        results,
      });
    }
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to sync from Notion"
    );
  }
}
