import { supabase } from "@/lib/database";
import type { ExecutionLog, ExecutionStatus } from "@/lib/types";

/**
 * Create a new execution log entry.
 */
export async function createExecutionLog(
  activityId: string,
  date: string,
  status: ExecutionStatus,
  note?: string
) {
  const { data, error } = await supabase
    .from("execution_logs")
    .insert({ activity_id: activityId, date, status, note })
    .select()
    .single();

  if (error) throw error;
  return data as ExecutionLog;
}

/**
 * Get execution logs for a specific date.
 */
export async function getExecutionLogsByDate(date: string) {
  const { data, error } = await supabase
    .from("execution_logs")
    .select("*, activities(*)")
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}
