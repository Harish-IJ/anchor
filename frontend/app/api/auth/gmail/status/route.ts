import { successResponse, errorResponse } from "@/lib/api-utils";
import { listGmailAccounts } from "@/lib/gmail";

/**
 * GET /api/auth/gmail/status
 * Lists all connected Gmail accounts (no tokens exposed).
 */
export async function GET() {
  try {
    const accounts = await listGmailAccounts();
    return successResponse({
      connected_count: accounts?.length ?? 0,
      accounts: accounts ?? [],
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to fetch Gmail accounts"
    );
  }
}
