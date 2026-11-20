import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { activityText } from "../../lib/activityText.ts";
import { getDeviceId } from "../../lib/device.ts";
import type { RoomView } from "../room/types.ts";

/** The last two Activity entries, newest first, under the Pots. */
export function ActivityTicker({ view }: { view: RoomView }) {
  const entries = useQuery(api.chips.activity, { deviceId: getDeviceId(), roomId: view.room._id, limit: 2 });
  const names = {
    players: new Map(view.players.map((p) => [p._id as string, p.name])),
    pots: new Map(view.pots.map((p) => [p._id as string, p.name])),
    meId: view.me._id,
  };
  return (
    <ol className="ticker" aria-label="Latest Activity" aria-live="polite">
      {(entries ?? []).map((e) => (
        <li key={e._id}>{activityText(e, names)}</li>
      ))}
    </ol>
  );
}
