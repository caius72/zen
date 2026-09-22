import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createCleaner, matchingElements } from "../lib/dom";
import { rulesFromAnswers } from "../lib/jev";
import type { Candidate } from "../lib/model";

const doc = (html: string) => new JSDOM(html, { url: "https://example.com" }).window.document;

test("only simple, non-positional selectors are ever applied", () => {
  const d = doc('<div class="ad-banner">x</div><div id="promo">y</div><p>z</p>');
  for (const selector of [
    "*",
    "body",
    "html",
    "div",
    "div > p",
    "div, p",
    "div:nth-child(1)",
    "div[onclick]",
    'div[data-x="y"]',
    "div.ad-banner.other",
    "p",
    "script",
    "#promo",
    ".ad-banner",
    "div.ad-banner ",
    'div[data-testid="a"] p',
  ])
    assert.deepEqual(matchingElements(d, selector), [], selector);
  assert.equal(matchingElements(d, "div.ad-banner").length, 1);
  assert.equal(matchingElements(d, "div#promo").length, 1);
});

test("protected content is never hidden, even when a rule targets it", () => {
  const d = doc(
    '<main><div class="ad-banner">Sign in to continue</div></main><form class="ad-banner"><input type="password"></form><div class="ad-banner"><h1>Title</h1></div><nav class="ad-banner">Menu</nav><div class="promo">Buy now</div>',
  );
  // All-or-nothing: one protected match disqualifies the selector on this page.
  assert.deepEqual(matchingElements(d, "div.ad-banner"), []);
  assert.deepEqual(matchingElements(d, "form.ad-banner"), []);
  assert.deepEqual(matchingElements(d, "nav.ad-banner"), []);
  const cleaner = createCleaner(d);
  const hidden = cleaner.apply([
    { selector: "div.ad-banner", category: "ad", enabled: true },
    { selector: "form.ad-banner", category: "ad", enabled: true },
    { selector: "div.promo", category: "promotion", enabled: true },
  ]);
  assert.equal(hidden, 1, "only the unprotected promo block is hidden");
  assert.equal(d.querySelector("form")!.attributes.length, 1, "form untouched");
  assert.ok(d.querySelector("input[type=password]"));
  cleaner.restore();
  const promo = d.querySelector<HTMLElement>("div.promo")!;
  assert.ok(
    ![...promo.attributes].some((a) => a.name.startsWith("data-unclutter-")),
    "marker removed",
  );
  assert.equal(promo.style.display, "", "inline display restored");
});

test("model output cannot inject selectors, categories or code", () => {
  const candidates: Candidate[] = [
    {
      id: "e0",
      selector: "div.ad-banner",
      tag: "div",
      signals: "ad",
      text: "Ad",
      position: "static",
      count: 1,
    },
  ];
  const rules = rulesFromAnswers(
    {
      answers: {
        e0: {
          type: "choice",
          choice: "ad",
          confidence: 0.99,
          selector: "body",
          script: "alert(1)",
          __proto__: { polluted: true },
        },
      },
    },
    candidates,
  );
  assert.deepEqual(rules, [{ selector: "div.ad-banner", category: "ad", enabled: true }]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  for (const bad of [
    { answers: { e0: { type: "choice", choice: "hide" } } },
    { answers: { e0: { type: "score", choice: "ad" } } },
    { answers: { e0: { type: "choice", choice: "ad", confidence: "0.99" } } },
    { answers: { e1: { type: "choice", choice: "ad" } } },
    { answers: {} },
    null,
    "ad",
  ])
    assert.throws(() => rulesFromAnswers(bad, candidates));
});

test("manifest requests the minimum permissions and only fixed provider endpoints are used", () => {
  const config = readFileSync(new URL("../wxt.config.ts", import.meta.url), "utf8");
  assert.match(config, /permissions: \["storage", "activeTab"\]/);
  for (const forbidden of [
    "scripting",
    "webRequest",
    "cookies",
    'tabs"',
    "<all_urls>",
    "nativeMessaging",
    "clipboard",
    "history",
    "downloads",
  ])
    assert.ok(!config.includes(forbidden), `permission ${forbidden} must not be requested`);
  const jev = readFileSync(new URL("../lib/jev.ts", import.meta.url), "utf8");
  const urls = jev.match(/https?:\/\/[^\s"'`]+/g) ?? [];
  assert.deepEqual(
    new Set(urls),
    new Set([
      "https://ai-gateway.vercel.sh/v4/ai/evaluation-model",
      "https://api.typesafe.ai/v1/systemone",
      "https://openrouter.ai/api/alpha/decisions",
    ]),
  );
  assert.ok(!/fetch\(\s*[^)]*\$\{/.test(jev), "no interpolated fetch URLs");
});
