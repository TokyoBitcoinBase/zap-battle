type BrowserStorageArea = "local" | "session";

const volatileStorage = new Map<string, string>();

export function readBrowserStorage(
  key: string,
  areas: BrowserStorageArea[] = ["session", "local"]
): string | null {
  for (const area of areas) {
    try {
      const value = storageFor(area)?.getItem(key);
      if (value) return value;
    } catch {
      // Browser privacy settings or an embedded context can deny storage access.
    }
  }
  return volatileStorage.get(key) ?? null;
}

export function writeBrowserStorage(
  key: string,
  value: string,
  areas: BrowserStorageArea[] = ["session", "local"]
): boolean {
  volatileStorage.set(key, value);
  let wroteValue = false;
  for (const area of areas) {
    try {
      const storage = storageFor(area);
      if (!storage) continue;
      storage.setItem(key, value);
      wroteValue = true;
    } catch {
      // Keep the page usable when one or both storage areas are unavailable.
    }
  }
  return wroteValue;
}

export function removeBrowserStorage(
  key: string,
  areas: BrowserStorageArea[] = ["session", "local"]
): void {
  volatileStorage.delete(key);
  for (const area of areas) {
    try {
      storageFor(area)?.removeItem(key);
    } catch {
      // Removing optional browser state should never break the current action.
    }
  }
}

function storageFor(area: BrowserStorageArea): Storage | null {
  if (typeof window === "undefined") return null;
  return area === "session" ? window.sessionStorage : window.localStorage;
}
