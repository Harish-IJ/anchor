import { supabase } from "@/lib/database";
import { successResponse, errorResponse } from "@/lib/api-utils";

/**
 * GET /api/focus/active
 *
 * Returns the currently open focus session (end_time IS NULL), if any.
 * Returns null in the data field if no session is active.
 *
 * Used by the frontend timer UI to restore state on page refresh.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("focus_sessions")
      .select("*")
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    // data = session object if active, null if nothing is running
    return successResponse(data);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to check active focus session"
    );
  }
}
