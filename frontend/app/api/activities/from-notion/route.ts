import { NextRequest } from "next/server";
import { supabase } from "@/lib/database";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Activity } from "@/lib/types";

/**
 * POST /api/activities/from-notion
 * Converts a Notion item into an actionable Activity.
 * 
 * Body:
 * {
 *   "notion_item_id": "uuid",
 *   "scheduled_start": "2026-03-15T10:00:00Z", // optional
 *   "duration_minutes": 60                     // optional
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { notion_item_id, scheduled_start, duration_minutes } = body;

    if (!notion_item_id) {
      return errorResponse("Missing notion_item_id", 400);
    }

    // 1. Fetch the Notion item
    const { data: notionItem, error: notionError } = await supabase
      .from("notion_items")
      .select(`
        *,
        notion_sources ( workspace_name )
      `)
      .eq("id", notion_item_id)
      .single();

    if (notionError || !notionItem) {
      return errorResponse("Notion item not found", 404);
    }

    // 2. Create the Activity
    const activityData = {
      title: notionItem.title,
      description: `Imported from Notion`,
      source: "notion",
      external_id: notionItem.notion_page_id,
      source_account: notionItem.notion_sources?.workspace_name || null,
      source_url: notionItem.url,
      scheduled_start: scheduled_start || null,
      duration_minutes: duration_minutes || null,
      priority: notionItem.priority,
      metadata: {
        notion_properties: notionItem.properties_json // Embed all custom properties
      }
    };

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .insert([activityData])
      .select()
      .single();

    if (activityError) throw activityError;

    // 3. Create the ActivitySourceLink
    const { error: linkError } = await supabase
      .from("activity_sources")
      .insert([{
        activity_id: activity.id,
        source: "notion",
        external_id: notionItem.notion_page_id
      }]);
      
    if (linkError) {
      console.error("Warning: Failed to create activity_sources link", linkError);
    }

    return successResponse<Activity>(activity, "Created activity from Notion");
  } catch (error: unknown) {
    console.error("Error creating activity from notion:", error);
    return errorResponse(error instanceof Error ? error.message : "Error creating activity from notion", 500);
  }
}
