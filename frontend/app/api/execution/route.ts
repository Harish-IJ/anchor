import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import {
  createExecutionLog,
  getExecutionLogsByDate,
} from "@/services/executionService";

/**
 * POST /api/execution
 *
 * Record an execution log for an activity.
 * Body: { activity_id, date, status, note? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { activity_id, date, status, note } = body;

    if (!activity_id || !date || !status) {
      return errorResponse("Missing required fields: activity_id, date, status", 400);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return errorResponse("Invalid format for date. Must be YYYY-MM-DD and represent a valid date.", 400);
    }

    if (!["completed", "partial", "skipped"].includes(status)) {
      return errorResponse("Invalid status. Must be: completed, partial, or skipped", 400);
    }

    const log = await createExecutionLog(activity_id, date, status, note);
    return successResponse(log, 201);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to create execution log"
    );
  }
}

/**
 * GET /api/execution?date=YYYY-MM-DD
 *
 * Get execution logs for a specific date.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return errorResponse("Missing required query parameter: date", 400);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return errorResponse("Invalid format for date. Must be YYYY-MM-DD and represent a valid date.", 400);
    }

    const logs = await getExecutionLogsByDate(date);
    return successResponse(logs);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to fetch execution logs"
    );
  }
}
