import { ANALYSIS_VERSION, type Settings } from "./model";
import { resolveProvider, type Provider } from "./providers";

// Subset of browser.storage.local used by the background; injectable for tests.
export type KeyStore = {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

// Keys are bound to their provider so a provider switch never sends one provider's key to another.
export const apiKeyFor = (provider: Provider) => `apiKey:${provider}`;
export const attemptKey = (contextKey: string) => `auto:${contextKey}:a${ANALYSIS_VERSION}`;

export async function readSettings(store: KeyStore): Promise<Settings> {
  const data = await store.get(["enabled", "mode", "provider"]);
  const provider = resolveProvider(data.provider);
  const key = (await store.get(apiKeyFor(provider)))[apiKeyFor(provider)];
  return {
    enabled: data.enabled !== false,
    apiKey: typeof key === "string" ? key : "",
    provider,
    mode: data.mode === "auto" ? "auto" : "manual",
  };
}

export async function saveKey(store: KeyStore, provider: Provider, key: string): Promise<void> {
  await store.set({ [apiKeyFor(provider)]: key, provider });
}

export async function removeKey(store: KeyStore): Promise<void> {
  await store.remove(apiKeyFor((await readSettings(store)).provider));
}

// Forget must not turn into a paid automatic re-analysis of the same template: record an attempt
// so shouldAutoAnalyze() declines. A successful manual Analyze removes the marker again.
export async function suppressAuto(store: KeyStore, contextKey: string): Promise<void> {
  await store.set({ [attemptKey(contextKey)]: { startedAt: Date.now(), error: null } });
}

export async function autoAttempted(store: KeyStore, contextKey: string): Promise<boolean> {
  return !!(await store.get(attemptKey(contextKey)))[attemptKey(contextKey)];
}

// Excluded sites: hostnames (one per entry) that Zen never analyzes or modifies. An entry matches
// the host itself and every subdomain, so "example.com" also covers "www.example.com".
export function normalizeHosts(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const hosts = raw
    .map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, "")
        .replace(/[/:].*$/, ""),
    )
    .filter((h) => /^[a-z0-9.-]+$/.test(h) && h.length <= 253);
  return [...new Set(hosts)];
}

export function isExcluded(host: string, excluded: string[]): boolean {
  const h = host.toLowerCase();
  return excluded.some((e) => h === e || h.endsWith(`.${e}`));
}

export async function readExcludedHosts(store: KeyStore): Promise<string[]> {
  const value = (await store.get("excludedHosts")).excludedHosts;
  return Array.isArray(value) ? normalizeHosts(value.filter((v) => typeof v === "string")) : [];
}

export async function writeExcludedHosts(store: KeyStore, hosts: string[]): Promise<void> {
  await store.set({ excludedHosts: normalizeHosts(hosts) });
}
