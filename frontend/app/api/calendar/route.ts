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

    const validateISODateStrict = (str: string) => {
      const isoRegex = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
      const match = str.match(isoRegex);
      if (!match) return false;
      const [, yr, mo, da] = match;
      const parsed = new Date(str);
      if (isNaN(parsed.getTime())) return false;
      
      if (str.endsWith("Z")) {
        if (parsed.getUTCFullYear() !== parseInt(yr, 10) || 
            parsed.getUTCMonth() + 1 !== parseInt(mo, 10) || 
            parsed.getUTCDate() !== parseInt(da, 10)) {
          return false;
        }
      }
      return true;
    };

    if (!validateISODateStrict(start) || !validateISODateStrict(end)) {
      return errorResponse("Invalid date format. Must be strictly valid ISO 8601 (RFC3339).", 400);
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate > endDate) {
      return errorResponse("Start date must be before end date", 400);
    }

    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
    if (daysDiff > 31) {
      return errorResponse("Sync date range cannot exceed 31 days to prevent memory issues", 400);
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
