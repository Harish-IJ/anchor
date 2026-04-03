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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return errorResponse("Invalid date format. Must be YYYY-MM-DD", 400);
      }
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const nextDay = new Date(startOfDay);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      
      query = query
        .gte("scheduled_start", startOfDay.toISOString())
        .lt("scheduled_start", nextDay.toISOString());
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

    // Explicitly allow-list fields to prevent mass assignment
    // (e.g. overriding id, local_override, created_at)
    const allowedData = {
      title: body.title,
      description: body.description,
      source: body.source,
      source_account: body.source_account,
      source_url: body.source_url,
      external_id: body.external_id,
      scheduled_start: body.scheduled_start,
      scheduled_end: body.scheduled_end,
      duration_minutes: body.duration_minutes,
      category: body.category,
      status: body.status,
      metadata: body.metadata,
      local_override: true // Manually created via POST, so it overrides defaults
    };

    const { data: activity, error } = await supabase
      .from("activities")
      .insert([allowedData])
      .select()
      .single();

    if (error) throw error;

    return successResponse<Activity>(activity, 201);
  } catch (error: unknown) {
    console.error("Error creating activity:", error);
    return errorResponse(error instanceof Error ? error.message : "Error creating activity", 500);
  }
}
