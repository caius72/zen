import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { parseBackup, toBackup } from "../lib/settings";

const profile = {
  key: "https://a.com|v1|article",
  label: "Article",
  origin: "https://a.com",
  enabled: true,
  version: 1,
  analysisVersion: 2,
  analyzedAt: 1,
  candidateCount: 3,
  rules: [{ selector: ".ad", category: "ad", enabled: true }],
};

test("backup round-trips settings, keys and templates but drops auto markers", () => {
  const stored = {
    enabled: false,
    mode: "auto",
    provider: "openrouter",
    "apiKey:openrouter": "sk-test",
    excludedHosts: ["example.com"],
    [`profile:${profile.key}`]: profile,
    "auto:https://a.com|v1|article:a2": { startedAt: 1, error: null },
  };
  const backup = JSON.parse(JSON.stringify(toBackup(stored)));
  const { "auto:https://a.com|v1|article:a2": _, ...expected } = stored;
  assert.deepEqual(parseBackup(backup), expected);
});

test("restore rejects malformed or foreign files and drops unknown keys", () => {
  const wrap = (data: object) => ({ format: "zen-settings", version: 1, data });
  assert.throws(() => parseBackup({ data: {} }));
  assert.throws(() => parseBackup(wrap({ provider: "evil" })));
  assert.throws(() => parseBackup(wrap({ "apiKey:evil": "k" })));
  assert.throws(() => parseBackup(wrap({ enabled: "yes" })));
  assert.throws(() => parseBackup(wrap({ "profile:other": profile })));
  assert.throws(() => parseBackup(wrap({ [`profile:${profile.key}`]: { ...profile, rules: 1 } })));
  assert.deepEqual(parseBackup(wrap({ junk: 1, excludedHosts: ["https://X.com/a"] })), {
    excludedHosts: ["x.com"],
  });
});

test("every extension page is copied into the Safari app by the Xcode project", () => {
  const project = readFileSync("xcode/Zen/Zen.xcodeproj/project.pbxproj", "utf8");
  for (const dir of readdirSync("entrypoints", { withFileTypes: true }))
    if (dir.isDirectory() && existsSync(`entrypoints/${dir.name}/index.html`))
      assert.match(project, new RegExp(`${dir.name}\\.html in Resources`), `${dir.name}.html`);
});
