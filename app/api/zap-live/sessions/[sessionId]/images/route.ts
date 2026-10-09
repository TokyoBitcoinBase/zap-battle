import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { optimizeBattleImage } from "@/src/server/battle-image";
import { requireAdmin } from "@/src/server/admin-auth";
import { lookupSession } from "@/src/server/session-store";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!process.env.ADMIN_TOKEN?.trim()) return NextResponse.json({ error: "Admin authentication is not configured." }, { status: 503 });
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return NextResponse.json({ error: "Vercel Blob is not connected. Ask the administrator to connect a public Blob store." }, { status: 503 });
  const { sessionId } = await context.params;
  const lookup = await lookupSession(sessionId);
  if (lookup.state !== "found") return NextResponse.json({ error: "Battle is unavailable." }, { status: lookup.state === "unavailable" ? 503 : 404 });
  const size = Number(request.headers.get("content-length"));
  if (size > 2 * 1024 * 1024) return NextResponse.json({ error: "Image must be 2 MB or smaller." }, { status: 413 });
  // Read a bounded raw body instead of buffering an unbounded multipart request.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Image is required." }, { status: 400 });
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.length;
    if (length > 2 * 1024 * 1024) { await reader.cancel(); return NextResponse.json({ error: "Image must be 2 MB or smaller." }, { status: 413 }); }
    chunks.push(part.value);
  }
  let image: Buffer;
  try {
    image = await optimizeBattleImage(Buffer.concat(chunks));
  } catch { return NextResponse.json({ error: "Choose a valid JPEG, PNG or WebP image (up to 24 megapixels)." }, { status: 400 }); }
  try {
    const blob = await put(`battles/${encodeURIComponent(sessionId)}/${crypto.randomUUID()}.webp`, image, { access: "public", contentType: "image/webp", addRandomSuffix: false });
    return NextResponse.json({ url: blob.url, size: image.length });
  } catch { return NextResponse.json({ error: "Image upload failed. Check the Blob connection and try again." }, { status: 503 }); }
}
