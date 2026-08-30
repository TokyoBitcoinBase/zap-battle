import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/src/server/admin-auth";
import { listInvoiceAudits } from "@/src/server/invoice-audit-store";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { sessionId } = await context.params;
  try {
    const audits = await listInvoiceAudits(sessionId);
    return noStoreJson({ audits });
  } catch {
    return noStoreJson({ error: "invoice_audits_unavailable" }, { status: 503 });
  }
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
  return response;
}
