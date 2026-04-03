import { NextResponse } from "next/server";
import { supabase } from "@/lib/database";

/**
 * GET /api/health
 *
 * Health check endpoint. Verifies the API is running
 * and the database connection is alive.
 */
export async function GET() {
  try {
    // Simple query to verify Supabase connectivity
    const { error } = await supabase.from("activities").select("id").limit(1);

    const dbStatus = error ? "disconnected" : "connected";

    return NextResponse.json({
      status: "ok",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      ...(error && { dbError: error.message }),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}
