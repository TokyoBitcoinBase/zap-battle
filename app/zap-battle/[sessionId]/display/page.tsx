import { BattleDisplayLoader } from "@/src/ui/battle-display-loader";

export default async function BattleDisplayPage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ admin?: string; create?: string }>;
}) {
  const { sessionId } = await params;
  const { admin, create } = await searchParams;
  return (
    <BattleDisplayLoader
      adminEnabled={admin === "1" || admin === "true"}
      createEnabled={create === "1" || create === "true"}
      sessionId={sessionId}
    />
  );
}
