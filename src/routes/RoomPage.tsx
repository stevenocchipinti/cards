import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getDeviceId } from "../lib/device.ts";
import { usePresence } from "../lib/usePresence.ts";
import { roomRoute } from "../router.tsx";
import { LobbyScreen } from "./lobby/LobbyScreen.tsx";
import { HostTray } from "./play/host/HostTray.tsx";
import { PlayScreen } from "./play/PlayScreen.tsx";
import type { RoomView } from "./room/types.ts";

export function RoomPage() {
  const { roomId } = roomRoute.useParams();
  const view = useQuery(api.rooms.getRoom, { deviceId: getDeviceId(), roomId });

  if (view === undefined) {
    return (
      <main className="screen message-screen">
        <p className="waiting" role="status">Finding your seat…</p>
      </main>
    );
  }
  if (view === null) return <NotInRoom />;
  if (view.room.stage === "ended") return <RoomEnded code={view.room.code} />;
  return <LiveRoom view={view} />;
}

/** Lobby and In Play: this device is present, so it heartbeats and sees who's Away. */
function LiveRoom({ view }: { view: RoomView }) {
  const online = usePresence(view.room._id as Id<"rooms">);
  if (view.room.stage === "lobby") return <LobbyScreen view={view} online={online} />;
  return <PlayScreen view={view} online={online} renderHostTray={(ctx) => <HostTray {...ctx} />} />;
}

function NotInRoom() {
  return (
    <main className="screen message-screen">
      <h1 className="title">You're not in this Room</h1>
      <p className="muted">Ask the Host for the Room Code or QR code to join.</p>
      <Link className="btn btn--block" to="/join">
        Join with a code
      </Link>
      <Link className="btn btn--wood btn--block" to="/">
        Home
      </Link>
    </main>
  );
}

function RoomEnded({ code }: { code: string }) {
  return (
    <main className="screen message-screen">
      <h1 className="title">This Room has ended</h1>
      <p className="muted">Room {code} is closed. Thanks for playing.</p>
      <Link className="btn btn--block" to="/">
        Home
      </Link>
    </main>
  );
}
