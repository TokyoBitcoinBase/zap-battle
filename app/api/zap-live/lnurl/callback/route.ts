import { NextRequest, NextResponse } from "next/server";
import { finalizeEvent } from "nostr-tools/pure";
import { encodeLnurl } from "@/src/lnurl";
import {
  inspectBolt11Invoice,
  sha256Hex,
  validateZapInvoice,
  ZapInvoiceValidationError
} from "@/src/server/bolt11-invoice";
import { fetchLnurlPayMetadata, resolveLnurlPayUrl } from "@/src/server/lnurl";
import { verifyZapLiveToken } from "@/src/server/lnurl-token";
import { saveInvoiceAudit, type InvoiceAuditRecord } from "@/src/server/invoice-audit-store";
import { readServicePrivateKey, readServicePubkey } from "@/src/server/service-key";
import { ensureSession } from "@/src/server/session-store";
import { zapRequestRelaysFromEnv } from "@/src/relays";
import type { BattleSide } from "@/src/types";

type ZapLiveTarget = {
  sessionId: string;
  side: BattleSide;
};

export async function GET(request: NextRequest) {
  const amount = Number(request.nextUrl.searchParams.get("amount") ?? 0);
  const comment = (request.nextUrl.searchParams.get("comment") ?? "").slice(0, 120);
  try {
    const target = readZapLiveTarget(request);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ status: "ERROR", reason: "Invalid amount." }, { status: 400 });
    }
    const session = await ensureSession(target.sessionId);
    if (session.status !== "draft" && session.status !== "live") {
      return NextResponse.json({ status: "ERROR", reason: "This battle is not live." }, { status: 409 });
    }
    const contestant = session.contestants[target.side];
    const lightningAddress = contestant.lightningAddress;
    const recipientPubkey = contestant.nostrPubkey;
    if (!recipientPubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Recipient Nostr pubkey is required." }, { status: 400 });
    }
    const servicePrivateKey = readServicePrivateKey();
    const servicePubkey = readServicePubkey();
    if (!servicePrivateKey || !servicePubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Service signing key is not configured." }, { status: 500 });
    }

    const targetLnurlPayUrl = resolveLnurlPayUrl(lightningAddress);
    const targetMetadata = await fetchLnurlPayMetadata(targetLnurlPayUrl);
    if (targetMetadata.allowsNostr !== true || !targetMetadata.nostrPubkey) {
      return NextResponse.json({ status: "ERROR", reason: "Recipient wallet does not support Nostr zaps." }, { status: 400 });
    }
    if (amount < targetMetadata.minSendable || amount > targetMetadata.maxSendable) {
      return NextResponse.json({ status: "ERROR", reason: "Amount is outside recipient wallet range." }, { status: 400 });
    }

    const amountMsats = amount;
    const zapRequest = finalizeEvent({
      kind: 9734,
      created_at: currentSeconds(),
      content: comment,
      tags: [
        ["relays", ...readPublicRelays()],
        ["amount", String(amountMsats)],
        ["lnurl", encodeLnurl(targetLnurlPayUrl)],
        ["p", recipientPubkey],
        ["zap_live", target.sessionId],
        ["zap_live_side", target.side],
        ...(session.status === "live" && session.startsAt ? [["zap_live_starts_at", String(session.startsAt)]] : []),
        ["client", "zap-battle"]
      ]
    }, servicePrivateKey);
    const zapRequestJson = JSON.stringify(zapRequest);

    const callbackUrl = new URL(targetMetadata.callback);
    callbackUrl.searchParams.set("amount", String(amountMsats));
    callbackUrl.searchParams.set("nostr", zapRequestJson);
    callbackUrl.searchParams.set("lnurl", encodeLnurl(targetLnurlPayUrl));
    if (comment) callbackUrl.searchParams.set("comment", comment.slice(0, targetMetadata.commentAllowed ?? 0));

    const invoiceResponse = await fetch(callbackUrl, {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const rawInvoiceJson = await invoiceResponse.json().catch(() => ({}));
    const invoiceJson = isRecord(rawInvoiceJson) ? rawInvoiceJson : {};
    if (!invoiceResponse.ok || invoiceJson.status === "ERROR") {
      return NextResponse.json(invoiceJson, { status: invoiceResponse.ok ? 200 : invoiceResponse.status });
    }
    const invoice = typeof invoiceJson.pr === "string" ? invoiceJson.pr.trim() : "";
    if (!invoice) {
      return NextResponse.json({ status: "ERROR", reason: "Recipient wallet did not return a Lightning invoice." }, { status: 502 });
    }

    const auditBase = {
      amountMsats,
      expectedDescriptionHash: sha256Hex(zapRequestJson),
      invoice,
      invoiceHash: sha256Hex(invoice),
      lightningAddress,
      providerCallbackUrl: targetMetadata.callback,
      providerNostrPubkey: targetMetadata.nostrPubkey,
      recipientPubkey,
      recordedAt: currentSeconds(),
      sessionId: target.sessionId,
      sessionStartsAt: session.startsAt,
      side: target.side,
      targetLnurlPayUrl,
      version: 1 as const,
      zapRequest: zapRequestJson,
      zapRequestId: zapRequest.id
    };

    let details;
    try {
      details = validateZapInvoice({ amountMsats, invoice, zapRequest: zapRequestJson });
    } catch (error) {
      const validationError = invoiceValidationMessage(error);
      const inspectedInvoice = safeInspectInvoice(invoice);
      const rejectedAudit: InvoiceAuditRecord = {
        ...auditBase,
        ...(inspectedInvoice ? {
          descriptionHash: inspectedInvoice.descriptionHash,
          invoiceCreatedAt: inspectedInvoice.createdAt,
          paymentHash: inspectedInvoice.paymentHash
        } : {}),
        validation: "rejected",
        validationError
      };
      try {
        await saveInvoiceAudit(rejectedAudit);
      } catch (auditError) {
        reportAuditFailure(auditBase, auditError);
      }
      return NextResponse.json({ status: "ERROR", reason: validationError }, { status: 502 });
    }

    try {
      await saveInvoiceAudit({
        ...auditBase,
        descriptionHash: details.descriptionHash,
        invoiceCreatedAt: details.createdAt,
        paymentHash: details.paymentHash,
        validation: "accepted"
      });
    } catch (auditError) {
      // A temporary audit-relay outage must not stop an otherwise valid Zap.
      reportAuditFailure(auditBase, auditError);
    }

    return NextResponse.json(invoiceJson);
  } catch (error) {
    return NextResponse.json({
      status: "ERROR",
      reason: error instanceof Error ? error.message : "Invalid token."
    }, { status: 400 });
  }
}

function safeInspectInvoice(invoice: string) {
  try {
    return inspectBolt11Invoice(invoice);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function reportAuditFailure(
  audit: Pick<InvoiceAuditRecord, "invoiceHash" | "sessionId" | "side" | "zapRequestId">,
  error: unknown
): void {
  console.error("Could not persist encrypted Zap invoice audit.", {
    invoiceHash: audit.invoiceHash,
    sessionId: audit.sessionId,
    side: audit.side,
    zapRequestId: audit.zapRequestId,
    error: error instanceof Error ? error.message : "unknown_error"
  });
}

function invoiceValidationMessage(error: unknown): string {
  if (error instanceof ZapInvoiceValidationError) {
    if (error.code === "amount_mismatch") return "Recipient invoice amount does not match the requested Zap amount.";
    if (error.code === "description_hash_mismatch") return "Recipient invoice is not bound to the signed Zap request.";
  }
  return "Recipient wallet returned an invalid Zap invoice.";
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function readZapLiveTarget(request: NextRequest): ZapLiveTarget {
  const token = request.nextUrl.searchParams.get("t") ?? request.nextUrl.searchParams.get("token") ?? "";
  if (token) {
    const payload = verifyZapLiveToken(token);
    return {
      sessionId: payload.sessionId,
      side: payload.side
    };
  }

  const sessionId = request.nextUrl.searchParams.get("s") ?? request.nextUrl.searchParams.get("sessionId") ?? "";
  const side = request.nextUrl.searchParams.get("side");
  if (!sessionId || (side !== "left" && side !== "right")) {
    throw new Error("Invalid QR code.");
  }
  return { sessionId, side };
}

function readPublicRelays(): string[] {
  return zapRequestRelaysFromEnv(process.env.NEXT_PUBLIC_ZAP_REQUEST_RELAYS, process.env.ZAP_REQUEST_RELAYS);
}
