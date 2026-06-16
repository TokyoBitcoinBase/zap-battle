import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "zap-battle",
    time: new Date().toISOString()
  });
}
