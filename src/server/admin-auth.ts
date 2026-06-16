import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected) return null;
  const provided = request.headers.get("x-admin-token") || request.nextUrl.searchParams.get("admin") || "";
  if (provided === expected) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
