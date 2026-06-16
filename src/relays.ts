export const BLOGSTR_DEFAULT_RELAYS = [
  "wss://yabu.me",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nos.lol"
];

export const BLOGSTR_ZAP_REQUEST_RELAYS = [
  "wss://yabu.me",
  "wss://relay.primal.net",
  "wss://nos.lol"
];

export function relaysFromEnv(...values: Array<string | undefined>): string[] {
  const raw = values.find((value) => value?.trim());
  if (!raw) return BLOGSTR_DEFAULT_RELAYS;
  const relays = raw.split(",").map((relay) => relay.trim()).filter(Boolean);
  return relays.length > 0 ? relays : BLOGSTR_DEFAULT_RELAYS;
}

export function zapRequestRelaysFromEnv(...values: Array<string | undefined>): string[] {
  const raw = values.find((value) => value?.trim());
  if (!raw) return BLOGSTR_ZAP_REQUEST_RELAYS;
  const relays = raw.split(",").map((relay) => relay.trim()).filter(Boolean);
  return relays.length > 0 ? relays.slice(0, 3) : BLOGSTR_ZAP_REQUEST_RELAYS;
}
