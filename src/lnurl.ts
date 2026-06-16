import { bech32 } from "@scure/base";

export function encodeLnurl(url: string): string {
  const bytes = new TextEncoder().encode(url);
  const words = bech32.toWords(bytes);
  return bech32.encode("lnurl", words, 2000).toUpperCase();
}
