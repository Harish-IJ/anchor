import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { listSources, createSource, deleteSource } from "@/lib/notion";

/**
 * GET /api/notion/sources
 * List all registered Notion database sources.
 */
export async function GET() {
  try {
    const sources = await listSources();
    return successResponse(sources);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to list sources"
    );
  }
}

/**
 * POST /api/notion/sources
 * Register a new Notion database.
 * Body: { database_id, name, api_key?, filter?, sorts? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { database_id, name, api_key, filter, sorts } = body;

    if (!database_id || !name) {
      return errorResponse("Missing required fields: database_id, name", 400);
    }

    const source = await createSource(database_id, name, api_key, filter, sorts);
    return successResponse(source, 201);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to create source"
    );
  }
}

/**
 * DELETE /api/notion/sources
 * Remove a source and all its items.
 * Body: { source_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return errorResponse("Missing required field: source_id", 400);
    }

    await deleteSource(source_id);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to delete source"
    );
  }
}
