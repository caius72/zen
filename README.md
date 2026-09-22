
# Zen

Zen mode for Safari. A port of [kitze/unclutter](https://github.com/kitze/unclutter) (MIT) to a
Safari web extension: Jev classifies nonessential page elements (ads, promotions, newsletter and
social prompts, cookie overlays) through OpenRouter, Vercel AI Gateway or TypeSafe AI; the
extension stores and reapplies local hiding rules by page template. The extension code is
unclutter's; this repository adds Safari packaging, an OpenRouter provider, per-provider API keys
and small fixes. Upstream is kept as the `upstream` git remote so fixes can be merged.

## Install (Safari, macOS 26 or later)

```sh
brew install --cask caius72/zen/zen-safari
```

The cask installs the notarized `Zen.app` from the matching
[GitHub release](https://github.com/caius72/zen/releases) and opens it once so macOS registers
the extension. Then:

1. Safari > Settings > Extensions: enable Zen, then allow it on every website.
2. Open the Zen popup, choose a provider under **Connection**, paste its key and save it.
3. Choose **Manual** (default) and click **Analyze page**, or select **On page visit**.

Upgrade with `brew upgrade --cask zen-safari`; remove with `brew uninstall --cask zen-safari`
(`--zap` also deletes saved rules and keys).

## Build from source (Safari, macOS)

Requires Node.js 22.12 or newer and Xcode with the Safari web extension converter.

```sh
git clone https://github.com/caius72/zen.git
cd zen
npm install
./build.sh
```

`build.sh` runs the WXT build for `safari-mv3`, builds the Zen app from the Xcode project under
`xcode/` (which references the WXT output directly), notarizes and staples it when a notarytool
keychain profile named `zen-notary` exists, installs it to `~/Applications/Zen.app` and launches
it so macOS registers the extension. Safari lists only notarized extensions unless Develop >
Allow Unsigned Extensions is on (that toggle resets on every Safari launch). Create the profile
once with `xcrun notarytool store-credentials zen-notary --key <AuthKey.p8> --key-id <ID>
--issuer <UUID>` and rerun `./build.sh`. Keep only one copy of Zen.app installed (Homebrew's in
`/Applications` or a source build in `~/Applications`), otherwise Safari lists the extension twice.

`release.sh` publishes a version: it runs `build.sh`, requires notarization, uploads the stapled
`Zen-<version>.zip` as GitHub release `v<version>` (version from `package.json`), and updates
`Casks/zen-safari.rb` in the [tap](https://github.com/caius72/homebrew-zen) checkout at
`~/repos/homebrew-zen` (override with `ZEN_TAP_DIR`).

OpenRouter uses `POST https://openrouter.ai/api/alpha/decisions` with model `typesafe/jev-1.13`
and Bearer authentication. Hiding rules from OpenRouter answers require a `confidence` value;
answers without one keep the element visible.

## Install from source (Chrome / Firefox, upstream instructions)

Requires Node.js 22.12 or newer.

```sh
git clone https://github.com/caius72/zen.git
cd zen
npm ci
npm run build
```

1. Open `chrome://extensions` (or your Chromium browser's extensions page).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3` inside the cloned repository.
4. Pin Unclutter, refresh any already-open website, then open its popup.
5. Under **Connection**, choose **Vercel AI Gateway** or **TypeSafe AI**, paste the matching API key, and save it.
6. Choose **Manual** (default) and click **Analyze page**, or select **On page visit**. Your selected provider must have credits / Jev access.

After replacing unpacked builds, click **Reload** on the extension card and refresh website tabs. Existing keys/settings stay in place. V1 templates show **Update available**; **Re-analyze** once to include cookie dialogs, or automatic mode upgrades them once while preserving paused templates and keep-visible choices.

For Firefox 140+, run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv2/manifest.json`. Temporary add-ons disappear on Firefox restart; permanent Firefox distribution requires Mozilla signing. Chrome/Edge/Brave can use the Chromium build. Safari packaging is not included.

Bring your own [Vercel AI Gateway](https://vercel.com/ai-gateway) key or [TypeSafe AI key](https://console.typesafe.ai/settings/keys) (the same kind used as `JEV_KEY` / `TYPESAFE_API_KEY`). Configure it in the extension popup, not in source code or build-time environment variables. No key or shared account is bundled.

**Keys are stored per provider.** Switching the provider persists immediately and uses only the key saved for that provider; a provider without a saved key cannot analyze. Saving a key saves the selected provider with it. Removing the key removes only the selected provider's key. Saved templates remain usable offline regardless of provider.

TypeSafe direct uses `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication, and body model `jev-latest`. Gateway uses its evaluation-model v4 endpoint and `typesafe-ai/jev` headers. TypeSafe requests never carry Gateway protocol headers; Gateway requests never carry the TypeSafe model field.

## Behavior

- **Manual**: paid analysis only when you click **Analyze page / Re-analyze**.
- **On page visit**: analyze new templates in visible tabs, after a short render-settling delay. This automatically sends candidate snippets to the selected provider and incurs API charges. Off by default.
- Saved templates apply without further model requests, including zero-rule results. New analysis-rubric versions may refresh an enabled old template once in automatic mode; paused profiles and disabled rules are preserved.
- Automatic attempts are deduplicated across tabs and persisted before the request. Failure/interruption does not trigger automatic retries; click **Analyze page / Re-analyze** to retry.
- Cookie overlays (including Sourcepoint's session-numbered iframe/container IDs and BBC's `ngasCookiePrompt`) are eligible for visual hiding. No Accept/Reject buttons are clicked and no consent choice is written.
- Empty ad wrappers and their reserved-height/padding/advertisement labels collapse too, stopping before useful sibling content. Normal overflow-based cookie scroll locks are released while hiding the overlay and restored when paused.
- Toolbar badge: green **ON** = saved and active; gray **OFF** = paused; amber **…** = analyzing; red **!** = failed. Tooltip includes actual hidden element count.
- **Pause / Resume** controls the current page type across tabs. The header switch disables the whole extension. Both restore hidden elements immediately.
- **Re-analyze** replaces this template's rules while preserving disabled rules that are still identified. Failed, malformed, or stale responses leave existing rules unchanged.
- Uncheck a rule in **Hidden elements** to keep those elements visible.
- **Excluded sites** (popup, or **Skip this site**) lists hostnames Zen never analyzes or modifies, including all their subdomains; use it for local development hosts such as `localhost`. Excluded pages show the `OFF` badge and status **Excluded**.
- **Forget this page type** removes its saved rules and restores the page. It does not trigger an automatic re-analysis, even in **On page visit** mode; click **Analyze page** to analyze again.
- Removing the API key leaves saved rules usable offline.

## Template reuse

Keys combine exact origin, policy version, page kind, normalized route family, and a stable main-shell marker. Homepage, article, product, search, listing, and generic routes stay separate. Article/product leaves and date/ID segments are normalized; tracking query parameters do not fragment the cache.

Examples: BBC `/news/articles/cabc123` and `/news/articles/cdef456` share a profile if their shells match. `/`, `/news`, and a different article shell do not. Generic short routes such as `/news/world` and `/news/business` stay separate. No global cross-domain rules.

This is a conservative heuristic, not perfect template recognition. Different route families may need separate initial analyses; different layouts sharing the same shell may share a profile. Every selector is revalidated against the current DOM before hiding. Stable `data-testid`, `data-component`, IDs, and classes are used; no positional selectors or AI-generated CSS. Randomized class-only pages may yield no safely targetable candidates. There is no periodic cache expiry or automatic paid retry. Re-analyze manually after site redesigns.

## Privacy and safety

- API key stays in local extension storage, **not encrypted** and not synced. Chrome restricts storage access to trusted extension contexts. It is never sent to page content scripts, websites, logs, or repository source.
- Only extension background code calls the selected provider's fixed endpoint. Popup-origin checks protect settings/manual analysis. Page-visit requests are validated and require the user's saved automatic-mode opt-in.
- Each analysis sends up to 60 bounded candidate descriptions (tag, structural signals, short text up to 450 characters, position, match count). Candidates are named clutter blocks, asides, dialogs, iframes and fixed or sticky boxes; a candidate nested inside the article can carry short editorial text. No full URL, query string, page title, form values, cookies, raw HTML or long article paragraphs are sent. Email-like and long numeric strings in snippets are redacted, but this is **not a guarantee of anonymization**. Do not analyze sensitive pages if sending snippets to your selected provider is inappropriate.
- Jev receives typed keep/ad/promotion/newsletter/social/cookie/uncertain choices. Page text is untrusted evidence, not instructions. The model cannot emit code or selectors. Responses are validated for type, completeness, valid categories, and numeric ranges. Uncertain results remain visible. Where provided, selected-choice probability and TypeSafe confidence must **both** be at least 0.9; either failing keeps the element visible. Invalid/non-finite values reject the response. Gateway answers without confidence still work. These are conservative operational thresholds, not calibrated accuracy claims.
- Main content, navigation, ordinary forms, login/payment/security, and paywalls are protected. Cookie-dialog headings and checkbox controls may hide with their containing overlay, but sensitive inputs still block hiding. No links are clicked, consent granted, requests blocked, or access restrictions bypassed. Hiding cookie dialogs is not rejection or tracking protection; use Pause to access consent choices. Hiding ads does not prevent their network/tracking activity.
- Hidden DOM nodes are not deleted. A temporary attribute, extension-owned stylesheet, and reversible inline display overrides remove occupied space (including inline `!important`). Original style values/priorities are restored; unrelated site style changes are preserved.
- Late-loaded elements are rechecked through a bounded/debounced mutation observer. SPA navigation restores the previous rules and resolves the new template. In-flight analyses are discarded after navigation or concurrent edits.
- Cross-origin iframe contents and shadow DOM are not traversed. Identified consent iframe/container selectors are reusable across numeric session IDs. Native dialogs and ordinary embedded forms remain visible. Scroll unlocking does not run behind other visible modals; non-overflow locks (e.g. fixed-body/inert/custom event interception) may still require site-specific handling.
- HTTP(S) access is required to restore saved rules automatically on later visits. Internal browser pages, extension stores, PDFs and file URLs are not supported.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: type check, lint, format check,
the unit tests plus the privacy tests (`tests/privacy.test.ts`: no URL, query, title, form values,
cookies, article body or API key in provider requests), the security tests
(`tests/security.test.ts`: selector allow-list, protected content, model output validation,
minimal manifest permissions, fixed endpoints) and the credential-leak test
(`tests/leaks.test.ts`: tracked files and the built bundle). Separate jobs run `npm audit` at
high severity and a full-history gitleaks scan.

## Development

```sh
npm install
npm run check
npm run build
npm run build:firefox
```

Known limitation carried over from upstream: rule, pause and forget edits made while an analysis of the same template is in flight can be overwritten by that analysis's result (one click, recoverable with Re-analyze or Forget).

Use `npm run dev` for WXT development mode. No background server is needed for unpacked production builds.

The normal checks use synthetic fixtures and need no API key. Optional live smoke test: set `JEV_KEY` or `TYPESAFE_API_KEY` for TypeSafe AI, `AI_GATEWAY_API_KEY` for Gateway, **or** `OPENROUTER_API_KEY` for OpenRouter, then run `npx tsx scripts/smoke-jev.ts`. Do not set both provider families; conflicting direct-key aliases are rejected too. Never pass a key as a command-line argument. The smoke sends synthetic inputs only and incurs a small API charge. Never commit `.env` files, API keys, browser profiles, or real browsing data.

Outputs: `.output/chrome-mv3/` and `.output/firefox-mv2/`. `npm run zip` packages Chromium.

Architecture: `lib/page-context.ts` identifies templates, `lib/dom.ts` extracts candidates and applies reversible rules, `lib/jev.ts` implements Gateway evaluation-model v4 and TypeSafe System One with shared choice validation, `entrypoints/background.ts` owns credentials/cache/actions, `entrypoints/cleaner.content.ts` handles page lifecycle, and `entrypoints/popup/` provides controls. Settings and profiles use independent storage keys to avoid unrelated-tab write loss.

## License

[MIT](LICENSE).


