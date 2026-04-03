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
        notion_sources ( name )
      `)
      .eq("id", notion_item_id)
      .single();

    if (notionError || !notionItem) {
      return errorResponse("Notion item not found", 404);
    }

    // 2. Guard: check if this Notion page is already an activity
    const { data: existingLink } = await supabase
      .from("activity_sources")
      .select("activity_id")
      .eq("source", "notion")
      .eq("external_id", notionItem.notion_page_id)
      .maybeSingle();

    if (existingLink) {
      return errorResponse(
        `This Notion item is already linked to activity ${existingLink.activity_id}`,
        409
      );
    }

    // 3. Create the Activity
    const activityData = {
      title: notionItem.title,
      description: `Imported from Notion`,
      source: "notion",
      external_id: notionItem.notion_page_id,
      source_account: notionItem.notion_sources?.name || null,
      source_url: notionItem.notion_url,
      scheduled_start: scheduled_start || null,
      duration_minutes: duration_minutes || null,
      priority: null, 
      metadata: {
        notion_properties: notionItem.properties 
      }
    };

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .insert([activityData])
      .select()
      .single();

    if (activityError) throw activityError;

    // 4. Create the ActivitySourceLink
    const { error: linkError } = await supabase
      .from("activity_sources")
      .insert([{
        activity_id: activity.id,
        source: "notion",
        external_id: notionItem.notion_page_id
      }]);
      
    if (linkError) {
      console.error("Failed to create activity_sources link. Rolling back activity.", linkError);
      await supabase.from("activities").delete().eq("id", activity.id);
      return errorResponse("Failed to link notion item to activity. Creation rolled back.", 500);
    }

    return successResponse<Activity>(activity, 201);
  } catch (error: unknown) {
    console.error("Error creating activity from notion:", error);
    return errorResponse(error instanceof Error ? error.message : "Error creating activity from notion", 500);
  }
}
