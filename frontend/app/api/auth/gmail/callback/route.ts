import { NextRequest, NextResponse } from "next/server";
import { exchangeGmailCode } from "@/lib/gmail";

/**
 * GET /api/auth/gmail/callback?code=...&state=<accountLabel>
 */
export async function GET(request: NextRequest) {
  console.log("Gmail callback full URL:", request.url);
  console.log("Gmail callback nextUrl:", request.nextUrl.toString());

  const searchParams = request.nextUrl.searchParams;

  // Log all params for debugging
  const allParams: Record<string, string> = {};
  searchParams.forEach((value, key) => { allParams[key] = value; });
  console.log("Gmail callback params:", allParams);

  const code = searchParams.get("code");
  const accountLabel = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json({ success: false, error: `Google OAuth error: ${error}` }, { status: 400 });
  }

  if (!code || !accountLabel) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing code or state (account label) from OAuth callback",
        debug: { received_params: allParams, has_code: !!code, has_state: !!accountLabel },
      },
      { status: 400 }
    );
  }

  try {
    const { account, emailAddress } = await exchangeGmailCode(code, accountLabel);
    return NextResponse.json({
      success: true,
      message: `Gmail (${accountLabel}) connected successfully!`,
      data: { account_label: account.account_label, email_address: emailAddress },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to exchange Gmail tokens" },
      { status: 500 }
    );
  }
}
