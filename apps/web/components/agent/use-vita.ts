"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PipecatClient,
  RTVIEvent,
  findElementByRef,
  type A11yNode,
  type A11ySnapshot,
  type BotOutputData,
  type Participant,
  type TranscriptData,
  type UICommandData,
} from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

export type VitaStatus = "disconnected" | "connecting" | "ready" | "offline";
export type VitaMode = "voice" | "chat";
export type VitaMessage = { id: number; from: "user" | "vita" | "system"; text: string };

type SessionResponse = { botUrl: string; sessionToken: string; expiresAt: number };

let nextMessageId = 1;

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

// Vita's own dock/cursor and anything the app marks private never reach the bot.
const HIDDEN_FROM_VITA = "[data-vita-dock], [data-agent-private]";

function pruneNode(node: A11yNode): A11yNode | null {
  const el = node.ref ? findElementByRef(node.ref) : null;
  if (el?.closest(HIDDEN_FROM_VITA)) return null;
  const children = node.children?.map(pruneNode).filter((c): c is A11yNode => c !== null);
  return children ? { ...node, children } : node;
}

/**
 * startUISnapshotStream() snapshots all of document.body and has no exclude
 * option (only aria-hidden, which would hide the dock from screen readers
 * too). Filter each snapshot just before it's sent instead.
 */
function installSnapshotFilter(client: PipecatClient) {
  const target = client as unknown as { _sendUISnapshot?: (s: A11ySnapshot) => void };
  const send = target._sendUISnapshot?.bind(client);
  if (!send) return;
  target._sendUISnapshot = (snapshot: A11ySnapshot) => {
    const root = pruneNode(snapshot.root) ?? { ...snapshot.root, children: [] };
    send({ ...snapshot, root });
  };
}

/**
 * Owns the PipecatClient for the dock: mints a session token from
 * /api/agent/session, connects to the voice bot over SmallWebRTC, and turns
 * RTVI events into dock state. The bot only ever receives the signed session
 * token — no Supabase credentials.
 */
export function useVita({
  onNavigate,
  onUICommand,
  onUserFinal,
}: {
  onNavigate: (path: string) => void;
  /** Pipecat UIWorker commands: click, set_input_value, scroll_to, highlight, … */
  onUICommand: (command: string, payload: unknown) => void;
  /** Final user transcripts, e.g. a spoken "yes" for a pending Allow prompt. */
  onUserFinal: (text: string) => void;
}) {
  const clientRef = useRef<PipecatClient | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const levelRef = useRef(0);
  const onNavigateRef = useRef(onNavigate);
  const onUICommandRef = useRef(onUICommand);
  const onUserFinalRef = useRef(onUserFinal);
  const speakerOnRef = useRef(true);
  // Text typed while the WebRTC handshake (~2–4s) is still running; sent as
  // soon as the bot is ready so the user never waits to start typing.
  const pendingTextRef = useRef<string[]>([]);
  const connectingRef = useRef(false);

  const [status, setStatus] = useState<VitaStatus>("disconnected");
  const [messages, setMessages] = useState<VitaMessage[]>([]);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOnState] = useState(true);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
    onUICommandRef.current = onUICommand;
    onUserFinalRef.current = onUserFinal;
  }, [onNavigate, onUICommand, onUserFinal]);

  const push = useCallback((from: VitaMessage["from"], text: string) => {
    setMessages((prev) => [...prev, { id: nextMessageId++, from, text }]);
  }, []);

  // Consecutive bot sentences join one bubble until the user speaks again.
  const appendVita = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.from === "vita") {
        return [...prev.slice(0, -1), { ...last, text: `${last.text} ${text}`.trim() }];
      }
      return [...prev, { id: nextMessageId++, from: "vita", text: text.trim() }];
    });
  }, []);

  const teardown = useCallback(() => {
    clientRef.current?.stopUISnapshotStream();
    clientRef.current = null;
    pendingTextRef.current = [];
    setBotSpeaking(false);
    setBotThinking(false);
    setUserSpeaking(false);
    setMicOn(false);
    levelRef.current = 0;
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  const connect = useCallback(
    async (mode: VitaMode) => {
      if (clientRef.current || connectingRef.current) return;
      connectingRef.current = true;
      setStatus("connecting");

      let session: SessionResponse;
      try {
        const res = await fetch("/api/agent/session", { method: "POST" });
        // The auth proxy answers signed-out requests with a redirect to /login.
        if (res.redirected || res.status === 401) {
          connectingRef.current = false;
          pendingTextRef.current = [];
          setStatus("disconnected");
          push("system", "Your session has ended. Please sign in again to talk to Vita.");
          return;
        }
        if (!res.ok) throw new Error(`session ${res.status}`);
        session = (await res.json()) as SessionResponse;
      } catch {
        connectingRef.current = false;
        pendingTextRef.current = [];
        setStatus("offline");
        return;
      }

      const client = new PipecatClient({
        transport: new SmallWebRTCTransport(),
        enableMic: mode === "voice",
        enableCam: false,
      });
      clientRef.current = client;

      client.on(RTVIEvent.TrackStarted, (track: MediaStreamTrack, participant?: Participant) => {
        if (track.kind !== "audio" || participant?.local || !audioRef.current) return;
        audioRef.current.srcObject = new MediaStream([track]);
        audioRef.current.muted = !speakerOnRef.current;
        void audioRef.current.play().catch(() => {});
      });
      client.on(RTVIEvent.RemoteAudioLevel, (level: number) => {
        levelRef.current = level;
      });
      client.on(RTVIEvent.BotLlmStarted, () => setBotThinking(true));
      client.on(RTVIEvent.BotStartedSpeaking, () => {
        setBotThinking(false);
        setBotSpeaking(true);
      });
      client.on(RTVIEvent.BotStoppedSpeaking, () => {
        setBotSpeaking(false);
        levelRef.current = 0;
      });
      client.on(RTVIEvent.UserStartedSpeaking, () => setUserSpeaking(true));
      client.on(RTVIEvent.UserStoppedSpeaking, () => setUserSpeaking(false));
      client.on(RTVIEvent.UserTranscript, (data: TranscriptData) => {
        if (data.final && data.text.trim()) {
          push("user", data.text.trim());
          onUserFinalRef.current(data.text.trim());
        }
      });
      client.on(RTVIEvent.BotOutput, (data: BotOutputData) => {
        // Each sentence arrives once when generated and again once spoken;
        // show it the first time only.
        if (data.spoken === true || !data.text?.trim()) return;
        setBotThinking(false);
        appendVita(data.text);
      });
      client.on(RTVIEvent.ServerMessage, (data: unknown) => {
        if (
          typeof data === "object" &&
          data !== null &&
          (data as { type?: unknown }).type === "navigate" &&
          typeof (data as { path?: unknown }).path === "string"
        ) {
          onNavigateRef.current((data as { path: string }).path);
        }
      });
      client.on(RTVIEvent.UICommand, (data: UICommandData) => {
        onUICommandRef.current(data.command, data.payload);
      });
      client.on(RTVIEvent.Disconnected, () => {
        teardown();
        setStatus((s) => (s === "connecting" ? "offline" : "disconnected"));
      });

      try {
        await client.startBotAndConnect({
          endpoint: `${session.botUrl.replace(/\/$/, "")}/start`,
          requestData: {
            transport: "webrtc",
            // Pipecat Cloud returns STUN/TURN servers so audio gets through
            // restrictive networks; the local runner falls back to public STUN.
            enableDefaultIceServers: true,
            // Skip the greeting when the user already typed a question.
            body: { token: session.sessionToken, path: currentPath(), mode, greet: pendingTextRef.current.length === 0 },
          },
        });
        connectingRef.current = false;
        setMicOn(mode === "voice");
        setStatus("ready");
        // Vita sees the page only while the dock is open and connected.
        installSnapshotFilter(client);
        client.startUISnapshotStream({ debounceMs: 250 });
        const queued = pendingTextRef.current.splice(0);
        for (const content of queued) {
          setBotThinking(true);
          await client.sendText(content, { run_immediately: true, audio_response: speakerOnRef.current });
        }
      } catch {
        connectingRef.current = false;
        teardown();
        setStatus("offline");
      }
    },
    [appendVita, push, teardown],
  );

  const disconnect = useCallback(async () => {
    const client = clientRef.current;
    teardown();
    setStatus("disconnected");
    if (client) await client.disconnect().catch(() => {});
  }, [teardown]);

  const sendText = useCallback(
    async (text: string) => {
      const client = clientRef.current;
      const content = text.trim();
      if (!content || (!client && !connectingRef.current)) return;
      push("user", content);
      setBotThinking(true);
      if (!client || client.state !== "ready") {
        pendingTextRef.current.push(content);
        return;
      }
      await client.sendText(content, { run_immediately: true, audio_response: speakerOnRef.current });
    },
    [push],
  );

  const setMic = useCallback((on: boolean) => {
    const client = clientRef.current;
    if (!client) return;
    client.enableMic(on);
    setMicOn(on);
  }, []);

  const setSpeakerOn = useCallback((on: boolean) => {
    speakerOnRef.current = on;
    setSpeakerOnState(on);
    if (audioRef.current) audioRef.current.muted = !on;
  }, []);

  /** Esc: cut Vita off mid-sentence and stop listening. */
  const stop = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    client.sendClientMessage("stop");
    setBotSpeaking(false);
    setBotThinking(false);
    if (micOn) setMic(false);
  }, [micOn, setMic]);

  const reportPage = useCallback((path: string) => {
    clientRef.current?.sendClientMessage("page", { path });
  }, []);

  /** Acknowledges a UIWorker command with what actually happened on the page. */
  const sendUIEvent = useCallback((event: string, payload: Record<string, unknown>) => {
    clientRef.current?.sendUIEvent(event, payload);
  }, []);

  useEffect(() => {
    return () => {
      void clientRef.current?.disconnect().catch(() => {});
    };
  }, []);

  return {
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
    stop,
    reportPage,
    sendUIEvent,
  };
}
