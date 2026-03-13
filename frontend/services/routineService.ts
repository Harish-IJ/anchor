import { supabase } from "@/lib/database";
import type { RoutineDefinition, RoutineStep, RoutineRun } from "@/lib/types";

/**
 * Get all routine definitions with their steps.
 */
export async function getRoutines() {
  const { data, error } = await supabase
    .from("routine_definitions")
    .select("*, routine_steps(*)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Create a new routine with steps.
 */
export async function createRoutine(
  name: string,
  steps: { name: string; duration_seconds: number; order_index: number }[]
) {
  const totalDuration = steps.reduce((sum, s) => sum + s.duration_seconds, 0);

  const { data: routine, error: routErr } = await supabase
    .from("routine_definitions")
    .insert({ name, total_duration: totalDuration })
    .select()
    .single();

  if (routErr) throw routErr;

  const stepsWithRoutineId = steps.map((step) => ({
    ...step,
    routine_id: (routine as RoutineDefinition).id,
  }));

  const { error: stepsErr } = await supabase
    .from("routine_steps")
    .insert(stepsWithRoutineId);

  if (stepsErr) throw stepsErr;

  return routine as RoutineDefinition;
}

/**
 * Start a routine run.
 */
export async function startRoutineRun(routineId: string) {
  const { data, error } = await supabase
    .from("routine_runs")
    .insert({
      routine_id: routineId,
      start_time: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as RoutineRun;
}

/**
 * Mark a step as complete and update run completion percentage.
 */
export async function completeRoutineStep(
  runId: string,
  routineId: string,
  completedStepIndex: number
) {
  // Get total steps for this routine
  const { data: steps, error: stepsErr } = await supabase
    .from("routine_steps")
    .select("*")
    .eq("routine_id", routineId)
    .order("order_index", { ascending: true });

  if (stepsErr) throw stepsErr;

  const totalSteps = (steps as RoutineStep[]).length;
  const completionPercentage =
    totalSteps > 0 ? ((completedStepIndex + 1) / totalSteps) * 100 : 0;

  const isComplete = completedStepIndex + 1 >= totalSteps;

  const updateData: Record<string, unknown> = {
    completion_percentage: Math.round(completionPercentage * 100) / 100,
  };

  if (isComplete) {
    updateData.end_time = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("routine_runs")
    .update(updateData)
    .eq("id", runId)
    .select()
    .single();

  if (error) throw error;
  return data as RoutineRun;
}
