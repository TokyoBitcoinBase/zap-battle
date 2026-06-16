export type BattleSide = "left" | "right";

export type Contestant = {
  side: BattleSide;
  displayName: string;
  nostrPubkey?: string;
  lightningAddress: string;
  profileImageUrl?: string;
  temporaryProfile?: boolean;
};

export type ZapBattleSession = {
  id: string;
  title: string;
  status: "draft" | "live" | "ended";
  startsAt: number | null;
  endsAt: number | null;
  durationSeconds: number;
  graceSeconds: number;
  finalResult?: ZapBattleFinalResult;
  contestants: {
    left: Contestant;
    right: Contestant;
  };
  createdAt?: number;
  updatedAt?: number;
};

export type ZapReceiptItem = {
  id: string;
  side: BattleSide;
  senderName: string;
  amountSats: number;
  comment: string;
  createdAt: number;
};

export type ZapBattleSideResult = {
  totalSats: number;
  count: number;
  averageSats: number;
};

export type ZapBattleFinalResult = {
  capturedAt: number;
  winner: BattleSide | "tied";
  left: ZapBattleSideResult;
  right: ZapBattleSideResult;
  receipts: ZapReceiptItem[];
};
