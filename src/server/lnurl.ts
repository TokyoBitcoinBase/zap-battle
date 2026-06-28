export { encodeLnurl } from "@/src/lnurl";

export type LnurlPayMetadata = {
  tag: string;
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  commentAllowed?: number;
  allowsNostr?: boolean;
  nostrPubkey?: string;
};

export function resolveLnurlPayUrl(lightningAddress: string): string {
  const value = lightningAddress.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const [name, domain] = value.split("@");
  if (!name || !domain) throw new Error("Invalid Lightning Address.");
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

export async function fetchLnurlPayMetadata(lightningAddressOrUrl: string): Promise<LnurlPayMetadata> {
  const response = await fetch(resolveLnurlPayUrl(lightningAddressOrUrl), {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Failed to fetch LNURL Pay metadata.");
  const json = await response.json() as Partial<LnurlPayMetadata> & { status?: string; reason?: string };
  if (json.status === "ERROR") throw new Error(json.reason || "LNURL Pay metadata returned an error.");
  if (json.tag !== "payRequest") throw new Error("LNURL endpoint is not a payRequest.");
  if (!json.callback || typeof json.callback !== "string") throw new Error("LNURL Pay callback is missing.");
  if (typeof json.minSendable !== "number" || typeof json.maxSendable !== "number") throw new Error("LNURL Pay amount range is missing.");
  if (!json.metadata || typeof json.metadata !== "string") throw new Error("LNURL Pay metadata is missing.");
  return {
    tag: json.tag,
    callback: json.callback,
    minSendable: json.minSendable,
    maxSendable: json.maxSendable,
    metadata: json.metadata,
    commentAllowed: typeof json.commentAllowed === "number" ? json.commentAllowed : undefined,
    allowsNostr: json.allowsNostr === true,
    nostrPubkey: typeof json.nostrPubkey === "string" ? json.nostrPubkey : undefined
  };
}

export function siteUrlFromRequest(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(/:$/, "");
    return `${forwardedProto}://${forwardedHost}`;
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
