import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { bech32 } from "@scure/base";

const BOLT11_SIGNATURE_WORDS = 104;
const BOLT11_TIMESTAMP_WORDS = 7;
const DESCRIPTION_HASH_TAG = 23;
const PAYMENT_HASH_TAG = 1;

export type Bolt11InvoiceDetails = {
  amountMsats: number;
  createdAt: number;
  descriptionHash: string;
  invoiceHash: string;
  network: string;
  paymentHash: string;
};

export class ZapInvoiceValidationError extends Error {
  constructor(
    readonly code: "amount_mismatch" | "description_hash_mismatch" | "invalid_invoice",
    message: string
  ) {
    super(message);
    this.name = "ZapInvoiceValidationError";
  }
}

export function inspectBolt11Invoice(invoice: string): Bolt11InvoiceDetails {
  try {
    const decoded = bech32.decode(invoice.trim(), 5000);
    const amount = parseBolt11Amount(decoded.prefix);
    const dataEnd = decoded.words.length - BOLT11_SIGNATURE_WORDS;
    if (dataEnd <= BOLT11_TIMESTAMP_WORDS) throw new Error("BOLT11 data is incomplete.");

    let createdAt = 0;
    for (const word of decoded.words.slice(0, BOLT11_TIMESTAMP_WORDS)) {
      createdAt = createdAt * 32 + word;
    }

    const tags = new Map<number, string[]>();
    for (let index = BOLT11_TIMESTAMP_WORDS; index < dataEnd;) {
      if (index + 3 > dataEnd) throw new Error("BOLT11 tag header is incomplete.");
      const type = decoded.words[index];
      const length = decoded.words[index + 1] * 32 + decoded.words[index + 2];
      index += 3;
      if (index + length > dataEnd) throw new Error("BOLT11 tag data is incomplete.");
      const words = decoded.words.slice(index, index + length);
      index += length;
      if (type !== DESCRIPTION_HASH_TAG && type !== PAYMENT_HASH_TAG) continue;
      const values = tags.get(type) ?? [];
      values.push(wordsToHex(words));
      tags.set(type, values);
    }

    const descriptionHash = readSingleHashTag(tags, DESCRIPTION_HASH_TAG, "description_hash");
    const paymentHash = readSingleHashTag(tags, PAYMENT_HASH_TAG, "payment_hash");
    return {
      amountMsats: amount.amountMsats,
      createdAt,
      descriptionHash,
      invoiceHash: sha256Hex(invoice.trim()),
      network: amount.network,
      paymentHash
    };
  } catch (error) {
    if (error instanceof ZapInvoiceValidationError) throw error;
    throw new ZapInvoiceValidationError(
      "invalid_invoice",
      error instanceof Error ? error.message : "Invalid BOLT11 invoice."
    );
  }
}

export function validateZapInvoice({
  amountMsats,
  invoice,
  zapRequest
}: {
  amountMsats: number;
  invoice: string;
  zapRequest: string;
}): Bolt11InvoiceDetails {
  const details = inspectBolt11Invoice(invoice);
  if (details.amountMsats !== amountMsats) {
    throw new ZapInvoiceValidationError(
      "amount_mismatch",
      `Invoice amount ${details.amountMsats} does not match requested amount ${amountMsats}.`
    );
  }
  const expectedDescriptionHash = sha256Hex(zapRequest);
  if (details.descriptionHash !== expectedDescriptionHash) {
    throw new ZapInvoiceValidationError(
      "description_hash_mismatch",
      "Invoice description hash does not match the signed Zap request."
    );
  }
  return details;
}

export function sha256Hex(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

function parseBolt11Amount(prefix: string): { amountMsats: number; network: string } {
  const match = /^(ln(?:bc|tb|bcrt|sb))(\d+)([munp]?)$/.exec(prefix);
  if (!match) throw new Error("BOLT11 invoice must include a supported network and amount.");
  const [, network, rawAmount, multiplier] = match;
  const amount = BigInt(rawAmount);
  const multiplierMsats = multiplier === "m"
    ? 100_000_000n
    : multiplier === "u"
      ? 100_000n
      : multiplier === "n"
        ? 100n
        : multiplier === "p"
          ? 0n
          : 100_000_000_000n;
  let amountMsats: bigint;
  if (multiplier === "p") {
    if (amount % 10n !== 0n) throw new Error("Pico-BTC amount is smaller than one millisatoshi.");
    amountMsats = amount / 10n;
  } else {
    amountMsats = amount * multiplierMsats;
  }
  if (amountMsats <= 0n || amountMsats > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("BOLT11 amount is outside the supported range.");
  }
  return { amountMsats: Number(amountMsats), network };
}

function readSingleHashTag(tags: Map<number, string[]>, type: number, name: string): string {
  const values = tags.get(type) ?? [];
  if (values.length !== 1 || !/^[0-9a-f]{64}$/.test(values[0])) {
    throw new Error(`BOLT11 ${name} tag is missing or invalid.`);
  }
  return values[0];
}

function wordsToHex(words: number[]): string {
  return bytesToHex(bech32.fromWords(words));
}
