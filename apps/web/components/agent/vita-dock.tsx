"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCw,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { findElementByRef } from "@pipecat-ai/client-js";
import { Button } from "@/components/ui/button";
import { RobotMascot, type MascotState } from "@/components/ui/robot-mascot";
import { cn } from "@/lib/utils";
import { GHOST_MOVE_MS, GhostCursor, type GhostCursorState } from "./ghost-cursor";
import {
  bringIntoView,
  elementLabel,
  currentValue,
  fillElement,
  highlightElement,
  pageFeedback,
  isConsequential,
  isForbidden,
  prefersReducedMotion,
  selectElementText,
} from "./ui-actions";
import { useVita, type VitaMessage } from "./use-vita";

const HOTKEY_LABEL = "Ctrl+Space";
const HOLD_TO_TALK_MS = 350;

const SUGGESTIONS = [
  "Add a customer with dummy details",
  "Create an invoice for a customer",
  "Take me to my reports",
  "What does reconciliation do?",
];

const YES = /^(yes|yeah|yep|yup|sure|allow|confirm|go ahead|do it|ok(ay)?|please do)\b/i;
const NO = /^(no|nope|cancel|stop|don'?t|wait)\b/i;
const IDLE_HIDE_MS = 1800;

type CommandPayload = {
  ref?: string;
  value?: unknown;
  replace?: boolean;
  start_offset?: number | null;
  end_offset?: number | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shorten(text: string, max = 28) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** WebGL can be unavailable (old GPUs, some VMs); fall back to a flat orb. */
class MascotBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FlatOrb() {
  return (
    <div className="flex size-full items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Bot className="size-8" />
    </div>
  );
}

function MessageBubble({ message }: { message: VitaMessage }) {
  if (message.from === "system") {
    return <p className="px-2 text-center text-xs text-muted-foreground">{message.text}</p>;
  }
  const mine = message.from === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {message.text}
      </p>
    </div>
  );
}

export default function VitaDock() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onNavigate = useCallback((path: string) => router.push(path), [router]);

  // --- On-screen operator ("clicky mode") -------------------------------
  const [cursor, setCursor] = useState<GhostCursorState>({ visible: false, x: 0, y: 0, caption: null, clickId: 0 });
  const [driving, setDriving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const commandQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedCount = useRef(0);
  const generation = useRef(0); // bumped by Esc: drops anything still queued
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendUIEventRef = useRef<(event: string, payload: Record<string, unknown>) => void>(() => {});

  const resolveConfirm = useCallback((ok: boolean) => {
    confirmResolver.current?.(ok);
    confirmResolver.current = null;
    setPendingConfirm(null);
  }, []);

  const askAllow = useCallback(
    (label: string) =>
      new Promise<boolean>((resolve) => {
        confirmResolver.current = resolve;
        setPendingConfirm(label);
      }),
    [],
  );

  const moveCursorTo = useCallback(async (el: Element, caption: string) => {
    await bringIntoView(el);
    const r = el.getBoundingClientRect();
    setCursor((c) => ({
      ...c,
      visible: true,
      x: r.left + Math.min(r.width / 2, 48),
      y: r.top + r.height / 2,
      caption,
    }));
    await sleep(prefersReducedMotion() ? 80 : GHOST_MOVE_MS + 60);
  }, []);

  const runCommand = useCallback(
    async (command: string, payload: CommandPayload, gen: number) => {
      const ref = payload.ref ?? "";
      // Every command is acknowledged so the bot's screen tool returns what
      // really happened instead of assuming success.
      const report = (result: Record<string, unknown>) => sendUIEventRef.current("command_result", { ref, ...result });
      if (gen !== generation.current) return report({ ok: false, reason: "The user stopped Vita." });
      const el = ref ? findElementByRef(ref) : null;
      if (!el || el.closest("[data-vita-dock]")) return report({ ok: false, error: "That element is no longer on the page." });

      switch (command) {
        case "scroll_to":
          await bringIntoView(el);
          return report({ ok: true });
        case "focus":
          if (el instanceof HTMLElement) el.focus();
          return report({ ok: true });
        case "highlight":
          await moveCursorTo(el, shorten(elementLabel(el) || "Here"));
          highlightElement(el);
          return report({ ok: true });
        case "select_text":
          await moveCursorTo(el, "Selecting");
          selectElementText(el, payload.start_offset, payload.end_offset);
          return report({ ok: true });
        case "set_input_value": {
          const value = String(payload.value ?? "");
          const verb = el instanceof HTMLSelectElement ? "Choosing" : "Typing";
          await moveCursorTo(el, `${verb} ${shorten(value)}`);
          if (gen !== generation.current) return report({ ok: false, reason: "The user stopped Vita." });
          const written = fillElement(el, value, payload.replace !== false);
          await sleep(120);
          if (written === null) {
            return report({
              ok: false,
              value: currentValue(el),
              error:
                el instanceof HTMLSelectElement
                  ? `No option matches "${value}".`
                  : `"${value}" can't be typed into this field (it may be read-only or numbers only).`,
            });
          }
          return report({ ok: true, value: currentValue(el) });
        }
        case "click": {
          const label = elementLabel(el) || "that button";
          if (isForbidden(el)) {
            setCursor((c) => ({ ...c, caption: "Vita can't do that one" }));
            return report({ ok: false, reason: `"${label}" is something Vita is not allowed to do. The user must do it.` });
          }
          await moveCursorTo(el, `Clicking ${shorten(label)}`);
          if (gen !== generation.current) return report({ ok: false, reason: "The user stopped Vita." });
          if (el instanceof HTMLButtonElement && el.disabled) {
            return report({ ok: false, error: `"${label}" is disabled right now.`, ...pageFeedback(el) });
          }
          if (isConsequential(el)) {
            const allowed = await askAllow(label);
            if (gen !== generation.current) return report({ ok: false, reason: "The user stopped Vita." });
            if (!allowed) return report({ ok: false, reason: "The user pressed Cancel, so it was not clicked." });
          }
          setCursor((c) => ({ ...c, clickId: c.clickId + 1 }));
          const before = window.location.href;
          if (el instanceof HTMLElement) el.click();
          // Give validation, server actions and navigation a moment to show up.
          for (let waited = 0; waited < 4000 && window.location.href === before; waited += 250) await sleep(250);
          await sleep(400);
          const feedback = pageFeedback(el);
          return report({ ok: feedback.invalid.length === 0, ...feedback });
        }
      }
      report({ ok: false, error: `Unsupported command ${command}.` });
    },
    [askAllow, moveCursorTo],
  );

  const onUICommand = useCallback(
    (command: string, payload: unknown) => {
      const gen = generation.current;
      const data = (typeof payload === "object" && payload !== null ? payload : {}) as CommandPayload;
      queuedCount.current += 1;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      setDriving(true);
      commandQueue.current = commandQueue.current
        .then(() => runCommand(command, data, gen))
        .catch(() => {})
        .finally(() => {
          queuedCount.current -= 1;
          if (queuedCount.current === 0) {
            idleTimer.current = setTimeout(() => {
              setDriving(false);
              setCursor((c) => ({ ...c, visible: false, caption: null }));
            }, IDLE_HIDE_MS);
          }
        });
    },
    [runCommand],
  );

  const stopDriving = useCallback(() => {
    generation.current += 1;
    if (confirmResolver.current) resolveConfirm(false);
    setDriving(false);
    setCursor((c) => ({ ...c, visible: false, caption: null }));
  }, [resolveConfirm]);

  // A spoken "yes"/"no" answers a pending Allow prompt.
  const onUserFinal = useCallback(
    (text: string) => {
      if (!confirmResolver.current) return;
      if (YES.test(text)) resolveConfirm(true);
      else if (NO.test(text)) resolveConfirm(false);
    },
    [resolveConfirm],
  );

  const {
    status,
    messages,
    botSpeaking,
    botThinking,
    userSpeaking,
    micOn,
    speakerOn,
    audioRef,
    levelRef,
    connect,
    disconnect,
    sendText,
    setMic,
    setSpeakerOn,
    stop: stopTalking,
    reportPage,
    sendUIEvent,
  } = useVita({ onNavigate, onUICommand, onUserFinal });

  useEffect(() => {
    sendUIEventRef.current = sendUIEvent;
  }, [sendUIEvent]);

  const stop = useCallback(() => {
    stopTalking();
    stopDriving();
  }, [stopTalking, stopDriving]);

  // Keep the bot told which page the user is on, including clicks they make.
  useEffect(() => {
    if (status === "ready") reportPage(`${window.location.pathname}${window.location.search}`);
  }, [pathname, status, reportPage]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, botThinking]);

  const openDock = useCallback(() => {
    setOpen(true);
    if (status === "disconnected" || status === "offline") void connect("chat");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [connect, status]);

  const closeDock = useCallback(() => {
    stopDriving();
    setOpen(false);
    // Vita only sees and hears anything while the dock is open.
    void disconnect();
  }, [disconnect, stopDriving]);

  // Hotkey: tap Ctrl+Space to toggle, hold it to talk, Esc to stop.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const lastEscAt = useRef(0);
  const stateRef = useRef({ open, status, busy: false });
  useEffect(() => {
    stateRef.current = { open, status, busy: botSpeaking || botThinking || driving || pendingConfirm !== null };
  }, [open, status, botSpeaking, botThinking, driving, pendingConfirm]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.ctrlKey && !e.repeat) {
        if (isTypingTarget(e.target) && !stateRef.current.open) return;
        e.preventDefault();
        holdTimer.current = setTimeout(() => {
          holding.current = true;
          setOpen(true);
          if (stateRef.current.status === "ready") setMic(true);
          else void connect("voice");
        }, HOLD_TO_TALK_MS);
      } else if (e.key === "Escape" && stateRef.current.open) {
        // First Esc stops Vita mid-sentence; a quick second Esc always closes,
        // even if a new reply has already started.
        const now = Date.now();
        const doublePress = now - lastEscAt.current < 1500;
        lastEscAt.current = now;
        if (stateRef.current.busy && !doublePress) stop();
        else closeDock();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== "Control") return;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
        if (!holding.current && e.code === "Space") {
          if (stateRef.current.open) closeDock();
          else openDock();
        }
      }
      if (holding.current) {
        holding.current = false;
        setMic(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [closeDock, connect, openDock, setMic, stop]);

  const mascotState: MascotState =
    status === "offline"
      ? "offline"
      : status === "connecting"
        ? "connecting"
        : botSpeaking
          ? "speaking"
          : botThinking
            ? "thinking"
            : micOn || userSpeaking
              ? "listening"
              : "idle";

  const statusText =
    status === "offline"
      ? "Offline"
      : status === "connecting"
        ? "Connecting…"
        : status !== "ready"
          ? "Not connected"
          : botSpeaking
            ? "Speaking"
            : botThinking
              ? "Thinking…"
              : micOn
                ? "Listening"
                : "Ready";

  const canType = status === "ready" || status === "connecting";

  const submit = () => {
    if (!draft.trim() || !canType) return;
    void sendText(draft);
    setDraft("");
  };

  return (
    <div
      data-vita-dock
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 md:right-6 md:bottom-6"
    >
      <GhostCursor state={cursor} reducedMotion={typeof window !== "undefined" && prefersReducedMotion()} />
      {driving && (
        <div
          role="status"
          className="pointer-events-auto fixed top-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-primary py-1.5 pr-1.5 pl-4 text-sm font-medium text-primary-foreground shadow-lg"
        >
          Vita is working on the page
          <button
            type="button"
            onClick={stop}
            className="rounded-full bg-primary-foreground/15 px-3 py-1 text-xs hover:bg-primary-foreground/25"
          >
            Stop (Esc)
          </button>
        </div>
      )}
      <audio ref={audioRef} autoPlay className="hidden" />

      {open && (
        <section
          aria-label="Vita assistant"
          className="pointer-events-auto flex max-h-[min(560px,calc(100vh-9rem))] w-[min(380px,calc(100vw-2rem))] flex-col rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06] backdrop-blur"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Vita</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      status === "ready" ? "bg-positive" : status === "offline" ? "bg-destructive" : "bg-muted-foreground",
                    )}
                  />
                  {statusText}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={speakerOn ? "Mute Vita's voice" : "Unmute Vita's voice"}
                  onClick={() => setSpeakerOn(!speakerOn)}
                >
                  {speakerOn ? <Volume2 /> : <VolumeX />}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Close Vita" onClick={closeDock}>
                  <X />
                </Button>
              </div>
            </header>

            <div ref={transcriptRef} className="min-h-[180px] flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
              {status === "offline" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
                  <p className="text-sm font-medium">Vita is offline</p>
                  <p className="max-w-[260px] text-xs text-muted-foreground">
                    The assistant service isn&apos;t reachable right now. Everything else in VitaCount works as usual.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void connect("chat")}>
                    <RotateCw /> Try again
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="space-y-3 py-2">
                  <p className="px-1 text-sm text-muted-foreground">
                    Ask me anything about VitaCount, or hold {HOTKEY_LABEL} to talk.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={!canType}
                        onClick={() => void sendText(s)}
                        className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => <MessageBubble key={m.id} message={m} />)
              )}
              {botThinking && !botSpeaking && (
                <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3 animate-spin" /> Vita is thinking…
                </p>
              )}
            </div>

            {pendingConfirm && (
              <div role="alertdialog" aria-label="Allow Vita to continue" className="border-t border-border bg-primary/5 px-3 py-2.5">
                <p className="text-sm">
                  Vita wants to click <strong>{pendingConfirm}</strong>. This changes your books.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => resolveConfirm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => resolveConfirm(true)}>
                    Allow
                  </Button>
                </div>
              </div>
            )}

            <footer className="flex items-center gap-1.5 border-t border-border p-2">
              <Button
                variant={micOn ? "default" : "ghost"}
                size="icon"
                aria-label={micOn ? "Stop talking" : "Talk to Vita"}
                aria-pressed={micOn}
                disabled={status !== "ready"}
                onClick={() => setMic(!micOn)}
              >
                {micOn ? <Mic /> : <MicOff />}
              </Button>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={status === "connecting" ? "Ask Vita… (connecting)" : "Ask Vita…"}
                disabled={!canType}
                aria-label="Message Vita"
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
              {botSpeaking || botThinking ? (
                <Button variant="outline" size="icon" aria-label="Stop Vita (Esc)" onClick={stop}>
                  <Square className="fill-current" />
                </Button>
              ) : (
                <Button size="icon" aria-label="Send" disabled={!draft.trim() || !canType} onClick={submit}>
                  <SendHorizontal />
                </Button>
              )}
            </footer>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => (open ? closeDock() : openDock())}
        aria-label={open ? "Close Vita" : `Open Vita (${HOTKEY_LABEL}, hold to talk)`}
        aria-expanded={open}
        title={`Vita · ${HOTKEY_LABEL} to open, hold to talk`}
        className={cn(
          "pointer-events-auto relative size-[88px] rounded-full bg-card shadow-lg ring-1 ring-foreground/10 transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          mascotState === "listening" && "ring-2 ring-primary",
          mascotState === "speaking" && "shadow-primary/30",
        )}
      >
        <MascotBoundary fallback={<FlatOrb />}>
          <RobotMascot state={mascotState} levelRef={levelRef} className="size-full overflow-hidden rounded-full" />
        </MascotBoundary>
      </button>
    </div>
  );
}
