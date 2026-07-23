import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { listSessions } from "@/src/server/session-store";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const sessions = await listSessions();
    return noStoreJson({ sessions });
  } catch {
    return noStoreJson({ error: "session_relays_unavailable" }, { status: 503 });
  }
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return response;
}
