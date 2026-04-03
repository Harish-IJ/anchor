import { supabase } from "@/lib/database";

/**
 * Generate a weekly report: activity count, focus time, execution rates.
 */
export async function getWeeklyReport(weekStartDate: string) {
  const weekStart = new Date(`${weekStartDate}T00:00:00.000Z`);
  if (isNaN(weekStart.getTime())) {
    throw new Error("Invalid weekStartDate provided");
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const startISO = weekStart.toISOString();
  const endISO = weekEnd.toISOString();

  // Fetch activities in the week (column was renamed: start_time → scheduled_start)
  const { data: activities, error: actErr } = await supabase
    .from("activities")
    .select("*")
    .gte("scheduled_start", startISO)
    .lt("scheduled_start", endISO);

  if (actErr) throw actErr;

  // Fetch execution logs in the week
  const weekStartStr = weekStartDate;
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const { data: execLogs, error: execErr } = await supabase
    .from("execution_logs")
    .select("*")
    .gte("date", weekStartStr)
    .lt("date", weekEndStr);

  if (execErr) throw execErr;

  // Fetch focus sessions in the week
  const { data: focusSessions, error: focusErr } = await supabase
    .from("focus_sessions")
    .select("*")
    .gte("start_time", startISO)
    .lt("start_time", endISO)
    .not("duration_minutes", "is", null);

  if (focusErr) throw focusErr;

  // Calculate metrics
  const totalActivities = activities?.length ?? 0;
  const totalFocusMinutes =
    focusSessions?.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) ?? 0;

  const completed = execLogs?.filter((l) => l.status === "completed").length ?? 0;
  const partial = execLogs?.filter((l) => l.status === "partial").length ?? 0;
  const skipped = execLogs?.filter((l) => l.status === "skipped").length ?? 0;
  const totalLogged = completed + partial + skipped;
  const completionRate = totalLogged > 0 ? (completed / totalLogged) * 100 : 0;

  return {
    week_start: weekStartDate,
    week_end: weekEndStr,
    total_activities: totalActivities,
    total_focus_minutes: totalFocusMinutes,
    total_focus_hours: Math.round((totalFocusMinutes / 60) * 10) / 10,
    execution_summary: {
      completed,
      partial,
      skipped,
      total: totalLogged,
      completion_rate: Math.round(completionRate * 10) / 10,
    },
  };
}

/**
 * Generate a habit/routine adherence report.
 * Shows completion rates per routine over a given period.
 */
export async function getHabitReport(days: number = 30) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceISO = since.toISOString();

  // Fetch all routines
  const { data: routines, error: routErr } = await supabase
    .from("routine_definitions")
    .select("*");

  if (routErr) throw routErr;

  // Fetch routine runs in the period
  const { data: runs, error: runErr } = await supabase
    .from("routine_runs")
    .select("*")
    .gte("start_time", sinceISO);

  if (runErr) throw runErr;

  // Calculate per-routine metrics
  const routineStats = (routines ?? []).map((routine) => {
    const routineRuns = (runs ?? []).filter((r) => r.routine_id === routine.id);
    const avgCompletion =
      routineRuns.length > 0
        ? routineRuns.reduce((sum, r) => sum + Number(r.completion_percentage), 0) /
          routineRuns.length
        : 0;

    return {
      routine_id: routine.id,
      routine_name: routine.name,
      total_runs: routineRuns.length,
      average_completion: Math.round(avgCompletion * 10) / 10,
    };
  });

  return {
    period_days: days,
    since: sinceISO.split("T")[0],
    routines: routineStats,
  };
}
