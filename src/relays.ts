export const BLOGSTR_DEFAULT_RELAYS = [
  "wss://yabu.me",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nos.lol"
];

export const BLOGSTR_ZAP_REQUEST_RELAYS = [
  "wss://yabu.me",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nos.lol"
];

export function relaysFromEnv(...values: Array<string | undefined>): string[] {
  const relays = firstConfiguredRelays(values);
  return relays.length > 0 ? relays : BLOGSTR_DEFAULT_RELAYS;
}

export function zapRequestRelaysFromEnv(...values: Array<string | undefined>): string[] {
  return uniqueRelays([
    ...firstConfiguredRelays(values),
    ...BLOGSTR_ZAP_REQUEST_RELAYS
  ]).slice(0, 6);
}

export function receiptRelaysFromEnv(...values: Array<string | undefined>): string[] {
  return uniqueRelays([
    ...values.flatMap(parseRelays),
    ...BLOGSTR_DEFAULT_RELAYS,
    ...BLOGSTR_ZAP_REQUEST_RELAYS
  ]);
}

function firstConfiguredRelays(values: Array<string | undefined>): string[] {
  const raw = values.find((value) => value?.trim());
  return parseRelays(raw);
}

function parseRelays(raw: string | undefined): string[] {
  return raw?.split(",").map((relay) => relay.trim()).filter(Boolean) ?? [];
}

function uniqueRelays(relays: string[]): string[] {
  return Array.from(new Set(relays));
}
