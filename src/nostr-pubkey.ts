import { bech32 } from "@scure/base";

const HEX_PUBKEY_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeNostrPubkey(value: string | undefined): string | undefined {
  const pubkey = value?.trim();
  if (!pubkey) return undefined;
  if (HEX_PUBKEY_PATTERN.test(pubkey)) return pubkey.toLowerCase();
  if (!pubkey.toLowerCase().startsWith("npub1")) return undefined;

  try {
    const decoded = bech32.decode(pubkey, false);
    if (decoded.prefix !== "npub") return undefined;
    const bytes = bech32.fromWords(decoded.words);
    if (bytes.length !== 32) return undefined;
    return bytesToHex(bytes);
  } catch {
    return undefined;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
