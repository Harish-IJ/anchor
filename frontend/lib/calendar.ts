import { google } from "googleapis";
import { supabase } from "@/lib/database";
import type { Activity } from "@/lib/types";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

/**
 * Create a configured OAuth2 client.
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL.
 */
export function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

/**
 * Exchange authorization code for tokens and store them.
 */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client();

  console.log("Exchanging code for tokens...");
  console.log("Redirect URI:", process.env.GOOGLE_REDIRECT_URI);

  const { tokens } = await oauth2Client.getToken({
    code,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
  });

  console.log("Tokens received:", {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiryDate: tokens.expiry_date,
  });

  // Upsert tokens — single user, so delete existing and insert new
  await supabase.from("oauth_tokens").delete().eq("provider", "google");

  const { error } = await supabase.from("oauth_tokens").insert({
    provider: "google",
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token || null,
    token_expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  });

  if (error) throw error;
  return tokens;
}

/**
 * Get an authenticated OAuth2 client with stored tokens.
 * Handles token refresh automatically.
 */
export async function getAuthenticatedClient() {
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("*")
    .eq("provider", "google")
    .single();

  if (error || !data) {
    throw new Error("Google account not connected. Visit /api/auth/google to connect.");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.token_expiry ? new Date(data.token_expiry).getTime() : undefined,
  });

  // Listen for token refresh events and update DB
  oauth2Client.on("tokens", async (newTokens) => {
    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (newTokens.access_token) {
      updateData.access_token = newTokens.access_token;
    }
    if (newTokens.expiry_date) {
      updateData.token_expiry = new Date(newTokens.expiry_date).toISOString();
    }
    await supabase
      .from("oauth_tokens")
      .update(updateData)
      .eq("id", data.id);
  });

  return oauth2Client;
}

/**
 * Check if Google is connected (tokens exist).
 */
export async function isGoogleConnected() {
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("id")
    .eq("provider", "google")
    .single();

  return !error && !!data;
}

/**
 * Fetch events from Google Calendar.
 */
export async function fetchCalendarEvents(timeMin: string, timeMax: string) {
  const auth = await getAuthenticatedClient();
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return response.data.items || [];
}

/**
 * Sync Google Calendar events into the activities table.
 * Uses upsert logic based on external_id to avoid duplicates.
 */
export async function syncCalendarToActivities(
  timeMin: string,
  timeMax: string
): Promise<Activity[]> {
  const events = await fetchCalendarEvents(timeMin, timeMax);
  const activities: Activity[] = [];

  for (const event of events) {
    if (!event.id || !event.summary) continue;

    const startTime =
      event.start?.dateTime || event.start?.date
        ? new Date(event.start.dateTime || event.start.date!).toISOString()
        : null;
    const endTime =
      event.end?.dateTime || event.end?.date
        ? new Date(event.end.dateTime || event.end.date!).toISOString()
        : null;

    if (!startTime) continue;

    // Check if activity already exists for this event
    const { data: existing } = await supabase
      .from("activities")
      .select("id")
      .eq("external_source", "google_calendar")
      .eq("external_id", event.id)
      .single();

    if (existing) {
      // Update existing activity
      const { data, error } = await supabase
        .from("activities")
        .update({
          title: event.summary,
          start_time: startTime,
          end_time: endTime,
          category: event.organizer?.displayName || null,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (!error && data) activities.push(data as Activity);
    } else {
      // Insert new activity
      const { data, error } = await supabase
        .from("activities")
        .insert({
          external_source: "google_calendar",
          external_id: event.id,
          title: event.summary,
          start_time: startTime,
          end_time: endTime,
          category: event.organizer?.displayName || null,
        })
        .select()
        .single();

      if (!error && data) activities.push(data as Activity);
    }
  }

  return activities;
}
