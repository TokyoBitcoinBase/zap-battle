import { v2 as nip44 } from "nostr-tools/nip44";
import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { relaysFromEnv } from "@/src/relays";
import { readServicePrivateKey } from "@/src/server/service-key";
import type { BattleSide } from "@/src/types";

const AUDIT_KIND = 30078;
const AUDIT_TYPE = "zap_battle_invoice_audit";

export type InvoiceAuditRecord = {
  amountMsats: number;
  descriptionHash?: string;
  expectedDescriptionHash: string;
  invoice: string;
  invoiceCreatedAt?: number;
  invoiceHash: string;
  lightningAddress: string;
  paymentHash?: string;
  providerCallbackUrl: string;
  providerNostrPubkey: string;
  recipientPubkey: string;
  recordedAt: number;
  sessionId: string;
  sessionStartsAt: number | null;
  side: BattleSide;
  targetLnurlPayUrl: string;
  validation: "accepted" | "rejected";
  validationError?: string;
  version: 1;
  zapRequest: string;
  zapRequestId: string;
};

export type StoredInvoiceAudit = InvoiceAuditRecord & {
  auditEventId: string;
};

type AuditEvent = {
  content: string;
  created_at: number;
  id: string;
  kind: number;
  pubkey: string;
  sig: string;
  tags: string[][];
};

export async function saveInvoiceAudit(record: InvoiceAuditRecord): Promise<string> {
  const privateKey = requiredServicePrivateKey();
  const pubkey = getPublicKey(privateKey);
  const event = finalizeEvent({
    kind: AUDIT_KIND,
    created_at: record.recordedAt,
    content: encryptInvoiceAudit(record, privateKey),
    tags: [
      ["d", auditDTag(record.zapRequestId, record.invoiceHash)],
      ["type", AUDIT_TYPE],
      ["client", "zap-battle"],
      ["p", pubkey],
      ["t", auditSessionTag(record.sessionId)]
    ]
  }, privateKey);
  const pool = new SimplePool();
  try {
    await publishToAtLeastOneRelay(pool, event, 2200);
    return event.id;
  } finally {
    pool.close(readAuditRelays());
  }
}

export async function listInvoiceAudits(sessionId: string): Promise<StoredInvoiceAudit[]> {
  const privateKey = requiredServicePrivateKey();
  const pubkey = getPublicKey(privateKey);
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(readAuditRelays(), {
      kinds: [AUDIT_KIND],
      authors: [pubkey],
      "#t": [auditSessionTag(sessionId)],
      limit: 500
    }, { maxWait: 2200 });
    const byZapRequestAndInvoice = new Map<string, StoredInvoiceAudit>();
    events.forEach((event) => {
      const auditEvent = event as AuditEvent;
      if (!isInvoiceAuditEvent(auditEvent, pubkey)) return;
      try {
        const record = decryptInvoiceAudit(auditEvent.content, privateKey);
        if (record.sessionId !== sessionId) return;
        const audit = { ...record, auditEventId: auditEvent.id };
        const key = auditRecordKey(record);
        const existing = byZapRequestAndInvoice.get(key);
        if (!existing || record.recordedAt > existing.recordedAt) {
          byZapRequestAndInvoice.set(key, audit);
        }
      } catch {
        // Ignore corrupted or undecryptable audit events.
      }
    });
    return Array.from(byZapRequestAndInvoice.values()).sort((left, right) => right.recordedAt - left.recordedAt);
  } finally {
    pool.close(readAuditRelays());
  }
}

export function encryptInvoiceAudit(record: InvoiceAuditRecord, privateKey: Uint8Array): string {
  const pubkey = getPublicKey(privateKey);
  const conversationKey = nip44.utils.getConversationKey(privateKey, pubkey);
  return nip44.encrypt(JSON.stringify(record), conversationKey);
}

export function decryptInvoiceAudit(content: string, privateKey: Uint8Array): InvoiceAuditRecord {
  const pubkey = getPublicKey(privateKey);
  const conversationKey = nip44.utils.getConversationKey(privateKey, pubkey);
  return normalizeInvoiceAudit(JSON.parse(nip44.decrypt(content, conversationKey)) as unknown);
}

function normalizeInvoiceAudit(value: unknown): InvoiceAuditRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid invoice audit record.");
  const record = value as Partial<InvoiceAuditRecord>;
  if (
    record.version !== 1 ||
    !record.sessionId ||
    (record.side !== "left" && record.side !== "right") ||
    !record.zapRequestId ||
    !record.zapRequest ||
    !record.invoice ||
    !record.invoiceHash ||
    !record.expectedDescriptionHash ||
    !record.lightningAddress ||
    !record.recipientPubkey ||
    !record.targetLnurlPayUrl ||
    !record.providerCallbackUrl ||
    !record.providerNostrPubkey ||
    (record.validation !== "accepted" && record.validation !== "rejected") ||
    typeof record.amountMsats !== "number" ||
    typeof record.recordedAt !== "number"
  ) {
    throw new Error("Invalid invoice audit record.");
  }
  return record as InvoiceAuditRecord;
}

function isInvoiceAuditEvent(event: AuditEvent, pubkey: string): boolean {
  return Boolean(
    event.kind === AUDIT_KIND &&
    event.pubkey === pubkey &&
    event.tags.some((tag) => tag[0] === "type" && tag[1] === AUDIT_TYPE) &&
    verifyEvent(event)
  );
}

function requiredServicePrivateKey(): Uint8Array {
  const privateKey = readServicePrivateKey();
  if (!privateKey) throw new Error("Service signing key is not configured.");
  return privateKey;
}

function auditDTag(zapRequestId: string, invoiceHash: string): string {
  return `zap-battle-invoice-audit:${zapRequestId}:${invoiceHash}`;
}

function auditRecordKey(record: Pick<InvoiceAuditRecord, "invoiceHash" | "zapRequestId">): string {
  return `${record.zapRequestId}:${record.invoiceHash}`;
}

function auditSessionTag(sessionId: string): string {
  return `zap-battle-audit:${sessionId}`;
}

function readAuditRelays(): string[] {
  return relaysFromEnv(process.env.NOSTR_SESSION_RELAYS, process.env.NOSTR_RELAYS);
}

async function publishToAtLeastOneRelay(pool: SimplePool, event: AuditEvent, maxWait: number): Promise<void> {
  const attempts = pool.publish(readAuditRelays(), event, { maxWait });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Invoice audit relay timeout.")), maxWait);
  });
  try {
    await Promise.race([Promise.any(attempts), deadline]);
  } catch {
    throw new Error("Could not save invoice audit to any configured Nostr relay.");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
