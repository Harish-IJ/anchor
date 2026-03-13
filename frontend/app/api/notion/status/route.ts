import { successResponse } from "@/lib/api-utils";
import { isNotionConfigured } from "@/lib/notion";

/**
 * GET /api/notion/status
 * Check if Notion API is configured.
 */
export async function GET() {
  const configured = await isNotionConfigured();
  return successResponse({ configured });
}
