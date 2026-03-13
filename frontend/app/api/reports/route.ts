import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getWeeklyReport, getHabitReport } from "@/services/reportService";

/**
 * GET /api/reports?type=weekly&week_start=YYYY-MM-DD
 * GET /api/reports?type=habits&days=30
 *
 * Generate reports based on type.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return errorResponse('Missing required query parameter: type ("weekly" or "habits")', 400);
    }

    if (type === "weekly") {
      const weekStart = searchParams.get("week_start");
      if (!weekStart) {
        return errorResponse("Missing required query parameter: week_start (YYYY-MM-DD)", 400);
      }
      const report = await getWeeklyReport(weekStart);
      return successResponse(report);
    }

    if (type === "habits") {
      const daysParam = searchParams.get("days");
      const days = daysParam ? parseInt(daysParam, 10) : 30;
      const report = await getHabitReport(days);
      return successResponse(report);
    }

    return errorResponse('Invalid report type. Must be "weekly" or "habits"', 400);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to generate report"
    );
  }
}
