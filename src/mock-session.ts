import type { ZapBattleSession, ZapReceiptItem } from "./types";

export const mockSession: ZapBattleSession = {
  id: "demo",
  title: "Demo Battle",
  status: "draft",
  startsAt: null,
  endsAt: null,
  durationSeconds: 10 * 60,
  graceSeconds: 30,
  contestants: {
    left: {
      side: "left",
      displayName: "",
      lightningAddress: ""
    },
    right: {
      side: "right",
      displayName: "",
      lightningAddress: ""
    }
  }
};

export const mockReceipts: ZapReceiptItem[] = [
  {
    id: "demo-1",
    side: "left",
    senderName: "anonymous",
    amountSats: 1000,
    comment: "go!",
    createdAt: 0
  },
  {
    id: "demo-2",
    side: "right",
    senderName: "npub...abcd",
    amountSats: 700,
    comment: "nice",
    createdAt: 0
  }
];
