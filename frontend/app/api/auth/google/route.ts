import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/calendar";

/**
 * GET /api/auth/google
 *
 * Redirects the user to Google's OAuth2 consent screen.
 */
export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
