import { browser } from "wxt/browser";
import { ANALYSIS_VERSION, unwrap, type PageState, type Reply } from "../../lib/model";
import {
  providerLabel,
  providerKeyLabel,
  resolveProvider,
  type Provider,
} from "../../lib/providers";
import "./style.css";

const get = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
};
const analyze = get<HTMLButtonElement>("analyze");
const toggle = get<HTMLButtonElement>("toggle");
const global = get<HTMLInputElement>("global");
const mode = get<HTMLSelectElement>("analysis-mode");
const provider = get<HTMLSelectElement>("provider");
const errorBox = get("error");
let tabId: number | undefined;
let hasKey = false;
let working = false;
let savedProvider: Provider = "vercel";
let current: (PageState & { busy: boolean; error: string | null; excluded: boolean }) | null = null;
let excludedHosts: string[] = [];
let poll: ReturnType<typeof setTimeout> | undefined;

async function request<T>(message: object): Promise<T> {
  return unwrap((await browser.runtime.sendMessage(message)) as Reply<T>);
}
function error(error: unknown) {
  errorBox.textContent =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unexpected error.";
  errorBox.hidden = false;
}
function render() {
  const busy = working || current?.busy;
  const excluded = !!current?.excluded;
  analyze.disabled = !current || !hasKey || !global.checked || !!busy || excluded;
  const skip = get<HTMLButtonElement>("skip");
  skip.hidden = !current;
  skip.disabled = working;
  skip.textContent = excluded ? "Include this site again" : "Skip this site";
  get("excluded-count").textContent = excludedHosts.length ? `${excludedHosts.length} sites` : "";
  if (document.activeElement?.id !== "excluded-hosts")
    get<HTMLTextAreaElement>("excluded-hosts").value = excludedHosts.join("\n");
  analyze.textContent = busy ? "Analyzing…" : current?.profile ? "Re-analyze" : "Analyze page";
  toggle.hidden = !current?.profile;
  toggle.disabled = !!busy || !global.checked;
  toggle.textContent = current?.profile?.enabled ? "Pause" : "Resume";
  const selectedProvider = resolveProvider(provider.value);
  provider.disabled = working;
  get<HTMLInputElement>("api-key").placeholder = `Paste ${providerKeyLabel(selectedProvider)} key`;
  get("key-status").textContent = hasKey
    ? `${providerLabel(selectedProvider)} · Key saved`
    : "API key required";
  get("disclosure").textContent =
    `Analyze sends up to 60 short, redacted snippets of candidate elements (named clutter blocks, asides, dialogs, iframes, fixed or sticky boxes) to ${providerLabel(selectedProvider)}. Snippets may include short editorial text or personal data. Form values, cookies and long article paragraphs are not sent.`;
  get("auto-disclosure").textContent =
    `On page visit automatically sends element snippets to ${providerLabel(selectedProvider)} for new templates. Snippets may contain personal data. API charges apply. Cached templates are reused.`;
  get("remove-key").hidden = !hasKey;
  get("disclosure").hidden = !current || mode.value === "auto";
  get("auto-disclosure").hidden = mode.value !== "auto";
  get("mode-hint").textContent =
    mode.value === "auto"
      ? "On page visit · Cached templates reused"
      : "Manual analysis · Cached rules apply automatically";
  if (!current) return;
  const { profile, context, hiddenCount } = current;
  get("host").textContent = new URL(context.origin).hostname;
  get("template").textContent = context.label;
  get("hidden").textContent = String(hiddenCount);
  get("saved").textContent = profile
    ? `Saved ${new Date(profile.analyzedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";
  const status = get("status");
  const paused = !global.checked || profile?.enabled === false;
  status.textContent = busy
    ? "Analyzing"
    : excluded
      ? "Excluded"
      : paused
        ? "Paused"
        : profile
          ? profile.analysisVersion < ANALYSIS_VERSION
            ? "Update available"
            : "Saved template"
          : "Not analyzed";
  status.className = `badge ${busy ? "busy" : profile && !paused ? "active" : ""}`;
  get("rules-section").hidden = !profile;
  get("rule-count").textContent =
    `${profile?.rules.filter((rule) => rule.enabled).length ?? 0} rules`;
  const rules = get("rules");
  rules.replaceChildren();
  if (profile && !profile.rules.length) {
    const empty = document.createElement("p");
    empty.className = "disclosure";
    empty.textContent = profile.candidateCount
      ? "No clearly removable elements found."
      : "No safely targetable elements found.";
    rules.append(empty);
  }
  for (const rule of profile?.rules ?? []) {
    const label = document.createElement("label");
    label.className = "rule";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = rule.enabled;
    checkbox.disabled = !!busy;
    checkbox.setAttribute("aria-label", `Hide ${rule.selector}`);
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = rule.category;
    const selector = document.createElement("code");
    selector.textContent = rule.selector;
    info.append(title, selector);
    label.append(checkbox, info);
    rules.append(label);
    checkbox.addEventListener(
      "change",
      () => void act({ type: "rule", tabId, selector: rule.selector, enabled: checkbox.checked }),
    );
  }
}
async function load() {
  const config = await request<{
    enabled: boolean;
    hasKey: boolean;
    mode: "manual" | "auto";
    provider: Provider;
    excludedHosts: string[];
  }>({
    type: "settings",
  });
  hasKey = config.hasKey;
  excludedHosts = config.excludedHosts;
  global.checked = config.enabled;
  mode.value = config.mode;
  savedProvider = resolveProvider(config.provider);
  provider.value = savedProvider;
  if (tabId !== undefined) {
    try {
      current = await request({ type: "status", tabId });
      if (current?.error) error(current.error);
    } catch (err) {
      current = null;
      get("status").textContent = "Unavailable";
      error(err);
    }
  }
  render();
  clearTimeout(poll);
  if (
    current?.busy ||
    (current &&
      !current.error &&
      config.mode === "auto" &&
      config.enabled &&
      hasKey &&
      current.profile?.enabled !== false &&
      (!current.profile || current.profile.analysisVersion < ANALYSIS_VERSION))
  )
    poll = setTimeout(() => void load().catch(error), 900);
}
async function act(message: object) {
  if (working) return;
  working = true;
  errorBox.hidden = true;
  get("notice").hidden = true;
  render();
  try {
    await request(message);
    await load();
  } catch (err) {
    provider.value = savedProvider;
    error(err);
  } finally {
    working = false;
    render();
  }
}

analyze.addEventListener("click", () => void act({ type: "analyze", tabId }));
toggle.addEventListener(
  "click",
  () => void act({ type: "toggle", tabId, enabled: !current?.profile?.enabled }),
);
global.addEventListener("change", () => void act({ type: "global", enabled: global.checked }));
mode.addEventListener("change", () => void act({ type: "mode", mode: mode.value }));
provider.addEventListener(
  "change",
  () => void act({ type: "provider", provider: resolveProvider(provider.value) }),
);
get("forget").addEventListener("click", () => void act({ type: "forget", tabId }));
get("skip").addEventListener("click", () => {
  if (!current) return;
  const host = new URL(current.context.origin).hostname;
  const hosts = current.excluded
    ? excludedHosts.filter((h) => host !== h && !host.endsWith(`.${h}`))
    : [...excludedHosts, host];
  void act({ type: "excludedHosts", hosts });
});
get("excluded-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const hosts = get<HTMLTextAreaElement>("excluded-hosts").value.split(/\n/);
  void act({ type: "excludedHosts", hosts });
});
get("remove-key").addEventListener("click", () => void act({ type: "removeKey" }));
get("key-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = get<HTMLInputElement>("api-key");
  const key = input.value.trim();
  if (!key) {
    error(new Error(`Enter a ${providerKeyLabel(resolveProvider(provider.value))} API key.`));
    return;
  }
  void (async () => {
    await act({ type: "saveKey", key, provider: resolveProvider(provider.value) });
    input.value = "";
    if (errorBox.hidden) {
      get<HTMLDetailsElement>("connection").open = false;
      get("notice").textContent = "API key saved. Analyze a page to verify access.";
      get("notice").hidden = false;
    }
  })();
});
// Safari cannot download from the popup, so backup lives on its own extension page.
get("open-backup").addEventListener("click", () => {
  void browser.tabs
    .create({ url: browser.runtime.getURL("/backup.html") })
    .then(() => window.close());
});
void (async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  await load();
  get<HTMLDetailsElement>("connection").open = !hasKey;
})().catch(error);
