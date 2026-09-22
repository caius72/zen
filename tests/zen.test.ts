import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { collapseTargets, collectCandidates } from "../lib/dom";

import { shouldAutoAnalyze } from "../lib/model";
import {
  apiKeyFor,
  autoAttempted,
  readSettings,
  removeKey,
  saveKey,
  suppressAuto,
  isExcluded,
  normalizeHosts,
  readExcludedHosts,
  writeExcludedHosts,
  type KeyStore,
} from "../lib/settings";

// In-memory stand-in for browser.storage.local with the same get/set/remove contract.
function memoryStore(): KeyStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}

test("keys are bound to providers: switching provider never reuses another provider's key", async () => {
  const store = memoryStore();
  await saveKey(store, "openrouter", "synthetic-test-key");
  let config = await readSettings(store);
  assert.equal(config.provider, "openrouter");
  assert.equal(config.apiKey, "synthetic-test-key");
  await store.set({ provider: "vercel" });
  config = await readSettings(store);
  assert.equal(config.provider, "vercel");
  assert.equal(config.apiKey, "", "Vercel has no key; analyze() refuses on empty apiKey");
  assert.equal(store.data.get(apiKeyFor("openrouter")), "synthetic-test-key");
  await removeKey(store);
  assert.equal(
    store.data.get(apiKeyFor("openrouter")),
    "synthetic-test-key",
    "only the selected provider's key is removed",
  );
  await store.set({ provider: "openrouter" });
  await removeKey(store);
  assert.equal((await readSettings(store)).apiKey, "");
  assert.ok(![...store.data.keys()].includes("apiKey"), "legacy shared apiKey is never written");
});

test("Forget suppresses automatic re-analysis of the template until a manual analysis succeeds", async () => {
  const store = memoryStore();
  await saveKey(store, "openrouter", "synthetic-test-key");
  await store.set({ mode: "auto" });
  const config = await readSettings(store);
  // Fresh tab, no profile, no attempt: auto mode would analyze.
  assert.equal(shouldAutoAnalyze(config, null, await autoAttempted(store, "tpl")), true);
  await suppressAuto(store, "tpl");
  assert.equal(shouldAutoAnalyze(config, null, await autoAttempted(store, "tpl")), false);
  // A successful manual analysis removes the marker (background does store.remove(attempt)).
  await store.remove("auto:tpl:a2");
  assert.equal(shouldAutoAnalyze(config, null, await autoAttempted(store, "tpl")), true);
});

test("wrappers with ::before/::after generated content are not collapsed with their ad child", () => {
  const dom = new JSDOM(
    '<style>.label::before{content:"Sponsored by"}</style><div class="label"><div class="ad">Advertisement</div></div><div class="plain"><div class="ad2">Advertisement</div></div>',
    { url: "https://example.com" },
  );
  const doc = dom.window.document;
  // jsdom ignores the pseudo-element argument; report generated content the way a browser does.
  const original = dom.window.getComputedStyle.bind(dom.window);
  dom.window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
    const style = original(el);
    if (pseudo === "::before" && el.matches(".label"))
      return new Proxy(style, {
        get: (t, k) => (k === "content" ? '"Sponsored by"' : t[k as keyof typeof t]),
      });
    return style;
  }) as typeof dom.window.getComputedStyle;
  const ad = doc.querySelector(".ad")!;
  const ad2 = doc.querySelector(".ad2")!;
  const targets = collapseTargets([ad, ad2]);
  assert.ok(!targets.has(doc.querySelector(".label")!), "generated content wrapper kept");
  assert.ok(targets.has(doc.querySelector(".plain")!), "plain empty wrapper collapses");
});

test("Google Publisher Tag slots without ad-like names become candidates via the wrapper", () => {
  const doc = new JSDOM(
    '<main><h1>News</h1><p>Editorial.</p></main><div id="site_desktop_leaderboard_atf" data-google-query-id="CMTD9ObNgpcDFYX9DQkd7A4sZw"><div id="google_ads_iframe_/15184186,2047846/site_desktop_leaderboard_atf_0__container__"><iframe id="google_ads_iframe_/15184186,2047846/site_desktop_leaderboard_atf_0"></iframe></div></div><div id="site_right_rail_1"><div><iframe id="google_ads_iframe_/15184186,2047846/site_right_rail_1_0"></iframe></div></div><div id="playerContainer"><iframe id="google_ads_iframe_dummy_sekindoParent219"></iframe></div>',
    { url: "https://example.com" },
  ).window.document;
  const selectors = collectCandidates(doc).map((c) => c.selector);
  assert.ok(selectors.includes("div#site_desktop_leaderboard_atf"), selectors.join());
  assert.ok(selectors.includes("div#site_right_rail_1"), selectors.join());
  assert.ok(selectors.includes("div#playerContainer"), selectors.join());
  const slot = collectCandidates(doc).find((c) => c.selector === "div#site_right_rail_1")!;
  assert.match(slot.signals, /Google Publisher Tag advertisement slot/);
});

test("excluded sites: normalization, subdomain matching and round trip through storage", async () => {
  assert.deepEqual(
    normalizeHosts("Localhost\nhttps://Example.com:8080/path, 127.0.0.1\n\nbad_host!"),
    ["localhost", "example.com", "127.0.0.1"],
  );
  const list = ["localhost", "example.com"];
  assert.equal(isExcluded("localhost", list), true);
  assert.equal(isExcluded("www.example.com", list), true);
  assert.equal(isExcluded("EXAMPLE.com", list), true);
  assert.equal(isExcluded("notexample.com", list), false);
  assert.equal(isExcluded("example.com.evil.net", list), false);
  const store = memoryStore();
  assert.deepEqual(await readExcludedHosts(store), []);
  await writeExcludedHosts(store, ["Localhost", "localhost", "example.com"]);
  assert.deepEqual(await readExcludedHosts(store), ["localhost", "example.com"]);
});
