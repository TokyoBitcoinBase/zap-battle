import { createHmac, timingSafeEqual } from "node:crypto";
import type { BattleSide } from "@/src/types";

export type ZapLiveTokenPayload = {
  sessionId: string;
  side: BattleSide;
  recipientPubkey?: string | undefined;
  lightningAddress: string;
  displayName: string;
  relays: string[];
  expiresAt: number;
};

export function signZapLiveToken(payload: ZapLiveTokenPayload): string {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = signBody(body);
  return `${body}.${signature}`;
}

export function verifyZapLiveToken(token: string): ZapLiveTokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Invalid token.");
  const expected = signBody(body);
  if (!safeEqual(signature, expected)) throw new Error("Invalid token signature.");
  const payload = JSON.parse(base64UrlDecode(body)) as ZapLiveTokenPayload;
  if (payload.expiresAt < currentSeconds()) throw new Error("Token expired.");
  if (payload.side !== "left" && payload.side !== "right") throw new Error("Invalid side.");
  if (!payload.sessionId || !payload.lightningAddress || !payload.displayName) throw new Error("Invalid token payload.");
  return payload;
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
