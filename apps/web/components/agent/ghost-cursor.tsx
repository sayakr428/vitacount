"use client";

import { cn } from "@/lib/utils";

export type GhostCursorState = {
  visible: boolean;
  x: number;
  y: number;
  caption: string | null;
  /** Bumped on every click so the ripple restarts. */
  clickId: number;
};

export const GHOST_MOVE_MS = 450;

/**
 * Vita's visible pointer. Purely visual — the action itself is done by the
 * command handler once the glide finishes. Excluded from the page snapshot
 * (it lives inside the dock root) so Vita never "sees" its own cursor.
 */
export function GhostCursor({ state, reducedMotion }: { state: GhostCursorState; reducedMotion: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-[60] transition-opacity duration-200",
        state.visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        transform: `translate(${state.x}px, ${state.y}px)`,
        transition: reducedMotion
          ? "opacity 200ms"
          : `transform ${GHOST_MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms`,
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" className="drop-shadow-md">
        <path
          d="M3 2.5 L19.5 11 L12 13 L8.5 20.5 Z"
          fill="var(--primary)"
          stroke="white"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {state.clickId > 0 && (
        <span
          key={state.clickId}
          className="absolute top-0 left-0 size-8 -translate-x-1/3 -translate-y-1/3 animate-ping rounded-full bg-primary/40 [animation-iteration-count:1]"
        />
      )}
      {state.caption && (
        <span className="absolute top-6 left-5 max-w-[240px] rounded-lg bg-primary px-2 py-1 text-xs font-medium whitespace-nowrap text-primary-foreground shadow-lg">
          {state.caption}
        </span>
      )}
    </div>
  );
}
