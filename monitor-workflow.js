import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { slotsFor } from "./studio-domain.js";
export class MonitorWorkflow {
  constructor(file, service) {
    this.file = file;
    this.service = service;
    this.tasks = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : [];
    this.busy = false;
    this.timer = setInterval(() => this.pump(), 1500);
    this.timer.unref();
  }
  save() {
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.tasks));
    fs.renameSync(this.file + ".tmp", this.file);
  }
  get(projectId) {
    return this.tasks.find((t) => t.projectId === projectId) || null;
  }
  configure(projectId, selection) {
    const task = this.get(projectId);
    if (!task) throw Error("请先准备动作首帧");
    if (task.status === "video_submitted")
      throw Error("视频已经提交，新的设置不会改变已发送任务");
    const route = this.service.provider.routes.find(
      (r) => r.id === selection.videoRoute,
    );
    if (
      !route ||
      !route.resolutions.includes(selection.resolution) ||
      !["auto", "9:16", "16:9", "1:1"].includes(selection.ratio) ||
      !["first-frame", "reference-image"].includes(selection.referenceMode)
    )
      throw Error("视频设置无效");
    task.generationSettings = { ...selection };
    this.save();
    return task;
  }
  create(projectId, input) {
    const p = this.service.domain.project(projectId);
    if (p.templateTypeId !== "footspa:monitor" || !p.plans.length)
      throw Error("请选择足浴监控动作");
    const active = this.get(projectId);
    if (
      active &&
      !["images_ready", "ready", "error", "video_submitted"].includes(
        active.status,
      )
    )
      return active;
    const sources = input.sourceIds || p.materials?.sceneImageIds || [];
    for (const id of sources) this.service.references.get(id);
    for (const plan of p.plans)
      if (
        !input.independent && plan.imageConfig?.sourceSceneId &&
        !sources.includes(plan.imageConfig.sourceSceneId)
      )
        throw Error("动作指定的场景参考已移除，请重新选择");
    const signature = JSON.stringify([
      input.only,input.independent,
      sources,
      p.materials?.personImageIds || [],
      p.peopleBrief,
      p.plans.map((v) => [
        v.id,
        v.count,
        v.snapshot.description,
        v.snapshot.people,
        v.snapshot.actionTemplate,
        v.imageConfig,
        v.ratio,
        v.creativeBrief,
      ]),
    ]);
    if (active?.signature === signature && !input.restart) return active;
    const task = {
      id: randomUUID(),
      projectId,
      signature,
      autoVideo: input.autoVideo === true,
      independent:input.independent===true,only:input.only||null,
      status: "images",
      createdAt: new Date().toISOString(),
      slots: p.plans.flatMap((plan, n) =>
        Array.from({ length: plan.count }, (_, index) => ({
          id: randomUUID(),
          planId: plan.id,
          index,
          sourceId:
            (!input.independent && plan.imageConfig?.sourceSceneId) ||
            sources[
              (p.plans.slice(0, n).reduce((sum, v) => sum + v.count, 0) +
                index) %
                sources.length
            ] ||
            "",
          status: "queued",
        })),
      ),
    };
    if(task.only)task.slots=task.slots.filter(s=>s.planId===task.only.planId&&s.index===task.only.index);
    if (task.slots.length > 100) throw Error("一次最多100条视频");
    if (input.reuseExisting) {
      const ids = p.plans.flatMap((plan) =>
        slotsFor(plan).map((slot) => slot[0]),
      );
      if (
        ids.length !== task.slots.length ||
        new Set(ids).size !== ids.length ||
        ids.some(
          (id) => !id || !this.service.domain.state.assets[id]?.monitorView,
        )
      )
        throw Error("现有首帧未满足每条视频独立监控首帧，请先准备首帧");
      task.slots.forEach((slot, index) =>
        Object.assign(slot, { status: "complete", referenceId: ids[index] }),
      );
      task.status = "images_ready";
    }
    this.tasks.unshift(task);
    this.save();
    queueMicrotask(() => this.pump());
    return task;
  }
  bind(task) {
    const p = this.service.domain.project(task.projectId);
    for (const plan of p.plans) {
      if(task.only){if(plan.id===task.only.planId){const slot=task.slots[0];const ids=slotsFor(plan).map(v=>v[0]||'');ids[slot.index]=slot.referenceId;plan.imageIds=ids;plan.mapping='one-to-one';plan.promptsDirty=true;}continue;}
      const slots = task.slots
        .filter((s) => s.planId === plan.id)
        .sort((a, b) => a.index - b.index);
      if (slots.length !== plan.count)
        throw Error("动作数量已改变，请重新准备首帧");
      plan.mapping = "one-to-one";
      const ids = slots.map((s) => s.referenceId || "");
      plan.promptsDirty =
        plan.promptsDirty ||
        !plan.prompts.length ||
        JSON.stringify(plan.imageIds) !== JSON.stringify(ids);
      plan.imageIds = ids;
    }
    this.service.domain.save();
    return p;
  }
  confirm(projectId,input={}) {
    const task = this.get(projectId);
    if (!task || !task.slots.every((s) => s.status === "complete"))
      throw Error("请先完成所有动作首帧");
    if (task.status === "drafting") return task;
    const p = this.bind(task);
    for (const s of task.slots)
      this.service.domain.state.assets[s.referenceId].confirmed = true;
    this.service.domain.save();
    if(input.autoDraft===false){task.status="ready";task.autoVideo=false;this.save();return task;}
    task.status = "drafting";
    task.draftId = this.service.drafts.create({
      projectId,
      requestId:
        task.id +
        ":prompts:" +
        (task.draftAttempt = (task.draftAttempt || 0) + 1),
      mode: p.plans.some((v) => v.promptsDirty) ? "dirty" : "missing",
    }).id;
    this.save();
    return task;
  }
  async retry(projectId, slotId, externalId) {
    const task = this.get(projectId),
      slot = task?.slots.find((s) => s.id === slotId);
    if (!slot) throw Error("首帧不存在");
    if (slot.status === "needs_review" && !externalId)
      throw Error("请先核对图片生成服务已有任务编号");
    if (!["error", "complete", "needs_review"].includes(slot.status))
      throw Error("当前首帧仍在处理中");
    if (["error", "needs_review"].includes(slot.status) && slot.imageTaskId) {
      const imageTask = this.service.images.get(slot.imageTaskId);
      await this.service.images.retry(
        imageTask.id,
        imageTask.items[0].id,
        externalId,
      );
      slot.status = "waiting";
    } else {
      delete slot.imageTaskId;
      delete slot.referenceId;
      slot.status = "queued";
    }
    slot.attempt = (slot.attempt || 0) + 1;
    slot.error = "";
    task.status = "images";
    task.error = "";
    task.autoVideo = false;
    this.save();
    return task;
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const task of this.tasks.filter((t) =>
        ["images", "drafting", "ready"].includes(t.status),
      )) {
        try {
          if (task.status === "images") {
            let waiting = task.slots.filter((s) =>
              ["waiting", "running"].includes(s.status),
            ).length;
            for (const slot of task.slots) {
              if (slot.status === "queued" && waiting < 2) {
                const primary = task.slots[0];
                if (!task.independent && !slot.sourceId && slot !== primary && !primary.referenceId)
                  continue;
                const image = this.service.images.create({
                  projectId: task.projectId,
                  planId: slot.planId,
                  count: 1,
                  slotIndex: slot.index,
                  sourceSceneId: slot.sourceId || (!task.independent&&primary.referenceId) || "",
                  isolatedReference: true,
                  requestId:
                    task.id + ":" + slot.id + ":" + (slot.attempt || 0),
                });
                slot.imageTaskId = image.id;
                slot.status = "waiting";
                waiting++;
              }
              if (
                slot.imageTaskId &&
                ["waiting", "running"].includes(slot.status)
              ) {
                const item = this.service.images.get(slot.imageTaskId).items[0];
                slot.status =
                  item.status === "complete"
                    ? "complete"
                    : ["error", "needs_review"].includes(item.status)
                      ? item.status
                      : "waiting";
                slot.error = item.error || "";
                if (item.referenceIdResult)
                  slot.referenceId = item.referenceIdResult;
              }
            }
            if (task.slots.every((s) => s.status === "complete")) {
              task.status = "images_ready";
              this.bind(task);
              if (task.autoVideo) this.confirm(task.projectId);
            } else if (
              task.slots.every((s) =>
                ["complete", "error", "needs_review"].includes(s.status),
              )
            )
              task.status = "error";
            else if (
              ["error", "needs_review"].includes(task.slots[0].status) &&
              task.slots.some((s) => s.status === "queued" && !s.sourceId)
            ) {
              task.status = "error";
              task.error = "主场景首帧未完成，其他动作等待主场景重试";
            }
          } else if (task.status === "drafting") {
            const draft = this.service.drafts.get(task.draftId);
            if (draft.status === "complete") {
              task.status = "ready";
            } else if (draft.status === "error") {
              task.status = "error";
              task.error = draft.error;
            }
          }
          if (task.status === "ready" && task.autoVideo) {
            const p = this.bind(task);
            for (const plan of p.plans) {
              if (task.generationSettings) {
                const { ratio, ...selection } = task.generationSettings;
                Object.assign(plan, selection, { autoRatio: ratio === "auto" });
                if (ratio !== "auto") {
                  plan.ratio = ratio;
                  plan.prompts = plan.prompts.map((text) =>
                    text.replace(/\b(?:9:16|16:9|1:1)\b/g, ratio),
                  );
                }
              }
              plan.promptsDirty = false;
            }
            this.service.domain.save();
            const batch = this.service.submit({
              projectId: p.id,
              requestId: task.id + ":video",
              generationSettings: task.generationSettings,
            });
            task.batchId = batch.id;
            task.status = "video_submitted";
          }
        } catch (e) {
          task.error = e.message;
          task.status = "error";
        }
      }
      this.save();
    } finally {
      this.busy = false;
    }
  }
}
