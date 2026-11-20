import { useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getDeviceId } from "./device";

// Away (GLOSSARY.md): adapted from @convex-dev/presence/react's usePresence. The stock hook
// sends a client-chosen userId; ours sends the deviceId and the server resolves it to the
// caller's Player (convex/presence.ts), so nobody can mark someone else online.

const INTERVAL_MS = 10_000;

/**
 * Heartbeats while this Room is on screen and returns the ids of Players who are online, or
 * undefined until the first list arrives. A Player missing from the set is Away.
 */
export function usePresence(roomId: Id<"rooms">): Set<string> | undefined {
  const convex = useConvex();
  const heartbeat = useMutation(api.presence.heartbeat);
  const disconnect = useMutation(api.presence.disconnect);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    setRoomToken(null);
    const deviceId = getDeviceId();
    const sessionId = crypto.randomUUID();
    let canceled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const beat = async () => {
      if (inFlight) return; // one heartbeat at a time; the next tick catches up
      inFlight = true;
      try {
        const result = await heartbeat({ deviceId, roomId, sessionId, interval: INTERVAL_MS });
        if (canceled) {
          if (result) void disconnect({ sessionToken: result.sessionToken });
          return;
        }
        if (!result) {
          // Not (or no longer) in this Room, or it Ended: nothing to heartbeat.
          stop();
          return;
        }
        sessionTokenRef.current = result.sessionToken;
        setRoomToken(result.roomToken);
      } catch {
        // Offline for a moment: the next tick tries again.
      } finally {
        inFlight = false;
      }
    };

    const start = () => {
      stop();
      void beat();
      timer = setInterval(beat, INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        const token = sessionTokenRef.current;
        if (token) void disconnect({ sessionToken: token });
      } else {
        start();
      }
    };

    // A closing tab can't wait for a mutation, so send the disconnect as a beacon.
    const onUnload = () => {
      const token = sessionTokenRef.current;
      if (!token) return;
      const body = JSON.stringify({ path: "presence:disconnect", args: { sessionToken: token } });
      navigator.sendBeacon(`${convex.url}/api/mutation`, new Blob([body], { type: "application/json" }));
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onUnload);
    return () => {
      canceled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onUnload);
      const token = sessionTokenRef.current;
      sessionTokenRef.current = null;
      if (token) void disconnect({ sessionToken: token });
    };
  }, [convex, heartbeat, disconnect, roomId]);

  const list = useQuery(api.presence.list, roomToken ? { roomToken } : "skip");
  return useMemo(
    () => (list ? new Set(list.filter((e) => e.online).map((e) => e.userId)) : undefined),
    [list],
  );
}
