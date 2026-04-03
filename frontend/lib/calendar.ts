import { google } from "googleapis";
import { supabase } from "@/lib/database";
import type { Activity } from "@/lib/types";
import { encryptToken, decryptToken } from "@/lib/crypto";

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
export function getAuthUrl(state?: string) {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: state,
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
    access_token: encryptToken(tokens.access_token!),
    refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
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
    access_token: decryptToken(data.access_token),
    refresh_token: data.refresh_token ? decryptToken(data.refresh_token) : undefined,
    expiry_date: data.token_expiry ? new Date(data.token_expiry).getTime() : undefined,
  });

  // Listen for token refresh events and update DB
  oauth2Client.on("tokens", async (newTokens) => {
    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (newTokens.access_token) {
      updateData.access_token = encryptToken(newTokens.access_token);
    }
    if (newTokens.refresh_token) {
      updateData.refresh_token = encryptToken(newTokens.refresh_token);
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
  // Rate Limiting: Minimum 120 seconds between Calendar syncs
  const { data: token } = await supabase
    .from("oauth_tokens")
    .select("id, last_synced_at")
    .eq("provider", "google")
    .single();

  if (token?.last_synced_at) {
    if (Date.now() - new Date(token.last_synced_at).getTime() < 120000) {
      throw new Error("Rate limit exceeded. Minimum 120 seconds between Calendar syncs.");
    }
  }

  const events = await fetchCalendarEvents(timeMin, timeMax);
  const activities: Activity[] = [];

  for (const event of events) {
    if (!event.id || !event.summary) continue;

    const startTimeStr = event.start?.dateTime || event.start?.date;
    const endTimeStr = event.end?.dateTime || event.end?.date;

    const startTime = startTimeStr ? new Date(startTimeStr).toISOString() : null;
    const endTime = endTimeStr ? new Date(endTimeStr).toISOString() : null;

    if (!startTime) continue;

    let duration_minutes = null;
    if (startTime && endTime) {
      const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      duration_minutes = Math.round(diffMs / 60000);
    }

    const activityData = {
      title: event.summary,
      description: event.description || null,
      source: "google_calendar",
      external_id: event.id,
      source_account: event.organizer?.email || null,
      source_url: event.htmlLink || null,
      scheduled_start: startTime,
      scheduled_end: endTime,
      duration_minutes,
      category: event.organizer?.displayName || null,
      metadata: {
        attendees: event.attendees?.map((a) => a.email || null).filter(Boolean) || [],
        location: event.location || null,
        status: event.status || null
      }
    };

    // Check if activity already exists for this event
    const { data: existing } = await supabase
      .from("activities")
      .select("id, local_override")
      .eq("source", "google_calendar")
      .eq("external_id", event.id)
      .single();

    let savedActivity = null;

    if (existing) {
      if (existing.local_override) {
        // User has manually edited this activity — skip sync update to preserve their changes
        const { data } = await supabase
          .from("activities")
          .select("*")
          .eq("id", existing.id)
          .single();
        savedActivity = data as Activity;
      } else {
        // Update existing activity with latest calendar data
        const { data, error } = await supabase
          .from("activities")
          .update(activityData)
          .eq("id", existing.id)
          .select()
          .single();

        if (!error && data) savedActivity = data as Activity;
      }
    } else {
      // Insert new activity
      const { data, error } = await supabase
        .from("activities")
        .insert(activityData)
        .select()
        .single();

      if (!error && data) savedActivity = data as Activity;
    }

    if (savedActivity) {
      activities.push(savedActivity);
      
      // Ensure the linking table entry exists (upsert)
      await supabase
        .from("activity_sources")
        .upsert({
          activity_id: savedActivity.id,
          source: "google_calendar",
          external_id: event.id
        }, { onConflict: "source,external_id" });
    }
  }

  // Update last_synced_at for rate limiting
  if (token) {
    await supabase
      .from("oauth_tokens")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", token.id);
  }

  return activities;
}
