import { NextRequest, NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const account = searchParams.get("account");
  const debug = searchParams.get("debug") === "true";

  if (!account) {
    return NextResponse.json(
      { success: false, error: "Missing required query param: account (e.g. ?account=work)" },
      { status: 400 }
    );
  }

  const url = getGmailAuthUrl(account);

  // Debug mode: return the URL instead of redirecting so we can inspect it
  if (debug) {
    return NextResponse.json({ success: true, auth_url: url });
  }

  return NextResponse.redirect(url);
}
