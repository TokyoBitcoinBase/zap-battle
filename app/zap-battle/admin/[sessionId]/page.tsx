import { BattleAdminEditor } from "@/src/ui/battle-admin-editor";

export default async function BattleAdminPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <BattleAdminEditor sessionId={sessionId} />;
}
