import { supabase } from "@/lib/database";
import type { FocusSession } from "@/lib/types";

/**
 * Start a new focus (Pomodoro) session.
 * Timer runs client-side; backend only records the start.
 */
export async function startFocusSession(activityId?: string) {
  const { data, error } = await supabase
    .from("focus_sessions")
    .insert({
      activity_id: activityId || null,
      start_time: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as FocusSession;
}

/**
 * Stop an active focus session.
 * Calculates duration from start_time to now.
 */
export async function stopFocusSession(sessionId: string) {
  // Fetch the session to calculate duration
  const { data: session, error: fetchError } = await supabase
    .from("focus_sessions")
    .select("start_time")
    .eq("id", sessionId)
    .single();

  if (fetchError) throw fetchError;
  if (!session) throw new Error("Session not found");

  const startTime = new Date(session.start_time);
  const endTime = new Date();
  const durationMinutes = Math.round(
    (endTime.getTime() - startTime.getTime()) / 60000
  );

  const { data, error } = await supabase
    .from("focus_sessions")
    .update({
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as FocusSession;
}

/**
 * Get all focus sessions for a given activity.
 */
export async function getFocusSessionsByActivity(activityId: string) {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("*")
    .eq("activity_id", activityId)
    .order("start_time", { ascending: false });

  if (error) throw error;
  return data as FocusSession[];
}
