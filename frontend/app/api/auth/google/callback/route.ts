import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/calendar";

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
    const errorDetails: Record<string, unknown> = {
      success: false,
      error: err instanceof Error ? err.message : "Failed to exchange tokens",
    };

    // Surface Google API error details
    if (err && typeof err === "object" && "response" in err) {
      const gErr = err as { response?: { data?: unknown; status?: number } };
      errorDetails.google_error = gErr.response?.data;
      errorDetails.status_code = gErr.response?.status;
    }

    console.error("OAuth callback error:", err);

    return NextResponse.json(errorDetails, { status: 500 });
  }
}
