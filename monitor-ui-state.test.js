import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  primaryReference,
  referenceGroups,
  assignOriginal,
  imageReady,
  projectImageIds,
} from "./monitor-ui-state.js";
import { desktopAccountState } from "./desktop-accounts.js";
test("有原片在上、只有原作链接次之、无素材在下；预览与外链属于同一个原作", () => {
  const local = {
      id: "local",
      referenceClips: [
        { source: { url: "wrong" } },
        { videoUrl: "video", posterUrl: "poster", source: { url: "matched" } },
      ],
    },
    external = {
      id: "external",
      referenceClips: [{ source: { url: "external" } }],
    },
    empty = { id: "empty" };
  assert.equal(primaryReference(local).source.url, "matched");
  assert.deepEqual(
    referenceGroups([empty, external, local]).map((g) =>
      g.items.map((t) => t.id),
    ),
    [["local"], ["external"], ["empty"]],
  );
});
test("上传原图可共用生成三条视频，不要求三张首帧或监控加工；未采用的生成图仍需确认", () => {
  const plan = {
    count: 3,
    prompts: ["a", "b", "c"],
    mapping: "one-to-one",
    imageIds: ["old"],
    rows: [{}],
    shotImages: [["old"]],
  };
  assignOriginal(plan, "uploaded");
  assert.equal(plan.mapping, "common");
  assert.deepEqual(plan.imageIds, ["uploaded"]);
  assert.ok(imageReady(plan, [{ id: "uploaded", type: "upload" }]));
  assert.equal(imageReady(plan, [{ id: "uploaded", confirmed: false }]), false);
  assert.deepEqual(
    projectImageIds({
      materials: { sceneImageIds: ["uploaded", "other"] },
      commonImageId: "uploaded",
      plans: [plan],
    }),
    ["uploaded", "other"],
  );
});
test("账号页读取真实保存账号，不能被浏览器临时账号替代，返回值不泄露代理密码", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-accounts-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, "doubao-accounts.json"),
    JSON.stringify({
      accounts: [
        { id: "one", name: "豆包-001", proxy: "user:secret@proxy" },
        { id: "two", name: "豆包-002" },
      ],
    }),
  );
  const saved = desktopAccountState(dir);
  assert.equal(saved.accounts.length, 2);
  assert.equal(saved.desktop, false);
  assert.equal(JSON.stringify(saved).includes("secret"), false);
  const live = desktopAccountState(dir, () => ({
    accounts: [{ id: "two", name: "豆包-002", status: "running" }],
  }));
  assert.equal(live.desktop, true);
  assert.equal(live.accounts[0].status, "running");
});
