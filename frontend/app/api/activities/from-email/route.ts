import { NextRequest } from "next/server";
import { supabase } from "@/lib/database";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { Activity } from "@/lib/types";

/**
 * POST /api/activities/from-email
 * Converts an Email item into an actionable Activity.
 * 
 * Body:
 * {
 *   "email_item_id": "uuid",
 *   "scheduled_start": "2026-03-15T10:00:00Z", // optional
 *   "duration_minutes": 15                     // optional (emails default to 15m usually)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email_item_id, scheduled_start, duration_minutes } = body;

    if (!email_item_id) {
      return errorResponse("Missing email_item_id", 400);
    }

    // 1. Fetch the Email item
    const { data: emailItem, error: emailError } = await supabase
      .from("email_items")
      .select("*")
      .eq("id", email_item_id)
      .single();

    if (emailError || !emailItem) {
      return errorResponse("Email item not found", 404);
    }

    // 2. Guard: check if this email is already an activity
    const { data: existingLink } = await supabase
      .from("activity_sources")
      .select("activity_id")
      .eq("source", "gmail")
      .eq("external_id", emailItem.gmail_message_id)
      .maybeSingle();

    if (existingLink) {
      return errorResponse(
        `This email is already linked to activity ${existingLink.activity_id}`,
        409
      );
    }

    // 3. Create the Activity
    const activityData = {
      title: emailItem.subject,
      description: emailItem.snippet,
      source: "gmail",
      external_id: emailItem.gmail_message_id,
      source_account: emailItem.account_label,
      source_url: `https://mail.google.com/mail/u/${emailItem.account_label}/#all/${emailItem.thread_id}`,
      scheduled_start: scheduled_start || null,
      duration_minutes: duration_minutes || 15,
      metadata: {
        sender: emailItem.sender,
        labels: emailItem.gmail_labels,
        received_at: emailItem.received_at
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
        source: "gmail",
        external_id: emailItem.gmail_message_id
      }]);
      
    if (linkError) {
      console.error("Failed to create activity_sources link. Rolling back activity.", linkError);
      try {
        const { error: rollError } = await supabase.from("activities").delete().eq("id", activity.id);
        if (rollError) {
          console.error(`Rollback delete failed for activity ${activity.id}:`, rollError);
          return errorResponse(`Link creation failed: ${linkError.message}. Rollback also failed: ${rollError.message}`, 500);
        }
      } catch (e: unknown) {
        console.error(`Exception during rollback of activity ${activity.id}:`, e);
      }
      return errorResponse("Failed to link email to activity. Creation rolled back.", 500);
    }

    return successResponse<Activity>(activity, 201);
  } catch (error: unknown) {
    console.error("Error creating activity from email:", error);
    return errorResponse(error instanceof Error ? error.message : "Error creating activity from email", 500);
  }
}
