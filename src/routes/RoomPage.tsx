import { roomRoute } from "../router.tsx";

export function RoomPage() {
  const { roomId } = roomRoute.useParams();
  return (
    <main className="screen">
      <h1 className="title">Room</h1>
      <p>{roomId}</p>
    </main>
  );
}
