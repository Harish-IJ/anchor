/**
 * Shared TypeScript types for the Personal Time Observatory.
 */

// ─── Activity ────────────────────────────────────────────────

export interface Activity {
  id: string;
  title: string;
  description: string | null;
  source: string;              // e.g. 'google_calendar', 'notion', 'gmail', 'manual'
  external_id: string | null;
  source_account: string | null;
  source_url: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_minutes: number | null;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  category: string | null;
  priority: number | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ActivitySourceLink {
  id: string;
  activity_id: string;
  source: string;
  external_id: string;
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
