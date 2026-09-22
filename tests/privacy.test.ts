import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { collectCandidates } from "../lib/dom";
import { evaluationCall } from "../lib/jev";
import { pageContext } from "../lib/page-context";
import type { Snapshot } from "../lib/model";

// What must never reach the provider: the page URL and query, the title, form values, cookies,
// long editorial text, raw HTML, and the API key anywhere but the Authorization header.
const url = "https://news.example.com/2026/09/22/story?session=PRIVATE-SESSION-TOKEN";
const longParagraph = `ARTICLE_BODY_MARKER ${"Editorial sentence about something private. ".repeat(20)}`;
const html = `<!doctype html><html><head><title>SECRET PAGE TITLE</title><meta property="og:type" content="article"></head><body>
<main><article><h1>Headline</h1><p>${longParagraph}</p></article></main>
<div class="ad-banner">Advertisement contact alice@example.com or call 4111 1111 1111 1111, see https://ads.example.net/offer?x=1</div>
<form class="login-promo"><input type="password" value="hunter2-password"><input type="text" value="typed-form-value"></form>
<div class="newsletter-signup">Subscribe <input type="email" value="bob@example.com"></div>
<div id="cookie-banner" role="dialog">We use cookies. Accept or manage preferences.</div>
</body></html>`;

function snapshot(): { snapshot: Snapshot; doc: Document } {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  doc.cookie = "sid=COOKIE-SECRET-VALUE";
  const context = pageContext(doc, url);
  return { snapshot: { context, candidates: collectCandidates(doc), url }, doc };
}

test("provider request carries no URL, query, title, form values, cookies or article body", () => {
  const { snapshot: snap } = snapshot();
  assert.ok(snap.candidates.length > 0, "fixture must yield candidates");
  for (const provider of ["openrouter", "typesafe", "vercel"] as const) {
    const call = evaluationCall(snap, "synthetic-test-key", provider);
    const body = String(call.init.body);
    for (const secret of [
      "PRIVATE-SESSION-TOKEN",
      "news.example.com",
      "/2026/09/22/story",
      "SECRET PAGE TITLE",
      "ARTICLE_BODY_MARKER",
      "hunter2-password",
      "typed-form-value",
      "bob@example.com",
      "alice@example.com",
      "4111 1111 1111 1111",
      "https://ads.example.net",
      "COOKIE-SECRET-VALUE",
      "<div",
      "synthetic-test-key",
    ])
      assert.ok(!body.includes(secret), `${provider} body leaks ${secret}`);
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer synthetic-test-key");
    assert.ok(
      !Object.entries(headers).some(([k, v]) => k !== "Authorization" && v.includes("synthetic")),
      "key must only appear in Authorization",
    );
    assert.ok(!call.url.includes("synthetic-test-key"));
  }
});

test("snippets are bounded and redacted", () => {
  const { snapshot: snap } = snapshot();
  assert.ok(snap.candidates.length <= 60);
  for (const c of snap.candidates) {
    assert.ok(c.text.length <= 450, c.selector);
    assert.ok(c.signals.length <= 300, c.selector);
    assert.doesNotMatch(c.text, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, "email redacted");
    assert.doesNotMatch(c.text, /https?:\/\//, "URL redacted");
    assert.doesNotMatch(c.text, /\b(?:\d[ -]?){8,}\b/, "long number redacted");
  }
  const ad = snap.candidates.find((c) => c.selector === "div.ad-banner");
  assert.ok(ad && ad.text.includes("[email]") && ad.text.includes("[URL]"));
});

test("login forms and input-bearing blocks are never candidates", () => {
  const { snapshot: snap } = snapshot();
  const selectors = snap.candidates.map((c) => c.selector);
  assert.ok(!selectors.includes("form.login-promo"));
  assert.ok(!selectors.includes("div.newsletter-signup"), "block containing an input is protected");
});
