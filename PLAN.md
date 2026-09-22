# Zen: a Safari port of unclutter

## Goal

Ship "Zen", a Safari web extension for macOS that does what unclutter does: hide ads, promotions,
newsletter/social prompts and cookie overlays on web pages, using Jev to classify candidate
elements once per page template and reusable local rules afterwards.

Source project: `/Users/kai/repos/unclutter` (MIT, kitze/unclutter, WXT 0.21.4, ~1,200 lines of
TypeScript, zod as the only runtime dependency). Target folder: `/Users/kai/repos/zen` (currently
empty, not a git repository).

Scope of this document: plan only. Building is not authorized yet.

## Acceptance criteria

1. Zen is enabled in Safari on this Mac (macOS 26, Safari 26, Xcode 26.2) and survives a Safari
   restart without re-enabling "Allow unsigned extensions".
2. On a BBC article, "Analyze page" hides ads and the cookie overlay; the badge shows `ON` and the
   tooltip shows the hidden count.
3. A second visit to a sibling article on the same template re-applies the rules with no network
   request to the provider (verified in Safari Web Inspector's network tab for the background).
4. Pause/Resume restores the page immediately. Forget removes the template (checked with no analysis in flight; see known limitations).
5. The Jev call goes through OpenRouter using the key stored in the macOS keychain item
   `openrouter-api-zev` (pasted into the popup by the user; the extension does not read the
   keychain).
6. `npm run check` (typecheck, lint, format, tests) passes, including a new provider test.

## What unclutter does (recon summary)

- `entrypoints/cleaner.content.ts`: runs at `document_idle`, computes a template key via
  `lib/page-context.ts` (origin, page kind from JSON-LD/og:type, normalized route, main-shell
  marker), asks the background for the saved profile, applies rules, re-syncs on a debounced
  MutationObserver and on `wxt:locationchange`.
- `lib/dom.ts`: collects up to 60 candidates (clutter-named ids/classes, asides, dialogs, iframes,
  fixed/sticky boxes), builds stable non-positional selectors, redacts text, refuses protected
  content (main, nav, forms, login, paywall, long text). Hiding is reversible (random attribute +
  extension stylesheet + inline display override); collapses empty ad wrappers; releases overflow
  scroll locks under cookie overlays.
- `lib/jev.ts`: one `choice` question per candidate (keep/ad/cookie/promotion/newsletter/social/
  uncertain). Both `probabilities` and `confidence` are optional in `responseSchema`; where a
  field is present it must be >= 0.9, and an answer carrying neither field still produces a
  hiding rule (documented upstream as "Gateway answers without confidence still work"). Providers: Vercel AI
  Gateway (`https://ai-gateway.vercel.sh/v4/ai/evaluation-model`) and TypeSafe direct
  (`https://api.typesafe.ai/v1/systemone`, body `model: "jev-latest"`).
- `entrypoints/background.ts`: settings, key, profiles keyed by template, manual/auto analysis with
  persisted attempt deduplication, badge via `browser.action`, popup-origin check
  `sender.url === browser.runtime.getURL("/popup.html")`.
- `entrypoints/popup/`: vanilla TS popup.
- `wxt.config.ts`: `permissions: ["storage","activeTab"]`, `host_permissions: http/https *`.

## Approach

Fork, do not rewrite. The extension code is browser-neutral MV3 and Safari 16.4+ runs MV3
extensions with the same `browser.*` API. The work is packaging, one new provider, and branding.

### Step 1: bootstrap the repo

- `/Users/kai/repos/zen` already holds `PLAN.md` and `PLAN-REVIEW-LOG.md`, so `git clone` into it
  would refuse. Bootstrap in place instead:
  `cd /Users/kai/repos/zen && git init && git remote add upstream /Users/kai/repos/unclutter &&
  git fetch upstream && git checkout -b main upstream/main`. The planning files are untracked
  upstream, so the checkout does not conflict; commit them afterwards. Add the user's own `origin`
  later. Keeps upstream history so unclutter fixes can be merged.
- Keep `LICENSE` (MIT) and add attribution to kitze/unclutter in the README.
- Use npm instead of bun (bun is not installed; node v26.9.0 is present, WXT needs >= 22.12).
  `npm install` will create `package-lock.json`; remove `bun.lock` to avoid two lockfiles.
  Replace `bun run` in package.json scripts with `npm run` where scripts chain each other.

### Step 2: build for Safari unchanged

- `npx wxt build -b safari --mv3`. Force MV3 explicitly rather than relying on WXT's per-browser
  default.
- Inspect `.output/safari-mv3/manifest.json`: expect `background.service_worker`, `action`,
  `content_scripts`, `host_permissions`. Fix WXT quirks here before adding features.
- Known Safari differences, all already tolerated by the code:
  - `browser.storage.local.setAccessLevel` is absent in Safari; the call is already
    optional-chained (`setAccessLevel?.(...)`).
  - `action.setBadgeBackgroundColor` is accepted but Safari does not render custom badge colors.
    ON / OFF / `…` / `!` badge text and the `setTitle` tooltip still distinguish the states.
  - Site access is granted per site in Safari; the user sets "Allow on Every Website" once.
  - `browser.runtime.getURL("/popup.html")` returns a `safari-web-extension://<uuid>/popup.html`
    URL and `sender.url` uses the same scheme, so the popup-origin check should hold. Verify at
    runtime (acceptance criterion 2 exercises it).

### Step 3: wrap in an Xcode app and sign

- `xcrun safari-web-extension-converter .output/safari-mv3 --project-location xcode
  --app-name Zen --bundle-identifier <reverse-dns> --macos-only --swift --no-open`.
- Open `xcode/Zen/Zen.xcodeproj`, set the personal Apple Development team on both the app and the
  extension targets, build and run once. Enable Zen in Safari > Settings > Extensions, allow on
  every website. A signed development build persists across Safari restarts; unsigned builds need
  Develop > Allow Unsigned Extensions on every Safari launch, which fails acceptance criterion 1.
- Add `build.sh`: run the WXT build, sync `.output/safari-mv3/` into the converter's
  `Shared (Extension)/Resources` folder (or rerun the converter with `--rebuild-project`), then
  `xcodebuild -project xcode/Zen/Zen.xcodeproj -scheme Zen build`, then relaunch the app. This is
  the whole dev loop. `xcode/` is committed (it is source); Xcode's `build/` and `DerivedData` are
  gitignored.

### Step 4: add the OpenRouter provider

The user's Jev key is an OpenRouter key. The local Jev plugin (`/Users/kai/repos/ai/jev/bin/jev.py`)
shows the wire format: `POST https://openrouter.ai/api/alpha/decisions`, bearer auth, body
`{ model: "typesafe/jev-1.13", state, questions }`, response read as `resp["answers"]`.

- `lib/providers.ts`: add `"openrouter"` to `providers`, labels "OpenRouter" / "OpenRouter (Jev)",
  and `resolveProvider`.
- **Bind keys to providers.** Upstream stores one shared `apiKey` and the `provider` handler
  switches the provider without touching it (`entrypoints/background.ts` `saveKey` / `provider`
  handlers, `popup/main.ts` persists the select change immediately). With a third provider that
  means an OpenRouter key would be posted to Vercel or TypeSafe after a provider switch, manually
  or by auto mode on the next new template. Change `settings()` to read `apiKey:<provider>`,
  `saveKey` to write `apiKey:<provider>`, `removeKey` to remove only the selected provider's key,
  and `hasKey` to derive from the selected provider. No migration of the legacy `apiKey` field is
  needed (Zen starts from a fresh install). Add a test: saving an OpenRouter key then switching to
  Vercel yields `hasKey === false` and `analyze` refuses with the "add your key" error.
- `lib/jev.ts`: add `OPENROUTER_ENDPOINT`; for `openrouter` send bearer header only (no Gateway
  protocol headers), body `{ ...request, model: "typesafe/jev-1.13" }`. The 401/403 advice string
  mentions the OpenRouter key.
- **Confidence policy for OpenRouter.** Upstream creates a hiding rule from an answer that carries
  neither `probabilities` nor `confidence`. For the `openrouter` provider, require `confidence` to
  be present (the Jev plugin's own router uses Jev confidence on choice answers, so it is expected
  in this response shape); an answer without it is treated as `uncertain` and stays visible. The
  Gateway and TypeSafe paths keep upstream behaviour. Add missing-field cases to
  `tests/providers.test.ts`. If the smoke test shows OpenRouter omits `confidence`, the policy is
  revised explicitly in this plan, not by loosening the check.
- `entrypoints/popup/index.html`: one more `<option>` in the provider select.
- `tests/providers.test.ts`: assert URL, headers and body for the openrouter case.
- `scripts/smoke-jev.ts`: accept `OPENROUTER_API_KEY` as a third exclusive credential family. Run
  once with the key exported from the keychain
  (`OPENROUTER_API_KEY=$(security find-generic-password -s openrouter-api-zev -w) npx tsx scripts/smoke-jev.ts`).
  The smoke uses synthetic input only; it is the point at which the response shape is verified.
- Safari cross-origin fetch from the background requires host permission for the API host; the
  existing `https://*/*` host permission covers openrouter.ai. If Safari's per-site model turns out
  not to grant background fetch to a site the user never visited, add
  `https://openrouter.ai/*` explicitly to `host_permissions`.

### Step 4b: one small upstream fix

- `lib/dom.ts` `emptyAfterHiding` treats a wrapper as empty when it has no text nodes and no
  background image, so a wrapper whose `::before`/`::after` renders meaningful `content` collapses
  together with its ad child. Add a check: if `getComputedStyle(el, "::before").content` or the
  `::after` equivalent is anything other than `none` / `normal` / an empty string, the wrapper is
  not empty. Three lines plus one jsdom test. Offer upstream as a PR.

### Step 5: rebrand to Zen

- Manifest `name`/`description` in `wxt.config.ts`, popup `<title>`/heading, README intro and
  install steps (Safari instead of Chrome), remove the Firefox-only manifest block only if it gets
  in the way (it is harmless).
- Internal identifiers (`data-unclutter-` attribute prefix, storage keys, message types) stay.
  Renaming them has no user-visible effect and would break the upstream merge path.

### Step 6: verify in Safari

Manual checklist, in addition to the acceptance criteria:

- SPA navigation on a site that uses pushState (rules restore and re-resolve).
- The API key and saved profiles survive quitting and relaunching Safari.
- Auto mode: switch to "On page visit", open a new template, confirm exactly one analysis
  (attempt dedup persisted before the call).
- Background service worker suspension: start an analysis, switch tabs for 30 s, confirm the
  result still lands (the in-flight fetch keeps the worker alive; attempt state is persisted
  before the paid call). If Safari kills it anyway, switch WXT to a non-persistent background page
  (`background: { persistent: false }` in `wxt.config.ts`) and re-verify.

## Upstream behaviour carried over unchanged (known limitations)

These were raised in plan review, judged real, and deliberately left as upstream behaviour because
Zen is a port and each is bounded and recoverable. They are documented in the README rather than
fixed here.

- **Short editorial snippets can be sent.** `isProtected` refuses candidates that are or contain
  structural content and long text, but a clutter-named block nested inside `main`/`article`
  (for example `<article><div class="related"><p>short paragraph</p></div></article>`) is a
  legitimate candidate and its text, redacted and capped at 450 characters, is sent to the
  provider. Candidates are not only clutter-named blocks: asides, dialogs, iframes and
  fixed/sticky elements qualify without any name signal. The upstream README already states this
  is "not a guarantee of anonymization". Every consent-facing claim that "main article text and
  form values are excluded" is corrected in the same change, not just the README: the dynamic
  string in `entrypoints/popup/main.ts` `render()`, the static text in
  `entrypoints/popup/index.html`, the comment in `lib/jev.ts` `evaluationRequest`, and the README
  privacy section. New wording: "Sends up to 60 short, redacted snippets (450 characters each) of
  candidate elements: named clutter blocks, asides, dialogs, iframes and fixed or sticky boxes.
  Snippets may include short editorial text. Form values, cookies and long article paragraphs are
  not sent."
- **Profile write race.** `jobs` serializes analyses per template, but the `rule`, `toggle` and
  `forget` popup handlers read-modify-write the profile outside that queue. A rule edit made
  during an in-flight automatic analysis of the same template can be overwritten, and Forget
  during analysis can be undone by the analysis result. The window is one analysis (seconds), the
  loss is one click, and Re-analyze / Forget recover it. The race applies to manual analysis too:
  the popup's `working` flag is per popup instance, so closing and reopening the popup during a
  manual re-analysis re-enables Forget (which `render()` never disables while busy), and the
  background `forget` handler has no job guard. Not fixed in the port; candidate for an upstream
  PR that routes all profile mutations through the per-template queue. Acceptance criterion 4 is
  therefore checked with no analysis in flight.

## Non-goals (for now)

- iOS/iPadOS target (the converter supports it; add `--ios-only`/universal later).
- Keychain-backed key storage via the native app and native messaging. `storage.local` is
  extension-private in Safari, same trust level as unclutter on Chrome.
- A "reader" mode that hides everything except main content. That is a different product from
  unclutter's classify-and-hide approach; only build if explicitly requested.
- App Store or Developer ID distribution.
- Renaming internal identifiers.

## Assumptions and risks

| # | Assumption | Source | Risk if wrong |
|---|---|---|---|
| 1 | WXT 0.21.4 supports `-b safari`; its default for safari is **MV2** (`resolve-config.mjs:49` in the published package: `browser === "firefox" \|\| browser === "safari" ? 2 : 3`), so `--mv3` must be passed explicitly. Verified 2026-09-22 against the npm tarball. | WXT 0.21.4 source | Output dir would be `safari-mv2` and the converter step would point at the wrong folder |
| 2 | Safari renders badge text via `browser.action.setBadgeText` | Apple docs | States still visible in tooltip; cosmetic |
| 3 | OpenRouter decisions endpoint returns the same `answers` shape as TypeSafe System One | `jev.py` reads `resp["answers"]`; confidence fields unverified | Adapt `responseSchema` for the openrouter case after the smoke test |
| 4 | Signed Apple Development build persists across Safari restarts | Apple docs on local testing | Would need Developer ID; personal team is expected to suffice |
| 5 | Codex/WXT `browser` shim (`globalThis.browser ?? chrome`) works with Safari's native `browser` | WXT source | Safari provides promise-based `browser`; expected fine |
| 6 | Safari MV3 background service worker survives a 25 s in-flight fetch | Apple docs; unclutter already persists attempt state | Switch to non-persistent background page |

## Verification (proof commands)

```sh
cd /Users/kai/repos/zen
npm run check                              # typecheck + lint + format + unit tests
npx wxt build -b safari --mv3              # produces .output/safari-mv3
xcodebuild -project xcode/Zen/Zen.xcodeproj -scheme Zen build
```

Manual: acceptance criteria 1 to 5 above, plus the Step 6 checklist.
