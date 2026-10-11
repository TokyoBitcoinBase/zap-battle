import { BattleDisplayLoader } from "@/src/ui/battle-display-loader";

export default async function BattleDisplayPage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ admin?: string; create?: string; mode?: string }>;
}) {
  const { sessionId } = await params;
  const { admin, create, mode } = await searchParams;
  return (
    <BattleDisplayLoader
      adminEnabled={admin === "1" || admin === "true"}
      createEnabled={create === "1" || create === "true"}
      createMode={mode === "solo" ? "solo" : "battle"}
      sessionId={sessionId}
    />
  );
}
