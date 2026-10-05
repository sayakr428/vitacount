import "server-only";
import { createHmac } from "node:crypto";

// Only gates opening a bot session; the bot never gets admin credentials.
export const AGENT_SESSION_TTL_SECS = 15 * 60;

export type AgentSessionClaims = {
  sub: string;
  tid: string;
  role: string;
  iat: number;
  exp: number;
};

/**
 * `<payload>.<signature>`, both base64url. Verified by
 * services/voice-agent/vita/session.py with the same AGENT_SHARED_SECRET.
 */
export function signAgentSessionToken(
  claims: Omit<AgentSessionClaims, "iat" | "exp">,
  secret: string,
): { token: string; expiresAt: number } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + AGENT_SESSION_TTL_SECS;
  const body = Buffer.from(JSON.stringify({ ...claims, iat, exp })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `${body}.${signature}`, expiresAt: exp };
}
