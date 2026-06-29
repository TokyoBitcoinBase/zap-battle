import { verifyEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { relaysFromEnv } from "@/src/relays";
import type { BattleSide, ZapBattleSession, ZapReceiptItem } from "@/src/types";

type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export function subscribeToZapReceipts({
  session,
  onReceipt
}: {
  session: ZapBattleSession;
  onReceipt(item: ZapReceiptItem): void;
}): () => void {
  const contestantPubkeys = [
    session.contestants.left.nostrPubkey,
    session.contestants.right.nostrPubkey
  ].filter((pubkey): pubkey is string => Boolean(pubkey));
  if (!session.startsAt || contestantPubkeys.length === 0) return () => undefined;

  const pool = new SimplePool();
  const filter = createZapReceiptFilter(session, session.startsAt);
  const sub = pool.subscribe(readRelays(), filter, {
    onevent(event) {
      const parsed = parseZapReceipt(event as NostrEvent, session);
      if (!parsed) return;
      onReceipt(parsed.item);
      void senderNameForPubkey(pool, parsed.senderPubkey).then((senderName) => {
        if (senderName && senderName !== parsed.item.senderName) {
          onReceipt({ ...parsed.item, senderName });
        }
      });
    }
  });
  return () => {
    void sub.close("component unmounted");
    pool.close(readRelays());
  };
}

export async function fetchZapReceiptsOnce({
  session,
  since,
  maxWait = 2500
}: {
  session: ZapBattleSession;
  since?: number;
  maxWait?: number;
}): Promise<ZapReceiptItem[]> {
  const contestantPubkeys = [
    session.contestants.left.nostrPubkey,
    session.contestants.right.nostrPubkey
  ].filter((pubkey): pubkey is string => Boolean(pubkey));
  if (!session.startsAt || contestantPubkeys.length === 0) return [];

  const pool = new SimplePool();
  try {
    const filter = createZapReceiptFilter(
      session,
      since ?? session.startsAt
    );
    const events = await pool.querySync(readRelays(), filter, { maxWait });
    const parsedItems = events
      .map((event) => parseZapReceipt(event as NostrEvent, session))
      .filter((item): item is ParsedZapReceipt => Boolean(item));
    const senderNames = await senderNamesForPubkeys(pool, parsedItems.map((item) => item.senderPubkey));
    return parsedItems
      .map((parsed) => ({
        ...parsed.item,
        senderName: senderNames.get(parsed.senderPubkey) || parsed.item.senderName
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    pool.close(readRelays());
  }
}

function createZapReceiptFilter(session: ZapBattleSession, since: number) {
  const contestantPubkeys = [
    session.contestants.left.nostrPubkey,
    session.contestants.right.nostrPubkey
  ].filter((pubkey): pubkey is string => Boolean(pubkey));
  return {
    kinds: [9735],
    since,
    ...(session.endsAt ? { until: session.endsAt + session.graceSeconds } : {}),
    "#p": contestantPubkeys,
    limit: 500
  };
}

type ParsedZapReceipt = {
  item: ZapReceiptItem;
  senderPubkey: string;
};

function parseZapReceipt(receipt: NostrEvent, session: ZapBattleSession): ParsedZapReceipt | null {
  if (receipt.kind !== 9735 || !verifyEvent(receipt)) return null;
  const description = getTag(receipt, "description");
  if (!description) return null;
  let zapRequest: NostrEvent;
  try {
    zapRequest = JSON.parse(description) as NostrEvent;
  } catch {
    return null;
  }
  if (zapRequest.kind !== 9734 || !verifyEvent(zapRequest)) return null;
  const sessionTag = getTag(zapRequest, "zap_live");
  if (sessionTag && sessionTag !== session.id) return null;
  const startsAtTag = Number(getTag(zapRequest, "zap_live_starts_at") || 0);
  if (startsAtTag && session.startsAt && startsAtTag !== session.startsAt) return null;

  const recipientPubkey = getTag(zapRequest, "p") || getTag(receipt, "p");
  if (!recipientPubkey) return null;
  const side = sideForReceipt(zapRequest, recipientPubkey, session);
  if (!side) return null;

  const amountMsats = Number(getTag(zapRequest, "amount") || getTag(receipt, "amount") || 0);
  if (!Number.isFinite(amountMsats) || amountMsats <= 0) return null;
  const createdAt = zapRequest.created_at || receipt.created_at;
  if (session.startsAt && createdAt < session.startsAt) return null;
  if (session.endsAt && createdAt > session.endsAt + session.graceSeconds) return null;

  return {
    item: {
      id: receipt.id,
      side,
      senderName: shortKey(zapRequest.pubkey),
      amountSats: Math.floor(amountMsats / 1000),
      comment: zapRequest.content.trim(),
      createdAt
    },
    senderPubkey: zapRequest.pubkey
  };
}

function sideForReceipt(zapRequest: NostrEvent, recipientPubkey: string, session: ZapBattleSession): BattleSide | null {
  const taggedSide = getTag(zapRequest, "zap_live_side");
  if ((taggedSide === "left" || taggedSide === "right") && getTag(zapRequest, "zap_live") === session.id) {
    return taggedSide;
  }
  if (recipientPubkey === session.contestants.left.nostrPubkey) return "left";
  if (recipientPubkey === session.contestants.right.nostrPubkey) return "right";
  return null;
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function shortKey(pubkey: string): string {
  return pubkey.length > 12 ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : pubkey;
}

async function senderNamesForPubkeys(pool: SimplePool, pubkeys: string[]): Promise<Map<string, string>> {
  const uniquePubkeys = Array.from(new Set(pubkeys));
  if (uniquePubkeys.length === 0) return new Map();
  const events = await pool.querySync(readRelays(), {
    kinds: [0],
    authors: uniquePubkeys,
    limit: uniquePubkeys.length
  }, { maxWait: 1800 });
  const names = new Map<string, string>();
  events.forEach((event) => {
    const name = senderNameFromMetadata(event as NostrEvent);
    if (name) names.set(event.pubkey, name);
  });
  return names;
}

async function senderNameForPubkey(pool: SimplePool, pubkey: string): Promise<string | null> {
  const event = await pool.get(readRelays(), {
    kinds: [0],
    authors: [pubkey]
  });
  return event ? senderNameFromMetadata(event as NostrEvent) : null;
}

function senderNameFromMetadata(event: NostrEvent): string | null {
  if (event.kind !== 0 || !verifyEvent(event)) return null;
  try {
    const metadata = JSON.parse(event.content) as { display_name?: unknown; name?: unknown; username?: unknown };
    const name = [metadata.display_name, metadata.name, metadata.username]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return name ? name.trim().slice(0, 80) : null;
  } catch {
    return null;
  }
}

function readRelays(): string[] {
  return relaysFromEnv(process.env.NEXT_PUBLIC_NOSTR_SESSION_RELAYS, process.env.NEXT_PUBLIC_NOSTR_RELAYS);
}
