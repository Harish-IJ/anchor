import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { syncCalendarToActivities, isGoogleConnected } from "@/lib/calendar";

/**
 * GET /api/calendar?start=ISO&end=ISO
 *
 * Fetch events from Google Calendar, sync them to activities,
 * and return the synced activities.
 */
export async function GET(request: NextRequest) {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return errorResponse(
        "Google Calendar not connected. Visit /api/auth/google to connect.",
        401
      );
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return errorResponse(
        "Missing required query parameters: start and end (ISO date strings)",
        400
      );
    }

    const activities = await syncCalendarToActivities(start, end);
    return successResponse({
      synced_count: activities.length,
      activities,
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to sync calendar events"
    );
  }
}
