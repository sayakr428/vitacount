import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/user";

const PIPECAT_CLOUD_API = "https://api.pipecat.daily.co/v1/public";

/** Set in production: the deployed agent's name and the org's public API key (pk_…). */
export function pipecatCloudConfig() {
  const agent = process.env.PIPECAT_CLOUD_AGENT;
  const key = process.env.PIPECAT_CLOUD_PUBLIC_KEY;
  return agent && key ? { agent, key } : null;
}

/**
 * Forwards a dock request to Pipecat Cloud with the API key attached here on
 * the server, so the key never reaches the browser and every call stays
 * same-origin (no CORS). Only signed-in users can start or drive a session;
 * the bot itself still rejects any session without a valid HMAC token.
 */
export async function forwardToPipecatCloud(request: Request, path: string) {
  const config = pipecatCloudConfig();
  if (!config) {
    return NextResponse.json({ error: "Vita cloud hosting is not configured." }, { status: 503 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const upstream = await fetch(`${PIPECAT_CLOUD_API}/${encodeURIComponent(config.agent)}/${path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: request.method === "GET" ? undefined : await request.text(),
    cache: "no-store",
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
