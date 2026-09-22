# Plan review log (append-only)

## Setup (2026-09-22)

- Host: Claude Code (Fable 5.1), coordinator and planner.
- Plan reviewer: Codex CLI 0.155.1, model/effort: CLI default (none requested).
- Builder: not authorized. Inspection: not applicable until a build is authorized.
- Plan: /Users/kai/repos/zen/PLAN.md. Max rounds: 5.
- Scope: review only. The user asked for the plan to be reviewed by Codex.
- Target folder /Users/kai/repos/zen is not a git repository yet (runner uses --skip-git-repo-check).

## Round 1 (2026-09-22)

- Runner result: /private/tmp/claude-501/-Users-kai-repos-zen/36745811-395e-414d-afbd-96ea8df1d1fe/scratchpad/claudex/round1/claudex-pfb7bev1/result.json
- Reviewer: codex-cli 0.155.1, session 01a0c9cd-1bca-77a1-ae5b-c5d6efcf6142, model: CLI default (unresolved, none observed). 88 s.
- Plan SHA256 reviewed: 8d50082395dbff509ddd828ef5ffef3b5f7ae0c73a5249e15325b8350c12f4e8
- Verdict: REVISE. Summary: "The proposed unchanged fork retains credential-routing, privacy, validation, and shared-state defects, and its bootstrap command cannot run against the current directory."
- Findings: ZEN-001 medium (clone into non-empty dir), ZEN-002 high (shared apiKey across providers), ZEN-003 medium (missing confidence still hides), ZEN-004 high (editorial snippet inside article sent), ZEN-005 medium (profile write race), ZEN-006 medium (pseudo-element content collapsed).
- Coverage: all upstream production TS, popup HTML, package.json, wxt.config.ts, smoke script, three test files; enumerated storage, in-memory and DOM writers; read jev.py request/response code.
- Limitations: no builds/tests/provider calls; WXT source not at node_modules (host verified separately); README not fully read; style.css, tsconfig, lockfile, LICENSE, icons unopened.
- Dispositions: accepted ZEN-001, ZEN-002, ZEN-003 (wording + openrouter policy), ZEN-006; declined ZEN-004 and ZEN-005 as upstream design, recorded as known limitations. Feedback file: scratchpad/claudex/feedback-round1.md. Plan revised.

## Round 2 (2026-09-22)

- Runner result: /private/tmp/claude-501/-Users-kai-repos-zen/36745811-395e-414d-afbd-96ea8df1d1fe/scratchpad/claudex/round2/claudex-4nr6370b/result.json
- Reviewer: codex-cli 0.155.1, resumed session 01a0c9cd-1bca-77a1-ae5b-c5d6efcf6142, model: CLI default (unresolved). 60 s.
- Plan SHA256 reviewed: 1ca062b5947f05374b0397c47ae3361595ea6efe8943655cfffd0b95ff507506
- Verdict: REVISE. ZEN-001/002/003/006 confirmed addressed at plan level; ZEN-004/005 retention accepted as host scope decision, with two documentation corrections requested.
- Findings: ZEN-007 medium (popup/jev.ts/index.html still claim article text is excluded; candidate scope understated), ZEN-008 low (race also reachable via manual analysis after popup reopen; Forget never disabled).
- Dispositions: both accepted; plan revised (limitations section, acceptance criterion 4). Feedback file: scratchpad/claudex/feedback-round2.md.

## Round 3 (2026-09-22)

- Runner result: /private/tmp/claude-501/-Users-kai-repos-zen/36745811-395e-414d-afbd-96ea8df1d1fe/scratchpad/claudex/round3/claudex-c351kbgs/result.json
- Reviewer: codex-cli 0.155.1, resumed session 01a0c9cd-1bca-77a1-ae5b-c5d6efcf6142, model: CLI default (unresolved, none observed). 27 s.
- Plan SHA256 approved: 807935052b4c03cc08e0285d29327b3ee936e64681b66d67e8298683f6f5b6ca
- Verdict: APPROVED. No findings. ZEN-007 and ZEN-008 resolved at plan level; earlier accepted fixes remain specified.
- Limitations carried: approval covers the plan including the two accepted upstream limitations (snippet transmission, profile-write race); no implementation certified; Safari signing, service-worker lifetime, OpenRouter response shape and live behaviour remain to be verified during the build; WXT MV2 default is host-provided evidence.
- Rounds used: 3 of 5. Build not authorized; no inspection performed.

## Build (2026-09-22)

- Authorization: user said "go!" after the approved plan (SHA256 807935…). Builder: host (Claude, this session). Pre-build baseline commit: bc4bcb153a6e39770e7bb9e8b418a5996775d6f6 (plan + log committed on top of upstream 9ef9bec).
- Steps done: 1 (git init, upstream remote, npm, bun.lock removed, Markdown excluded from oxfmt), 2 (safari-mv3 build; WXT default is MV2 so --mv3 is passed), 3 (converter, xcode/ project, build.sh, signed with Developer ID Application team 8TJQFP35F5; converter emitted mismatched bundle-id case, fixed in pbxproj), 4 (OpenRouter provider, per-provider keys `apiKey:<provider>`, OpenRouter answers require confidence, smoke script credential family), 4b (::before/::after check in emptyAfterHiding), 5 (rebrand: manifest, popup, badge titles, README; internal identifiers unchanged).
- Proof: `npm run check` passes (27 tests). `npx wxt build -b safari --mv3` ok. `./build.sh` produces signed xcode/build/Release/Zen.app. Live smoke via OpenRouter with synthetic input: PASS (572 ms), which also confirms OpenRouter answers carry confidence.
- Deviations from plan: Step 3 signs with "Developer ID Application" (the only identity on this Mac) instead of a personal "Apple Development" team; build.sh takes ZEN_TEAM/ZEN_SIGN_IDENTITY. Tests for per-provider keys mirror the settings() read rather than driving the background script (no browser harness in the repo).
- Not yet verified (needs the user in Safari): acceptance criteria 1 to 5 (enable extension, allow all sites, analyze a BBC article, second visit without network, pause/resume/forget, persistence across Safari restart). Zen.app has been launched once so Safari lists the extension.

## Inspection 1 (2026-09-22)

- Runner result: /private/tmp/claude-501/-Users-kai-repos-zen/36745811-395e-414d-afbd-96ea8df1d1fe/scratchpad/claudex/inspect1/claudex-8ve1w20z/result.json
- Inspector: codex-cli 0.155.1, fresh session 01a0c9db-a619-7510-9e3a-38f7372edb9a, model: CLI default (unresolved). 101 s. Base: bc4bcb15.
- Verdict: REVISE. Provider routing and confidence enforcement match the plan.
- ZEN-009 medium: in auto mode, Forget on a cached template lets a fresh tab re-analyze after 1.5 s (attempt marker removed on success; per-tab autoRequested set is empty), recreating the profile at cost. ACCEPTED: `forget` now writes the attempt marker via `suppressAuto()` before removing the profile; a successful manual Analyze removes the marker. README updated. Regression test in tests/zen.test.ts.
- ZEN-010 medium: tests/keys.test.ts re-implemented the key logic instead of exercising production code. ACCEPTED: credential and attempt-marker operations extracted into lib/settings.ts (readSettings/saveKey/removeKey/suppressAuto/autoAttempted, injectable KeyStore); background.ts imports them; tests/zen.test.ts drives the real module with an in-memory store. Message-handler wiring in background.ts is still not unit-tested (no browser harness in the repo).
- Also: oxlint tripped on the converter's generated xcode/Zen/Zen/Resources/Script.js; xcode/ excluded from oxlint and oxfmt via .oxlintrc.json / .oxfmtrc.json.
- Proof after fixes: `npm run check` exit 0, 28 tests pass; `./build.sh` rebuilt signed Zen.app.

## Inspection 2 (2026-09-22)

- Runner result: /private/tmp/claude-501/-Users-kai-repos-zen/36745811-395e-414d-afbd-96ea8df1d1fe/scratchpad/claudex/inspect2/claudex-9by234nd/result.json
- Inspector: codex-cli 0.155.1, fresh session 01a0c9df-4f73-7c13-bbce-9e34b88066d0, model: CLI default (unresolved). 93 s. Base: bc4bcb15.
- Verdict: BLOCKED, zero findings. "No new material defect established by static inspection. Shipping approval remains blocked by missing Safari acceptance evidence" (criteria 1 to 5 need the user in Safari).
- Inspection budget (2) exhausted. Code state at this snapshot is the deliverable; no edits after this inspection.
- Outstanding: manual Safari acceptance (enable extension, allow every website, BBC article analysis, sibling reuse without network, pause/resume/forget, restart persistence). Nothing committed beyond the baseline; diff left for sign-off.

## Post-inspection edit (2026-09-22, uninspected)

- Safari acceptance: Zen did not appear in Settings > Extensions after restart. Cause confirmed: the app is Developer ID signed but not notarized; Safari lists it only with Develop > Allow Unsigned Extensions on. Extensions.plist showed no Zen entry; every listed extension is notarized/App Store.
- build.sh: added a guarded notarize-and-staple step (runs only when a notarytool keychain profile, default `zen-notary`, exists; prints a warning otherwise). Not covered by the two Codex inspections (budget exhausted). Shell syntax checked.
- Acceptance criterion 1 (persist across Safari restart without the unsigned toggle) is therefore NOT met until notarization credentials are stored and build.sh is rerun.

## Post-inspection edit 2 (2026-09-22, uninspected)

- Live check on phoronix.com via Safari MCP: 5 elements hidden (header right, social, ad label, Freestar sticky footer), but Google Publisher Tag slots survived: `div#phoronix_desktop_leaderboard_atf` (728x90), `div#phoronix_right_rail_1/2` (300x250), plus a fixed Primis video player. Cause: slot wrappers carry no clutter keyword and their `google_ads_iframe_/…` frame ids contain `/` and `,` so no stable selector exists; none became candidates.
- lib/dom.ts: added `isGptSlot()` (element has `data-google-query-id`, or directly wraps a `google_ads_iframe_*` frame at depth 1 or 2); such elements are candidates with a "Google Publisher Tag advertisement slot" signal; `[data-google-query-id]` added to the priority query. Jev still decides. Test added in tests/zen.test.ts.
- Proof: `npm run check` exit 0, 29 tests; `./build.sh` rebuilt and app relaunched. Needs a Re-analyze on phoronix.com to take effect (saved template predates the change).
- Verified live after the user re-analyzed phoronix.com (2026-09-22): fresh tab applied the saved template with no popup interaction; 18 elements hidden including phoronix_desktop_leaderboard_header/atf, phoronix_right_rail_1/2, primisPlayerContainerDiv, phoronix_adhesion; zero visible ad iframes, zero fixed overlays. Editorial asides (Most Popular, Go Premium, Latest Featured, Support Phoronix) and 61 article links remain visible; the two collapsed asides contained only ad-slot bootstrap. Viewport screenshot matches.

## Notarization (2026-09-22, uninspected build.sh edits)

- User stored notarytool profile `zen-notary`. First guard (security find-generic-password) could not see the data-protection keychain item; replaced with `xcrun notarytool history --keychain-profile`.
- First submission a1a74824-9062-47f9-b32e-e6b0d8ba0805 rejected: no secure timestamp; get-task-allow entitlement injected by non-archive build. Fixed with OTHER_CODE_SIGN_FLAGS=--timestamp and CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO.
- Second submission Accepted; stapled; `spctl --assess` reports "Notarized Developer ID". App relaunched. Acceptance criterion 1 now testable: restart Safari with Allow Unsigned Extensions off and confirm Zen stays listed.
- Regression from the notarization fix: CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO also dropped Xcode's injected com.apple.security.app-sandbox, leaving both bundles with no entitlements; pluginkit then silently refused to register the extension and Safari lost it. Fixed with an explicit xcode/Zen/Zen.entitlements (app-sandbox, user-selected read-only, network client) passed as CODE_SIGN_ENTITLEMENTS. build.sh now installs to ~/Applications/Zen.app and relaunches. Third notarization Accepted; pluginkit registers the extension from ~/Applications. README updated. Uninspected.

## Feature: excluded sites (2026-09-22, uninspected)

- User request after acceptance: a setting to list domains (e.g. local machine) Zen must not analyze.
- lib/settings.ts: normalizeHosts / isExcluded (host or any subdomain) / readExcludedHosts / writeExcludedHosts. background.ts: excluded origins get enabled=false and autoEnabled=false on sync (rules restored, no auto analysis), manual analyze refuses, status carries `excluded`, new `excludedHosts` popup message. Popup: "Skip this site" / "Include this site again" button, "Excluded sites" textarea, status "Excluded". README updated. Test in tests/zen.test.ts.
- Proof: `npm run check` exit 0, 30 tests; `./build.sh` notarized (Accepted), installed to ~/Applications, registered once.
