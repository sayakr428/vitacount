"use client";

import dynamic from "next/dynamic";

// Client-only and split out: the Pipecat client and three.js only download
// when the agent flag is on and an (app) page renders. The flag is inlined at
// build time, so with it off the import() below is dead code and the dock's
// chunk is never even emitted.
const VitaDock =
  process.env.NEXT_PUBLIC_AGENT_ENABLED === "true"
    ? dynamic(() => import("./vita-dock"), { ssr: false })
    : () => null;

export function VitaDockLoader() {
  return <VitaDock />;
}
