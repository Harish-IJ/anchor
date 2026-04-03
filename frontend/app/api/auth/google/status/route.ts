import { NextResponse } from "next/server";
import { isGoogleConnected } from "@/lib/calendar";

/**
 * GET /api/auth/google/status
 *
 * Check whether Google Calendar is connected.
 */
export async function GET() {
  try {
    const connected = await isGoogleConnected();
    return NextResponse.json({ connected });
  } catch (err) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : "Failed to check status",
      },
      { status: 500 }
    );
  }
}
