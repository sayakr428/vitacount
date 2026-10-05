import { forwardToPipecatCloud } from "@/lib/pipecat-cloud";

/**
 * Production entry point for the Vita dock (`startBotAndConnect` posts here
 * when the bot runs on Pipecat Cloud). Starts a SmallWebRTC session and
 * returns { sessionId, iceConfig }; the client then sends its WebRTC offer to
 * /api/agent/sessions/{sessionId}/api/offer.
 */
export async function POST(request: Request) {
  return forwardToPipecatCloud(request, "start");
}
