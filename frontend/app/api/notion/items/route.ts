import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { listItems, updateItem, deleteItem } from "@/lib/notion";

/**
 * GET /api/notion/items?source_id=<optional>&include_deleted=<optional>
 * List synced Notion items.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("source_id") || undefined;
    const includeDeleted = searchParams.get("include_deleted") === "true";

    const items = await listItems(sourceId, includeDeleted);
    return successResponse(items);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to list items"
    );
  }
}

/**
 * PATCH /api/notion/items
 * Update a Notion item (syncs back to Notion).
 * Body: { id, properties: { ... } }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, properties } = body;

    if (!id || !properties) {
      return errorResponse("Missing required fields: id, properties", 400);
    }

    const item = await updateItem(id, properties);
    return successResponse(item);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to update item"
    );
  }
}

/**
 * DELETE /api/notion/items
 * Soft-delete a Notion item. Optionally archive in Notion.
 * Body: { id, archive_in_notion? }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, archive_in_notion } = body;

    if (!id) {
      return errorResponse("Missing required field: id", 400);
    }

    await deleteItem(id, archive_in_notion === true);
    return successResponse({
      deleted: true,
      archived_in_notion: archive_in_notion === true,
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to delete item"
    );
  }
}
