import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MonitorWorkflow } from "./monitor-workflow.js";
import { studioApi } from "./studio-api.js";

function fixture(t, sources = ["scene-a", "scene-b"]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-line-"));
  const images = new Map(),
    drafts = new Map(),
    submitted = [];
  const p = {
    id: "project",
    templateTypeId: "footspa:monitor",
    materials: { sceneImageIds: sources },
    plans: ["a", "b"].map((id) => ({
      id,
      count: 2,
      ratio: "9:16",
      imageIds: [],
      prompts: [],
      imageConfig: {},
      snapshot: { description: id },
    })),
  };
  const service = {
    provider: { routes: [{ id: "new-model", resolutions: ["720P"] }] },
    domain: { state: { assets: {} }, project: () => p, save() {} },
    references: { get: (id) => ({ id }) },
    images: {
      create(input) {
        const v = {
          id: input.requestId,
          input,
          items: [{ id: "item", status: "waiting" }],
        };
        images.set(v.id, v);
        return v;
      },
      get: (id) => images.get(id),
      async retry(id) {
        images.get(id).items[0].status = "waiting";
      },
    },
    drafts: {
      create(input) {
        const v = { id: "draft", input, status: "running" };
        drafts.set(v.id, v);
        return v;
      },
      get: (id) => drafts.get(id),
    },
    submit(input) {
      submitted.push(input);
      return { id: "batch" };
    },
  };
  const flow = new MonitorWorkflow(path.join(root, "tasks.json"), service);
  clearInterval(flow.timer);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const finish = () => {
    for (const img of images.values()) {
      Object.assign(img.items[0], {
        status: "complete",
        referenceIdResult: img.id,
      });
      service.domain.state.assets[img.id] = { confirmed: false };
    }
  };
  return { flow, p, images, drafts, submitted, finish };
}
test("两张场景参考派生四张独立首帧，审核后才准备提示词；重复点击不增发", async (t) => {
  const f = fixture(t),
    task = f.flow.create("project", { autoVideo: false });
  await f.flow.pump();
  assert.equal(f.flow.create("project", {}).id, task.id);
  f.finish();
  await f.flow.pump();
  f.finish();
  await f.flow.pump();
  f.finish();
  await f.flow.pump();
  assert.equal(f.images.size, 4);
  assert.equal(task.status, "images_ready");
  assert.equal(f.drafts.size, 0);
  assert.equal(f.submitted.length, 0);
  assert.deepEqual(
    task.slots.map((s) => s.sourceId),
    ["scene-a", "scene-b", "scene-a", "scene-b"],
  );
  assert.equal(new Set(f.p.plans.flatMap((v) => v.imageIds)).size, 4);
  assert.ok([...f.images.values()].every((v) => v.input.isolatedReference));
  f.flow.confirm("project");
  assert.equal(f.drafts.get("draft").input.mode, "dirty");
  assert.ok(f.p.plans.every((v) => v.mapping === "one-to-one"));
});
test("自动流水线采用提示词处理中修改的服务与比例，提交只有一次", async (t) => {
  const f = fixture(t),
    task = f.flow.create("project", { autoVideo: true });
  for (let i = 0; i < 4; i++) {
    await f.flow.pump();
    f.finish();
  }
  assert.equal(task.status, "drafting");
  f.flow.configure("project", {
    videoRoute: "new-model",
    resolution: "720P",
    ratio: "16:9",
    referenceMode: "first-frame",
  });
  f.p.plans.forEach((v) => {
    v.prompts = ["9:16 prompt", "9:16 prompt"];
    v.promptsDirty = false;
  });
  f.drafts.get("draft").status = "complete";
  await f.flow.pump();
  await f.flow.pump();
  assert.equal(f.submitted.length, 1);
  assert.equal(task.status, "video_submitted");
  assert.ok(
    f.p.plans.every(
      (v) =>
        v.videoRoute === "new-model" &&
        v.prompts.every((text) => text.includes("16:9")),
    ),
  );
});
test("AI主场景失败可见且单张重试，不重复生成已完成项", async (t) => {
  const f = fixture(t, []),
    task = f.flow.create("project", {});
  await f.flow.pump();
  assert.equal(f.images.size, 1);
  f.images.values().next().value.items[0].status = "error";
  await f.flow.pump();
  assert.equal(task.status, "error");
  assert.match(task.error, /主场景/);
  await f.flow.retry("project", task.slots[0].id);
  assert.equal(task.error, "");
  f.finish();
  await f.flow.pump();
  await f.flow.pump();
  assert.ok(f.images.size > 1);
});
test("首帧输入包含人物参考，变更人物必须新建首帧任务；删除场景不可隐式使用", async (t) => {
  const f = fixture(t),
    first = f.flow.create("project", {});
  await f.flow.pump();
  first.status = "images_ready";
  f.p.materials.personImageIds = ["person-new"];
  const second = f.flow.create("project", {});
  assert.notEqual(second.id, first.id);
  second.status = "images_ready";
  f.p.plans[0].imageConfig.sourceSceneId = "removed-scene";
  assert.throws(() => f.flow.create("project", {}), /已移除/);
});
test("旧项目可沿用已生成的独立监控首帧，不重新发送图片生成", async (t) => {
  const f = fixture(t);
  for (const plan of f.p.plans) {
    plan.mapping = "one-to-one";
    plan.imageIds = [plan.id + "1", plan.id + "2"];
    for (const id of plan.imageIds)
      f.flow.service.domain.state.assets[id] = { monitorView: true };
  }
  const task = f.flow.create("project", { reuseExisting: true });
  await f.flow.pump();
  assert.equal(task.status, "images_ready");
  assert.equal(f.images.size, 0);
  assert.equal(task.slots.length, 4);
});
test("失败视频重试采用已确认的新提示词、模型、首帧，保留原作品编号", async () => {
  const job = {
    id: "original",
    projectId: "project",
    planId: "plan",
    slotIndex: 0,
    status: "error",
    providerId: "previous",
    prompt: "old",
  };
  const plan = {
    id: "plan",
    count: 1,
    prompts: ["edited"],
    imageIds: ["new-frame"],
  };
  let retried = false;
  const service = {
    queue: {
      state: { jobs: [job] },
      retry(id) {
        assert.equal(id, "original");
        retried = true;
        return job;
      },
    },
    domain: {
      project: () => ({ id: "project", plans: [plan] }),
      readiness: () => ({ errors: [] }),
    },
    provider: { routes: [], status: async () => ({ status: "error" }) },
    references: {},
    jobs: () => [
      {
        id: "discarded-new-id",
        prompt: "edited",
        videoRoute: "new-model",
        referenceImageIds: ["new-frame"],
      },
    ],
  };
  await studioApi(
    service,
    { method: "POST" },
    {},
    new URL("http://local/api/studio/jobs/original/retry"),
    { body: async () => ({ useProjectSettings: true }), reply() {} },
  );
  assert.ok(retried);
  assert.equal(job.id, "original");
  assert.equal(job.prompt, "edited");
  assert.equal(job.videoRoute, "new-model");
  assert.deepEqual(job.referenceImageIds, ["new-frame"]);
});
