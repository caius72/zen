import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Credential-leak test over every tracked file and, when built, the shipped Safari bundle.
const root = new URL("..", import.meta.url).pathname;
const patterns: [string, RegExp][] = [
  ["OpenRouter key", /sk-or-v1-[a-f0-9]{16,}/],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9]{32,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/],
  ["Apple .p8 key path", /AuthKey_[A-Z0-9]{10}\.p8/],
  ["Bearer with literal token", /Bearer [A-Za-z0-9._~+/-]{30,}={0,2}(?![\w$`{])/],
  [
    "Env assignment with value",
    /\b(?:OPENROUTER_API_KEY|AI_GATEWAY_API_KEY|TYPESAFE_API_KEY|JEV_KEY)=[^\s$"'`<(][^\s"']{8,}/,
  ],
];
const binary = /\.(png|jpg|jpeg|gif|ico|icns|zip|p8|p12|pem|woff2?|ttf|lock)$/i;

function scan(label: string, file: string) {
  const text = readFileSync(file, "utf8");
  for (const [name, re] of patterns) {
    const hit = text.match(re);
    assert.ok(!hit, `${label}: ${name} pattern found in ${file}: ${hit?.[0].slice(0, 12)}…`);
  }
}

test("no credentials in tracked files", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  assert.ok(files.length > 10);
  for (const f of files) {
    assert.doesNotMatch(
      f,
      /(^|\/)\.env(\.|$)|\.(p8|p12|pem|key|pfx)$/,
      `secret-bearing file tracked: ${f}`,
    );
    if (!binary.test(f) && existsSync(join(root, f))) scan("source", join(root, f));
  }
});

test("no credentials in the built Safari bundle (when present)", () => {
  const out = join(root, ".output/safari-mv3");
  if (!existsSync(out)) return;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const files = walk(out).filter((f) => !binary.test(f));
  assert.ok(files.length > 3);
  for (const f of files) scan("bundle", f);
});
