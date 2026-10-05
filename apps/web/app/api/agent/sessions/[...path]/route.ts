import { forwardToPipecatCloud } from "@/lib/pipecat-cloud";

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, { params }: Context) {
  const { path } = await params;
  // e.g. ["<sessionId>", "api", "offer"] -> sessions/<sessionId>/api/offer
  const safe = path.map((segment) => encodeURIComponent(segment)).join("/");
  return forwardToPipecatCloud(request, `sessions/${safe}`);
}

// POST: WebRTC offer. PATCH: trickled ICE candidates.
export const POST = forward;
export const PATCH = forward;
