import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
const fixedDirectory=fileURLToPath(new URL("./data/desktop-session/",import.meta.url));

export function desktopAccountState(
  directory = fs.existsSync(path.join(fixedDirectory,"doubao-accounts.json"))?fixedDirectory:path.join(
    process.env.APPDATA || path.join(os.homedir(), ".config"),
    "video-api-workbench",
  ),
  live = globalThis.workbenchAccountState,
) {
  const source = typeof live === "function" ? live() : null;
  const file = path.join(directory, "doubao-accounts.json");
  const state =
    source ||
    (fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { accounts: [] });
  return {
    desktop: !!source,
    activeLimit: state.activeLimit || 20,
    accounts: (state.accounts || []).map((a) => ({
      id: a.id,
      name: a.name,
      nickname: a.nickname || "",
      managerAccountId: a.managerAccountId || "",
      lastSyncedAt: a.lastSyncedAt || "",
      createdAt: a.createdAt,
      status: a.status || "idle",
    })),
  };
}
