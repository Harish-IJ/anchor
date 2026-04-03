import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/calendar";

import { cookies } from "next/headers";

/**
 * GET /api/auth/google/callback?code=...
 *
 * Handles the OAuth2 callback from Google.
 * Exchanges the authorization code for tokens, stores them,
 * and redirects to a success page.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    // CSRF Protection
    const cookieStore = await cookies();
    const storedState = cookieStore.get("oauth_state")?.value;

    if (!storedState || state !== storedState) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF state token." },
        { status: 403 }
      );
    }
    
    // Clear the state cookie
    cookieStore.delete("oauth_state");

    if (error) {
      return NextResponse.json(
        { success: false, error: `Google auth denied: ${error}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Missing authorization code" },
        { status: 400 }
      );
    }

    await exchangeCodeForTokens(code);

    // Redirect to a simple success response (no frontend yet)
    return NextResponse.json({
      success: true,
      message: "Google Calendar connected successfully!",
    });
  } catch (err: unknown) {
    console.error("OAuth callback error:", err);
    // Sanitize upstream OAuth errors: do NOT reflect details back to the user
    return NextResponse.json(
      { success: false, error: "Failed to authenticate with Google. Please try again." }, 
      { status: 500 }
    );
  }
}
