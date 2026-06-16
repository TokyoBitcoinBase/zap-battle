import { createHmac, timingSafeEqual } from "node:crypto";
import type { BattleSide } from "@/src/types";

export type ZapLiveTokenPayload = {
  sessionId: string;
  side: BattleSide;
  recipientPubkey?: string | undefined;
  lightningAddress?: string | undefined;
  displayName?: string | undefined;
  relays?: string[] | undefined;
  expiresAt: number;
};

type CompactZapLiveTokenPayload = {
  i: string;
  s: "l" | "r";
  p?: string | undefined;
  a?: string | undefined;
  n?: string | undefined;
  r?: string[] | undefined;
  e: number;
};

export function signZapLiveToken(payload: ZapLiveTokenPayload): string {
  const body = base64UrlEncode(JSON.stringify(compactPayload(payload)));
  const signature = signBody(body);
  return `${body}.${signature}`;
}

export function verifyZapLiveToken(token: string): ZapLiveTokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Invalid token.");
  const expected = signBody(body);
  if (!safeEqual(signature, expected)) throw new Error("Invalid token signature.");
  const payload = expandPayload(JSON.parse(base64UrlDecode(body)) as Partial<ZapLiveTokenPayload> | CompactZapLiveTokenPayload);
  if (payload.expiresAt < currentSeconds()) throw new Error("Token expired.");
  if (payload.side !== "left" && payload.side !== "right") throw new Error("Invalid side.");
  if (!payload.sessionId) throw new Error("Invalid token payload.");
  return payload;
}

function compactPayload(payload: ZapLiveTokenPayload): CompactZapLiveTokenPayload {
  const compact: CompactZapLiveTokenPayload = {
    i: payload.sessionId,
    s: payload.side === "left" ? "l" : "r",
    e: payload.expiresAt
  };
  if (payload.recipientPubkey) compact.p = payload.recipientPubkey;
  if (payload.lightningAddress) compact.a = payload.lightningAddress;
  if (payload.displayName) compact.n = payload.displayName;
  if (payload.relays) compact.r = payload.relays;
  return compact;
}

function expandPayload(payload: Partial<ZapLiveTokenPayload> | CompactZapLiveTokenPayload): ZapLiveTokenPayload {
  if ("i" in payload) {
    return {
      sessionId: payload.i,
      side: payload.s === "l" ? "left" : "right",
      recipientPubkey: payload.p,
      lightningAddress: payload.a,
      displayName: payload.n,
      relays: payload.r,
      expiresAt: payload.e
    };
  }

  return payload as ZapLiveTokenPayload;
}

function signBody(body: string): string {
  return createHmac("sha256", tokenSecret()).update(body).digest("base64url");
}

function tokenSecret(): string {
  return process.env.TOKEN_SECRET || "development-token-secret-change-before-production";
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function currentSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
