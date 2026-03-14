import { NextRequest } from "next/server";
import { supabase } from "@/lib/database";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Activity } from "@/lib/types";

/**
 * GET /api/activities
 * List all activities.
 * Optional query params: source, date, status
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source");
    const date = searchParams.get("date"); // YYYY-MM-DD
    const status = searchParams.get("status");

    let query = supabase
      .from("activities")
      .select("*")
      .order("scheduled_start", { ascending: true, nullsFirst: false });

    if (source) query = query.eq("source", source);
    if (status) query = query.eq("status", status);
    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString();
      const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString();
      query = query
        .gte("scheduled_start", startOfDay)
        .lte("scheduled_start", endOfDay);
    }

    const { data: activities, error } = await query;
    if (error) throw error;

    return successResponse<Activity[]>(activities);
  } catch (error: unknown) {
    console.error("Error fetching activities:", error);
    return errorResponse(error instanceof Error ? error.message : "Error fetching activities", 500);
  }
}

/**
 * POST /api/activities
 * Create a new standalone activity
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Require at least a title and source
    if (!body.title || !body.source) {
      return errorResponse("Missing required fields: title, source", 400);
    }

    const { data: activity, error } = await supabase
      .from("activities")
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return successResponse<Activity>(activity, 201);
  } catch (error: unknown) {
    console.error("Error creating activity:", error);
    return errorResponse(error instanceof Error ? error.message : "Error creating activity", 500);
  }
}
