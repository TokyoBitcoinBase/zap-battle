import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptInvoiceAudit,
  encryptInvoiceAudit,
  type InvoiceAuditRecord
} from "../src/server/invoice-audit-store";

const privateKey = new Uint8Array(32).fill(1);

const record: InvoiceAuditRecord = {
  amountMsats: 1_000,
  descriptionHash: "ca640f004a9a5bab148587368cbe6d4365d4e7bd8e660099ac5e8ddbdf168897",
  expectedDescriptionHash: "ca640f004a9a5bab148587368cbe6d4365d4e7bd8e660099ac5e8ddbdf168897",
  invoice: "lnbc10n1auditfixture",
  invoiceCreatedAt: 1_788_053_266,
  invoiceHash: "1".repeat(64),
  lightningAddress: "blue@example.com",
  paymentHash: "974a8b07f507082d7be4f6fe91159f80d774b7b814b781758e519740a2815b7b",
  providerCallbackUrl: "https://example.com/lnurl/callback",
  providerNostrPubkey: "be1d89794bf92de5dd64c1e60f6a2c70c140abac9932418fee30c5c637fe9479",
  recipientPubkey: "76de938c1db10fb929709256bbd98b87320139a5352b4f845df042a7558d5b59",
  recordedAt: 1_788_053_267,
  sessionId: "zap-battle-3-beginner",
  sessionStartsAt: 1_788_053_234,
  side: "left",
  targetLnurlPayUrl: "https://example.com/.well-known/lnurlp/blue",
  validation: "accepted",
  version: 1,
  zapRequest: "{\"kind\":9734,\"id\":\"fixture\"}",
  zapRequestId: "8e4aea882c747593931aa2bbe31d7c17bdde44ddeb276123ab183e2522c2e9e4"
};

test("NIP-44 audit encryption round-trips without exposing invoice data", () => {
  const encrypted = encryptInvoiceAudit(record, privateKey);

  assert.ok(!encrypted.includes(record.invoice));
  assert.ok(!encrypted.includes(record.lightningAddress));
  assert.deepEqual(decryptInvoiceAudit(encrypted, privateKey), record);
});

test("NIP-44 audit data cannot be decrypted with a different service key", () => {
  const encrypted = encryptInvoiceAudit(record, privateKey);
  const otherPrivateKey = new Uint8Array(32).fill(2);

  assert.throws(() => decryptInvoiceAudit(encrypted, otherPrivateKey));
});
