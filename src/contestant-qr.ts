import QRCode from "qrcode";
import { encodeLnurl } from "@/src/lnurl";
import type { BattleSide, Contestant } from "@/src/types";

type QrContestant = Pick<Contestant, "side" | "lightningAddress">;
export type ContestantQrLoader = (sessionId: string, contestant: QrContestant) => Promise<string>;

// Keep at most one QR per side for the lifetime of the display, including while
// the final result replaces the contestant stage. Run times never identify a QR.
export function createContestantQrLoader(): ContestantQrLoader {
  const cache = new Map<BattleSide, { key: string; dataUrl: Promise<string> }>();
  return (sessionId, contestant) => {
    const key = JSON.stringify([sessionId, contestant.lightningAddress.trim()]);
    const cached = cache.get(contestant.side);
    if (cached?.key === key) return cached.dataUrl;

    const entry = {
      key,
      dataUrl: createQr(sessionId, contestant).catch(error => {
        if (cache.get(contestant.side) === entry) cache.delete(contestant.side);
        throw error;
      })
    };
    cache.set(contestant.side, entry);
    return entry.dataUrl;
  };
}

async function createQr(sessionId: string, contestant: QrContestant): Promise<string> {
  if (!contestant.lightningAddress.trim()) throw new Error("Lightning Address not set.");
  const response = await fetch("/api/zap-live/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, side: contestant.side })
  });
  const json = await response.json().catch(() => ({})) as { lnurlPayUrl?: string; reason?: string; error?: string };
  if (!response.ok) throw new Error(json.reason || json.error || "Failed to create LNURL token.");
  if (!json.lnurlPayUrl) throw new Error("LNURL token response is missing lnurlPayUrl.");
  return QRCode.toDataURL(`lightning:${encodeLnurl(json.lnurlPayUrl)}`, {
    errorCorrectionLevel: "L",
    margin: 2,
    width: 640,
    color: { dark: "#050505", light: "#ffffff" }
  });
}
