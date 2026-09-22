import { z } from "zod";
import { ANALYSIS_VERSION, profileSchema, type Settings } from "./model";
import { providers, resolveProvider, type Provider } from "./providers";

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

// Backup file: every setting, the API keys and saved templates. Transient auto-analysis markers
// (auto:*) stay out so a restore neither blocks nor re-triggers paid analysis.
// scripts/zen-settings.sh reads and writes the same format.
const backupSchema = z.object({
  format: z.literal("zen-settings"),
  version: z.literal(1),
  data: z.record(z.string(), z.unknown()),
});

export function toBackup(all: Record<string, unknown>) {
  return {
    format: "zen-settings",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(Object.entries(all).filter(([key]) => !key.startsWith("auto:"))),
  };
}

// Validates every known key; unknown keys are dropped. Throws on anything malformed.
export function parseBackup(raw: unknown): Record<string, unknown> {
  const items: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(backupSchema.parse(raw).data)) {
    if (key === "enabled") items[key] = z.boolean().parse(value);
    else if (key === "mode") items[key] = z.enum(["manual", "auto"]).parse(value);
    else if (key === "provider") items[key] = z.enum(providers).parse(value);
    else if (key === "excludedHosts")
      items[key] = normalizeHosts(z.array(z.string().max(253)).max(500).parse(value));
    else if (key.startsWith("apiKey:")) {
      z.enum(providers).parse(key.slice("apiKey:".length));
      items[key] = z.string().trim().min(1).max(1000).parse(value);
    } else if (key.startsWith("profile:")) {
      const profile = profileSchema.parse(value);
      if (key !== `profile:${profile.key}`) throw new Error(`Backup entry ${key} is inconsistent.`);
      items[key] = profile;
    }
  }
  return items;
}
