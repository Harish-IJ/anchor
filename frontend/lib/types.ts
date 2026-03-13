/**
 * Shared TypeScript types for the Personal Time Observatory.
 */

// ─── Activity ────────────────────────────────────────────────

export type ExternalSource = "google_calendar" | "notion" | "manual" | "email";

export interface Activity {
  id: string;
  external_source: ExternalSource;
  external_id: string | null;
  title: string;
  start_time: string;
  end_time: string | null;
  category: string | null;
  created_at: string;
}

// ─── Execution Log ───────────────────────────────────────────

export type ExecutionStatus = "completed" | "partial" | "skipped";

export interface ExecutionLog {
  id: string;
  activity_id: string;
  date: string;
  status: ExecutionStatus;
  note: string | null;
  created_at: string;
}

// ─── Focus Session ───────────────────────────────────────────

export interface FocusSession {
  id: string;
  activity_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  created_at: string;
}

// ─── Routine ─────────────────────────────────────────────────

export interface RoutineDefinition {
  id: string;
  name: string;
  total_duration: number; // seconds
  created_at: string;
}

export interface RoutineStep {
  id: string;
  routine_id: string;
  name: string;
  duration_seconds: number;
  order_index: number;
}

export interface RoutineRun {
  id: string;
  routine_id: string;
  start_time: string;
  end_time: string | null;
  completion_percentage: number;
  created_at: string;
}

// ─── API Response ────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
