import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import {
  startFocusSession,
  stopFocusSession,
  getFocusSessionsByActivity,
} from "@/services/focusService";

/**
 * POST /api/focus
 *
 * Start or stop a focus session.
 * Body: { action: "start" | "stop", activity_id?, session_id? }
 *
 * - action "start": starts a new session (optionally linked to activity_id)
 * - action "stop": stops a session (requires session_id)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, activity_id, session_id } = body;

    if (!action) {
      return errorResponse('Missing required field: action ("start" or "stop")', 400);
    }

    if (action === "start") {
      const session = await startFocusSession(activity_id);
      return successResponse(session, 201);
    }

    if (action === "stop") {
      if (!session_id) {
        return errorResponse("Missing required field: session_id (for stop action)", 400);
      }
      try {
        const session = await stopFocusSession(session_id);
        return successResponse(session);
      } catch (stopErr) {
        const msg = stopErr instanceof Error ? stopErr.message : String(stopErr);
        // Supabase returns a 406/400 when .single() finds 0 rows
        const isNotFound = msg.includes("0 rows") || msg.includes("PGRST116") || msg.includes("JSON object requested");
        return errorResponse(
          isNotFound
            ? `Focus session not found: ${session_id}`
            : `Failed to stop session: ${msg}`,
          isNotFound ? 404 : 500
        );
      }
    }

    return errorResponse('Invalid action. Must be "start" or "stop"', 400);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to process focus session"
    );
  }
}

/**
 * GET /api/focus?activity_id=<uuid>
 *
 * Get all focus sessions for an activity.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("activity_id");

    if (!activityId) {
      return errorResponse("Missing required query parameter: activity_id", 400);
    }

    const sessions = await getFocusSessionsByActivity(activityId);
    return successResponse(sessions);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to fetch focus sessions"
    );
  }
}
