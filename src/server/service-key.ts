import { bech32 } from "@scure/base";
import { getPublicKey } from "nostr-tools/pure";

export function readServicePrivateKey(): Uint8Array | null {
  const hex = process.env.SERVICE_PRIVATE_KEY?.trim();
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return hexToBytes(hex);

  const nsec = process.env.SERVICE_NSEC?.trim();
  if (!nsec) return null;
  return nsecToBytes(nsec);
}

export function readServicePubkey(): string | null {
  const privateKey = readServicePrivateKey();
  return privateKey ? getPublicKey(privateKey) : null;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function nsecToBytes(nsec: string): Uint8Array | null {
  try {
    const decoded = bech32.decode(nsec, 5000);
    if (decoded.prefix !== "nsec") return null;

    const bytes = new Uint8Array(bech32.fromWords(decoded.words));
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}
