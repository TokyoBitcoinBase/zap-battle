import type { ZapBattleSideResult, ZapReceiptItem } from "@/src/types";

export function soloStats(receipts: ZapReceiptItem[], saved?: ZapBattleSideResult): ZapBattleSideResult {
  const active = receipts.filter(receipt => receipt.side === "left");
  // Saved history is capped at 80 receipts. Keep the full captured total on reload;
  // a later full relay catch-up can raise it when delayed receipts arrive.
  const totalSats = Math.max(saved?.totalSats ?? 0, active.reduce((sum, receipt) => sum + receipt.amountSats, 0));
  const count = Math.max(saved?.count ?? 0, active.length);
  return { totalSats, count, averageSats: count > 0 ? Math.round(totalSats / count) : 0 };
}
