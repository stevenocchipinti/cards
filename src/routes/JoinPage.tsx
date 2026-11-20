import { joinRoute } from "../router.tsx";

export function JoinPage() {
  const { code } = joinRoute.useSearch();
  return (
    <main className="screen">
      <h1 className="title">Join</h1>
      <p>Room Code: {code ?? "—"}</p>
    </main>
  );
}
