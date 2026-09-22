import { browser } from "wxt/browser";
import { unwrap, type Reply } from "../../lib/model";
import "../popup/style.css";

const get = (id: string) => document.getElementById(id)!;
const file = get("file") as HTMLInputElement;

async function run(message: object, done: string) {
  get("error").hidden = get("notice").hidden = true;
  try {
    const data = unwrap((await browser.runtime.sendMessage(message)) as Reply<unknown>);
    get("notice").textContent = done;
    get("notice").hidden = false;
    return data;
  } catch (err) {
    get("error").textContent = err instanceof Error ? err.message : "Unexpected error.";
    get("error").hidden = false;
  }
}

get("save").addEventListener("click", () => {
  void run({ type: "backup" }, "Settings saved to Downloads.").then((backup) => {
    if (!backup) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `zen-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    // This tab stays open, so the blob outlives the download; revoke it later.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
});
get("restore").addEventListener("click", () => file.click());
file.addEventListener("change", () => {
  const picked = file.files?.[0];
  file.value = "";
  if (!picked) return;
  void picked.text().then((text) => {
    let backup: unknown;
    try {
      backup = JSON.parse(text);
    } catch {
      get("error").textContent = "Not a Zen settings file.";
      get("error").hidden = false;
      return;
    }
    void run({ type: "restore", backup }, "Settings restored.");
  });
});
