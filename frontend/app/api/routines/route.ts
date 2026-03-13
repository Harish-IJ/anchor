import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import {
  getRoutines,
  createRoutine,
  startRoutineRun,
  completeRoutineStep,
} from "@/services/routineService";

/**
 * GET /api/routines
 *
 * Get all routine definitions with their steps.
 */
export async function GET() {
  try {
    const routines = await getRoutines();
    return successResponse(routines);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to fetch routines"
    );
  }
}

/**
 * POST /api/routines
 *
 * Perform routine actions based on the "action" field.
 *
 * action: "create"
 *   Body: { action: "create", name, steps: [{ name, duration_seconds, order_index }] }
 *
 * action: "start"
 *   Body: { action: "start", routine_id }
 *
 * action: "step-complete"
 *   Body: { action: "step-complete", run_id, routine_id, completed_step_index }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return errorResponse(
        'Missing required field: action ("create", "start", or "step-complete")',
        400
      );
    }

    if (action === "create") {
      const { name, steps } = body;
      if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
        return errorResponse("Missing required fields: name, steps (non-empty array)", 400);
      }
      const routine = await createRoutine(name, steps);
      return successResponse(routine, 201);
    }

    if (action === "start") {
      const { routine_id } = body;
      if (!routine_id) {
        return errorResponse("Missing required field: routine_id", 400);
      }
      const run = await startRoutineRun(routine_id);
      return successResponse(run, 201);
    }

    if (action === "step-complete") {
      const { run_id, routine_id, completed_step_index } = body;
      if (run_id === undefined || routine_id === undefined || completed_step_index === undefined) {
        return errorResponse(
          "Missing required fields: run_id, routine_id, completed_step_index",
          400
        );
      }
      const run = await completeRoutineStep(run_id, routine_id, completed_step_index);
      return successResponse(run);
    }

    return errorResponse('Invalid action. Must be "create", "start", or "step-complete"', 400);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to process routine action"
    );
  }
}
