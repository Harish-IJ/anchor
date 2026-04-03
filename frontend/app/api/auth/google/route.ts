import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/calendar";

/**
 * GET /api/auth/google
 *
 * Redirects the user to Google's OAuth2 consent screen.
 */
export async function GET() {
  try {
    const state = crypto.randomUUID();
    
    // Store CSRF state in HttpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    });

    const url = getAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}
