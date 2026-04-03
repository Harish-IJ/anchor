import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { listEmailItems, updateEmailItem, deleteEmailItem, updateSyncQuery } from "@/lib/gmail";

/**
 * GET /api/gmail/items
 * List email items. Supports filtering.
 * Query params: account_label?, is_task?, source_app?, include_deleted?
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountLabel = searchParams.get("account_label") ?? undefined;
    const sourceApp = searchParams.get("source_app") ?? undefined;
    const isTaskParam = searchParams.get("is_task");
    const includeDeleted = searchParams.get("include_deleted") === "true";
    const limit = parseInt(searchParams.get("limit") ?? "100", 10);

    const isTask = isTaskParam === "true" ? true : isTaskParam === "false" ? false : undefined;

    const items = await listEmailItems({ accountLabel, isTask, sourceApp, includeDeleted, limit });
    return successResponse({ count: items?.length ?? 0, items: items ?? [] });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to fetch email items"
    );
  }
}

/**
 * PATCH /api/gmail/items
 * Update an email item or update the sync query for an account.
 * Body for item update: { id, is_task?, subject? }
 * Body for query update: { account_label, sync_query }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Updating sync query for an account
    if (body.sync_query !== undefined && body.account_label) {
      const account = await updateSyncQuery(body.account_label, body.sync_query);
      return successResponse({ updated: "sync_query", account });
    }

    // Updating an email item
    const { id, is_task, subject } = body;
    if (!id) {
      return errorResponse("Missing required field: id", 400);
    }

    const updates: { is_task?: boolean; subject?: string } = {};
    if (is_task !== undefined) updates.is_task = is_task;
    if (subject !== undefined) updates.subject = subject;

    if (Object.keys(updates).length === 0) {
      return errorResponse("No updatable fields provided (is_task, subject)", 400);
    }

    const item = await updateEmailItem(id, updates);
    return successResponse(item);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to update email item"
    );
  }
}

/**
 * DELETE /api/gmail/items
 * Soft-delete an email item.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return errorResponse("Missing required field: id", 400);
    }

    await deleteEmailItem(id);
    return successResponse({ deleted: true, id });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to delete email item"
    );
  }
}
