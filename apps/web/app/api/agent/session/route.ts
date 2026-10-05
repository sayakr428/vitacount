import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/user";
import { loadTenantContext } from "@/lib/tenant/data";
import { signAgentSessionToken } from "@/lib/agent-session";
import { pipecatCloudConfig } from "@/lib/pipecat-cloud";

/**
 * Mints the short-lived token the Vita dock hands to the voice bot when it
 * connects. Requires the normal signed-in cookie session; the bot refuses any
 * connection without a valid token.
 */
export async function POST() {
  if (process.env.NEXT_PUBLIC_AGENT_ENABLED !== "true") {
    return NextResponse.json({ error: "Vita is not enabled." }, { status: 404 });
  }

  const secret = process.env.AGENT_SHARED_SECRET;
  // On Pipecat Cloud the dock talks to our same-origin proxy routes
  // (/api/agent/start, /api/agent/sessions/*); locally, straight to the bot.
  const botUrl = pipecatCloudConfig() ? "/api/agent" : process.env.NEXT_PUBLIC_AGENT_URL;
  if (!secret || !botUrl) {
    return NextResponse.json({ error: "Vita is not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { activeTenantId, role } = await loadTenantContext();
  if (!activeTenantId || !role) {
    return NextResponse.json({ error: "No active workspace." }, { status: 403 });
  }

  const { token, expiresAt } = signAgentSessionToken(
    { sub: user.id, tid: activeTenantId, role },
    secret,
  );

  return NextResponse.json(
    { botUrl, sessionToken: token, expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
