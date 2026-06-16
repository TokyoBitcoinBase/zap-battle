import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { relaysFromEnv } from "@/src/relays";
import type { BattleSide, Contestant } from "@/src/types";

const TEMP_KEY_PREFIX = "zap-battle:temporary-profile";

type TemporaryProfileRecord = {
  pubkey: string;
  secretKey: string;
};

export async function createTemporaryProfile({
  sessionId,
  contestant
}: {
  sessionId: string;
  contestant: Contestant;
}): Promise<{ pubkey: string }> {
  const existing = readTemporaryProfile(sessionId, contestant.side);
  const secretKey = existing ? hexToBytes(existing.secretKey) : generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const metadata = {
    name: normalizeProfileName(contestant.displayName),
    display_name: contestant.displayName.trim(),
    lud16: contestant.lightningAddress.trim(),
    ...(contestant.profileImageUrl?.trim() ? { picture: contestant.profileImageUrl.trim() } : {})
  };
  await publishMetadata(secretKey, metadata);
  writeTemporaryProfile(sessionId, contestant.side, {
    pubkey,
    secretKey: bytesToHex(secretKey)
  });
  return { pubkey };
}

export async function cleanupTemporaryProfile({
  sessionId,
  side,
  expectedPubkey
}: {
  sessionId: string;
  side: BattleSide;
  expectedPubkey?: string | undefined;
}): Promise<"cleaned" | "missing" | "mismatch"> {
  const stored = readTemporaryProfile(sessionId, side);
  if (!stored) return "missing";
  if (expectedPubkey && stored.pubkey !== expectedPubkey) return "mismatch";
  await publishMetadata(hexToBytes(stored.secretKey), {});
  removeTemporaryProfile(sessionId, side);
  return "cleaned";
}

function publishMetadata(secretKey: Uint8Array, metadata: Record<string, unknown>): Promise<void> {
  const event = finalizeEvent({
    kind: 0,
    created_at: currentSeconds(),
    content: JSON.stringify(metadata),
    tags: []
  }, secretKey);
  const pool = new SimplePool();
  return Promise.any(pool.publish(readRelays(), event))
    .then(() => undefined)
    .finally(() => pool.close(readRelays()));
}

function readTemporaryProfile(sessionId: string, side: BattleSide): TemporaryProfileRecord | null {
  try {
    const raw = localStorage.getItem(storageKey(sessionId, side));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TemporaryProfileRecord>;
    if (!parsed.pubkey || !/^[0-9a-f]{64}$/i.test(parsed.pubkey)) return null;
    if (!parsed.secretKey || !/^[0-9a-f]{64}$/i.test(parsed.secretKey)) return null;
    return {
      pubkey: parsed.pubkey.toLowerCase(),
      secretKey: parsed.secretKey.toLowerCase()
    };
  } catch {
    return null;
  }
}

function writeTemporaryProfile(sessionId: string, side: BattleSide, record: TemporaryProfileRecord): void {
  localStorage.setItem(storageKey(sessionId, side), JSON.stringify(record));
}

function removeTemporaryProfile(sessionId: string, side: BattleSide): void {
  localStorage.removeItem(storageKey(sessionId, side));
}

function storageKey(sessionId: string, side: BattleSide): string {
  return `${TEMP_KEY_PREFIX}:${sessionId}:${side}`;
}

function readRelays(): string[] {
  return relaysFromEnv(process.env.NEXT_PUBLIC_NOSTR_SESSION_RELAYS, process.env.NEXT_PUBLIC_NOSTR_RELAYS);
}

function normalizeProfileName(displayName: string): string {
  const normalized = displayName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "zap_battle_guest";
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
