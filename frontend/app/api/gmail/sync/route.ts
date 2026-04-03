import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { syncGmailAccount, listGmailAccounts } from "@/lib/gmail";

/**
 * POST /api/gmail/sync
 * Sync emails from one or all connected Gmail accounts.
 * Body: { account_label?: string, max_results?: number }
 * - If account_label is omitted, syncs ALL connected accounts.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { account_label, max_results } = body;

    const maxResults = typeof max_results === "number" ? max_results : 50;

    if (account_label) {
      // Sync single account
      const result = await syncGmailAccount(account_label, maxResults);
      return successResponse({ account_label, ...result });
    }

    // Sync all accounts
    const accounts = await listGmailAccounts();
    if (!accounts || accounts.length === 0) {
      return errorResponse("No Gmail accounts connected. Visit /api/auth/gmail/connect?account=work first.", 400);
    }

    const results = [];
    for (const account of accounts) {
      const result = await syncGmailAccount(account.account_label, maxResults);
      results.push({ account_label: account.account_label, ...result });
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    return successResponse({ total_synced: totalSynced, total_skipped: totalSkipped, accounts: results });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Gmail sync failed"
    );
  }
}
