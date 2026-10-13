export function renderMonitorWorkspace(ctx) {
  const {
    project: p,
    data,
    app,
    esc,
    api,
    post,
    save,
    settings,
    applySettings,
    persistPrompts,
  } = ctx;
  const pickerOpen =
    app.querySelector("[data-action-picker]")?.open ?? !p.plans.length;
  clearInterval(renderMonitorWorkspace.timer);
  document.querySelector(".bottom")?.remove();
  app.className = "monitor-line";
  window.monitorPipelineDrafting = false;
  p.materials ||= {
    personImageIds: [],
    productImageIds: [],
    sceneImageIds: [],
  };
  if (!p.materials.sceneImageIds?.length)
    p.materials.sceneImageIds = [
      ...new Set(
        [
          p.commonImageId,
          ...p.plans
            .filter((v) => v.mapping === "common")
            .flatMap((v) => v.imageIds || []),
        ].filter(Boolean),
      ),
    ];
  const primaryReference = (t) => {
    const clips = t.referenceClips || [];
    return (
      clips.find((c) => c.posterUrl && c.videoUrl && c.source) ||
      clips.find((c) => c.source) ||
      null
    );
  };
  const asset = (id) => data.assets.find((a) => a.id === id),
    types = data.templates.filter((t) => t.packId === "foot-spa-store"),
    sources = p.materials.sceneImageIds;
  app.innerHTML = `<div class="monitor-head"><div><h1>${esc(p.name)}</h1><p>场景参考 → 每个动作的独立首帧 → 视频。全过程在本页完成。</p></div><a class="button" href="/projects">项目列表</a><button id="lineAccounts">豆包账号池</button></div><section class="monitor-sources card"><h2>1 场景参考 <span id="sceneCount">${sources.length}张</span></h2><p>上传图只提供场景参考，不会直接作为所有视频的首帧。多张参考不会自动增加视频数量。</p><div class="row"><button id="lineUpload">上传场景图（可多选）</button><button id="lineAssets">从素材选择</button><button id="linePeople">添加人物参考（可选）</button><span>不上传时，先生成第一张主图，再让其他动作沿用同一场景。</span></div><div class="line-scene-grid">${sources.map((id) => `<figure><img src="${esc(asset(id)?.previewUrl || "")}" alt="${esc(asset(id)?.name || "场景参考")}"><figcaption>${esc(asset(id)?.name || "场景参考")}</figcaption><button data-remove-scene="${id}">移除参考</button></figure>`).join("")}</div><div class="line-scene-grid">${(p.materials.personImageIds || []).map((id) => `<figure><img src="${esc(asset(id)?.previewUrl || "")}" alt="人物参考"><figcaption>人物参考 · ${esc(asset(id)?.name || "")}</figcaption><button data-remove-person="${id}">移除人物</button></figure>`).join("")}</div></section><section class="card monitor-plan"><h2>2 动作与首帧 <span>${p.plans.reduce((n, v) => n + v.count, 0)}条视频</span></h2><p>一个视频对应一张动作首帧。每张生成图自动加入固定高位监控视角、当前动作起始姿态和人数要求。</p><details data-action-picker ${pickerOpen ? "open" : ""}><summary>展开完整动作库 · ${types.length}个动作可多选</summary><div class="line-action-library">${types
    .map((t) => {
      const c = primaryReference(t);
      return `<article><label><input data-line-action="${t.id}" type="checkbox" ${p.plans.some((v) => v.templateId === t.id) ? "checked" : ""}>${esc(t.name)}</label>${c?.videoUrl ? `<div data-line-preview="${esc(c.id)}" data-video-url="${esc(c.videoUrl)}"><img src="${esc(c.posterUrl)}" alt="${esc(t.name)}原作参考"><button>播放参考视频</button></div>` : '<div class="line-no-reference">暂无本地原片 · 可正常制作</div>'}${c?.source ? `<a class="douyin-origin-link" href="${esc(c.source.url)}" target="_blank" rel="noopener noreferrer">在抖音打开原作 ↗</a>` : "<small>暂无原作参考</small>"}</article>`;
    })
    .join("")}</div></details><div class="line-action-plans">${p.plans
    .map(
      (v, n) =>
        `<div class="line-plan"><strong>${esc(v.snapshot.name)}</strong><label>数量<input data-line-count="${v.id}" type="number" min="1" max="30" value="${v.count}"></label><label>时长<select data-video-duration="${v.id}" data-line-duration="${v.id}"><option>${v.duration}</option></select>秒</label><label>场景参考<select data-line-source="${v.id}"><option value="">${sources.length ? "按顺序使用参考图" : "AI主场景"}</option>${sources.map((id) => `<option value="${id}" ${v.imageConfig?.sourceSceneId === id ? "selected" : ""}>${esc(asset(id)?.name || id)}</option>`).join("")}</select></label>${[
          primaryReference(
            data.templates.find((t) => t.id === v.templateId) || v.snapshot,
          ),
        ]
          .filter(Boolean)
          .map((c) =>
            c.source
              ? `<a href="${esc(c.source.url)}" target="_blank" rel="noopener noreferrer">查看抖音原作 ↗</a>`
              : "",
          )
          .join("")}</div>`,
    )
    .join(
      "",
    )}</div><div class="row"><label>运行方式<select id="lineAutomation"><option value="review">先审核首帧，再生成视频</option><option value="auto">首帧完成后自动生成全部视频</option></select></label><button id="linePrepare" class="primary">生成动作首帧</button><span id="lineNotice" role="status"></span></div><div id="lineFrames" class="line-frame-grid"></div></section><section class="card monitor-video"><h2>3 提示词与视频</h2><div id="lineVideoSettings"></div><div id="linePrompts"></div><div class="row"><button id="lineConfirmFrames">确认首帧，准备提示词</button><button id="lineSubmit" class="primary">生成视频</button></div></section><section id="results" class="card monitor-results"><h2>4 任务与成片</h2><p id="lineResultSummary">尚未提交视频</p><div id="lineResults" class="line-video-grid"></div></section>`;
  settings(app.querySelector("#lineVideoSettings"));
  app.querySelector("#lineAutomation").value =
    localStorage.getItem("monitor:auto:" + p.id) || "review";
  app.querySelector("#lineAutomation").onchange = (e) =>
    localStorage.setItem("monitor:auto:" + p.id, e.target.value);
  let flow = null,
    busy = false,
    promptSaving = false,
    framesSignature = "",
    resultsSignature = "",
    promptsSignature = "";
  window.monitorUpdateSettings = async (selection) => {
    if (flow && flow.status !== "video_submitted")
      await post(
        `/studio/projects/${p.id}/monitor-workflow/settings`,
        selection,
      );
  };
  const notice = (text) =>
    (app.querySelector("#lineNotice").textContent = text);
  const locked = () => flow && ["images", "drafting"].includes(flow.status);
  const refresh = async () => {
    try {
      const [catalog, task, jobs] = await Promise.all([
        api("/studio"),
        api(`/studio/projects/${p.id}/monitor-workflow`),
        api("/studio/works"),
      ]);
      flow = task;
      ctx.updateCatalog(catalog);
      window.monitorPipelineDrafting = ["images", "drafting"].includes(
        task?.status,
      );
      const byId = (id) => catalog.assets.find((a) => a.id === id);
      const frames =
        task?.slots ||
        catalog.imageTasks
          .filter((v) => v.projectId === p.id)
          .flatMap((v) =>
            v.items.map((i) => ({
              ...i,
              planId: v.planId,
              index: 0,
              referenceId: i.referenceIdResult,
              history: true,
            })),
          );
      const existingFrameIds = p.plans.flatMap((plan) =>
        Array.from({ length: plan.count }, (_, i) =>
          plan.mapping === "common" ? plan.imageIds?.[0] : plan.imageIds?.[i],
        ),
      );
      const canReuse =
        !task &&
        existingFrameIds.length > 0 &&
        new Set(existingFrameIds).size === existingFrameIds.length &&
        existingFrameIds.every(
          (id) => catalog.assets.find((a) => a.id === id)?.monitorView,
        );
      const nextFramesSignature = JSON.stringify(frames);
      if (nextFramesSignature !== framesSignature) {
        framesSignature = nextFramesSignature;
        app.querySelector("#lineFrames").innerHTML = frames
          .map(
            (s) =>
              `<article class="line-frame"><strong>${esc(p.plans.find((v) => v.id === s.planId)?.snapshot.name || "动作")} · ${s.index + 1}</strong>${s.referenceId ? `<img src="${esc(byId(s.referenceId)?.previewUrl || "")}" alt="动作首帧">` : '<div class="empty">' + esc({ queued: "等待生成首帧", waiting: "首帧生成中", error: "首帧生成失败", needs_review: "提交结果待核对" }[s.status] || s.status) + "</div>"}<p>${esc(s.error || (s.status === "complete" ? "首帧已生成" : ""))}</p>${!s.history && s.status === "needs_review" ? `<label>已有图片任务编号<input data-frame-external="${s.id}"></label><button data-line-retry-frame="${s.id}">核对并恢复查询</button>` : ""}${!s.history && ["complete", "error"].includes(s.status) ? `<button data-line-retry-frame="${s.id}">${s.status === "error" ? "重试这一张" : "重新生成这一张"}</button>` : ""}</article>`,
          )
          .join("");
      }
      notice(
        task
          ? task.error ||
              {
                images: `正在生成动作首帧 · 已完成${frames.filter((s) => s.status === "complete").length}/${frames.length}张`,
                images_ready: "首帧已完成，请确认",
                drafting: "正在准备视频提示词",
                ready: "可以生成视频",
                error: "部分任务失败，请处理对应项",
                video_submitted: "本地视频任务已创建，接收和成片状态见下方",
              }[task.status] ||
              task.status
          : "请选择动作，开始准备首帧",
      );
      app.querySelectorAll("[data-line-retry-frame]").forEach(
        (b) =>
          (b.onclick = async () => {
            b.disabled = true;
            try {
              await post(`/studio/projects/${p.id}/monitor-workflow/retry`, {
                slotId: b.dataset.lineRetryFrame,
                externalId: app.querySelector(
                  `[data-frame-external="${b.dataset.lineRetryFrame}"]`,
                )?.value,
              });
              await refresh();
            } catch (e) {
              notice(e.message);
              b.disabled = false;
            }
          }),
      );
      app.querySelector("#linePrepare").disabled =
        busy || locked() || !p.plans.length;
      app.querySelector("#lineConfirmFrames").hidden =
        ["video_submitted"].includes(task?.status) ||
        (task?.status === "ready" &&
          !p.plans.some(
            (v) => v.promptsDirty || v.prompts?.length !== v.count,
          ));
      app.querySelector("#lineSubmit").hidden =
        task?.autoVideo === true || task?.status === "video_submitted";
      app.querySelector("#lineConfirmFrames").textContent = canReuse
        ? "使用已有首帧，准备视频"
        : task?.status === "ready"
          ? "按当前动作更新提示词"
          : "确认首帧，准备提示词";
      app.querySelector("#lineConfirmFrames").disabled =
        (!task && !canReuse) ||
        (!canReuse &&
          (!frames.length || !frames.every((s) => s.status === "complete"))) ||
        task?.status === "drafting";
      app.querySelector("#lineSubmit").disabled =
        busy ||
        locked() ||
        !task ||
        !frames.length ||
        !frames.every((s) => s.status === "complete") ||
        p.plans.some(
          (v) =>
            v.prompts?.length !== v.count || v.prompts.some((t) => !t.trim()),
        );
      app
        .querySelectorAll(
          "[data-line-count],[data-line-duration],[data-line-source],[data-line-action],#lineUpload,#lineAssets,#linePeople",
        )
        .forEach((e) => (e.disabled = locked()));
      const remote = catalog.projects.find((v) => v.id === p.id);
      if (
        remote &&
        !promptSaving &&
        !app.querySelector("#linePrompts textarea:focus")
      ) {
        for (const plan of p.plans) {
          const found = remote.plans.find((v) => v.id === plan.id);
          if (found) {
            plan.prompts = found.prompts;
            plan.imageIds = found.imageIds;
            plan.mapping = found.mapping;
            plan.promptsDirty = found.promptsDirty;
          }
        }
      }
      const nextPromptsSignature = JSON.stringify(
        p.plans.map((v) => [v.id, v.prompts, v.count]),
      );
      if (
        !promptSaving &&
        !app.querySelector("#linePrompts textarea:focus") &&
        nextPromptsSignature !== promptsSignature
      ) {
        promptsSignature = nextPromptsSignature;
        app.querySelector("#linePrompts").innerHTML = p.plans
          .map(
            (plan) =>
              `<details><summary>${esc(plan.snapshot.name)} · 提示词${plan.prompts?.length || 0}/${plan.count}</summary>${(plan.prompts || []).map((text, i) => `<label>视频${i + 1}的提示词<textarea data-line-prompt="${plan.id}:${i}">${esc(text)}</textarea></label>`).join("") || "<p>确认动作首帧后，在这里生成提示词。</p>"}</details>`,
          )
          .join("");
      }
      app.querySelectorAll("[data-line-prompt]").forEach(
        (e) =>
          (e.oninput = () => {
            const [id, index] = e.dataset.linePrompt.split(":");
            p.plans.find((v) => v.id === id).prompts[index] = e.value;
            promptSaving = true;
            clearTimeout(e.timer);
            e.timer = setTimeout(async () => {
              try {
                await persistPrompts();
                promptSaving = false;
              } catch (err) {
                notice("提示词未保存：" + err.message);
              }
            }, 500);
          }),
      );
      const mine = jobs.filter((j) => j.projectId === p.id),
        complete = mine.filter(
          (j) => j.status === "complete" && j.outputs?.length,
        );
      app.querySelector("#lineResultSummary").textContent =
        `成片${complete.length}条 · 任务${mine.length}条 · 失败${mine.filter((j) => j.status === "error").length}条`;
      const nextResultsSignature = JSON.stringify(mine);
      if (nextResultsSignature !== resultsSignature) {
        resultsSignature = nextResultsSignature;
        const existingVideos = new Map(
          [...app.querySelectorAll("[data-line-job]")].map((card) => [
            card.dataset.lineJob,
            {
              video: card.querySelector("video"),
              open: card.querySelector("details")?.open,
            },
          ]),
        );
        app.querySelector("#lineResults").innerHTML =
          mine
            .map(
              (j) =>
                `<article class="line-video" data-line-job="${j.id}">${j.status === "complete" && j.outputs?.length ? `<video controls preload="none" src="/api/video/${j.id}?preview=1"></video>` : '<div class="empty">' + esc(j.status === "queued" ? "尚未向生成服务提交" : j.videoRoute === "doubao" && !j.providerProgress?.conversationId ? "豆包页面尚未确认接收" : j.status === "error" ? "生成失败" : j.status === "complete" ? "未取得成片地址" : "生成服务处理中") + "</div>"}<strong>${esc(j.templateName || "视频")}</strong><p>${esc(j.error || j.providerProgress?.message || "")}</p>${j.status === "error" ? `<button data-line-retry-video="${j.id}">重试这条视频</button>` : ""}${j.status === "complete" && j.outputs?.length ? `<a class="button" href="/api/video/${j.id}?download=1">下载视频</a>` : ""}<details><summary>发送记录与提示词</summary><p>本地任务：${esc(j.id)}<br>服务任务：${esc(j.providerId || "尚无")}<br>豆包会话：${esc(j.providerProgress?.conversationId || "尚无接收确认")}</p><pre>${esc(j.prompt || "")}</pre></details></article>`,
            )
            .join("") || "<p>视频还没有提交，图片完成不代表视频完成。</p>";
        for (const card of app.querySelectorAll("[data-line-job]")) {
          const prior = existingVideos.get(card.dataset.lineJob),
            next = card.querySelector("video");
          if (
            prior?.video &&
            next &&
            prior.video.getAttribute("src") === next.getAttribute("src")
          )
            next.replaceWith(prior.video);
          if (prior?.open) card.querySelector("details").open = true;
        }
      }
      app.querySelectorAll("[data-line-retry-video]").forEach(
        (b) =>
          (b.onclick = async () => {
            b.disabled = true;
            try {
              await applySettings();
              await save();
              await persistPrompts(true);
              await post(`/studio/jobs/${b.dataset.lineRetryVideo}/retry`, {
                useProjectSettings: true,
              });
              refresh();
            } catch (e) {
              notice(e.message);
              b.disabled = false;
            }
          }),
      );
    } catch (e) {
      notice("进度读取失败：" + e.message);
    }
  };
  app.querySelectorAll("[data-line-preview]").forEach(
    (box) =>
      (box.querySelector("button").onclick = () => {
        box.innerHTML = `<video controls playsinline preload="metadata" src="${esc(box.dataset.videoUrl)}"></video>`;
        box
          .querySelector("video")
          .play()
          .catch(() => {});
      }),
  );
  app.querySelector("#lineAccounts").onclick = () =>
    window.StudioShell.openAccounts();
  const uploadRole = (role) => {
    const person = role === "personImageIds";
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = async () => {
      try {
        for (const file of input.files) {
          const base64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          const ref = await post("/references", {
            name: file.name,
            mime: file.type,
            base64,
            purpose: "store-background",
          });
          p.materials[role] = [
            ...new Set([...(p.materials[role] || []), ref.id]),
          ];
          await save();
        }
        notice(`已绑定${p.materials.sceneImageIds.length}张场景参考`);
        ctx.rerender();
      } catch (e) {
        notice(e.message);
      }
    };
    input.click();
  };
  app.querySelector("#lineUpload").onclick = () => uploadRole("sceneImageIds");
  app.querySelector("#linePeople").onclick = () => uploadRole("personImageIds");
  app.querySelectorAll("[data-remove-person]").forEach(
    (b) =>
      (b.onclick = async () => {
        p.materials.personImageIds = p.materials.personImageIds.filter(
          (id) => id !== b.dataset.removePerson,
        );
        await save();
        ctx.rerender();
      }),
  );
  app.querySelector("#lineAssets").onclick = () => {
    ctx.modal(
      "<h2>选择场景参考图</h2>" +
        data.assets
          .filter(
            (a) => a.previewUrl && ["upload", "generated"].includes(a.type),
          )
          .map(
            (a) => `<button data-line-asset="${a.id}">${esc(a.name)}</button>`,
          )
          .join(""),
    );
    document.querySelectorAll("[data-line-asset]").forEach(
      (b) =>
        (b.onclick = async () => {
          p.materials.sceneImageIds = [
            ...new Set([...p.materials.sceneImageIds, b.dataset.lineAsset]),
          ];
          await save();
          ctx.closeModal();
          ctx.rerender();
        }),
    );
  };
  app.querySelectorAll("[data-remove-scene]").forEach(
    (b) =>
      (b.onclick = async () => {
        p.materials.sceneImageIds = p.materials.sceneImageIds.filter(
          (id) => id !== b.dataset.removeScene,
        );
        for (const plan of p.plans)
          if (plan.imageConfig?.sourceSceneId === b.dataset.removeScene)
            plan.imageConfig.sourceSceneId = "";
        await save();
        ctx.rerender();
      }),
  );
  app.querySelectorAll("[data-line-action]").forEach(
    (e) =>
      (e.onchange = async () => {
        if (e.checked) {
          const t = types.find((v) => v.id === e.dataset.lineAction);
          p.plans.push({
            id: crypto.randomUUID(),
            templateId: t.id,
            count: 1,
            duration: 5,
            videoRoute: ctx.choice.videoRoute,
            resolution: ctx.choice.resolution,
            ratio: "9:16",
            autoRatio: true,
            referenceMode: "first-frame",
            mapping: "one-to-one",
            imageIds: [],
            rows: [],
            shotImages: [],
            imageConfig: {},
            creativeBrief: "",
            content: "",
            snapshot: t,
            prompts: [],
          });
        } else
          p.plans = p.plans.filter(
            (v) => v.templateId !== e.dataset.lineAction,
          );
        await save();
        ctx.rerender();
      }),
  );
  app.querySelectorAll("[data-line-duration]").forEach(
    (e) =>
      (e.onchange = async () => {
        const plan = p.plans.find((v) => v.id === e.dataset.lineDuration);
        plan.duration = Number(e.value);
        plan.promptsDirty = true;
        await save();
      }),
  );
  app.querySelectorAll("[data-line-count]").forEach(
    (e) =>
      (e.onchange = async () => {
        p.plans.find((v) => v.id === e.dataset.lineCount).count = Math.max(
          1,
          Math.min(30, Math.floor(Number(e.value)) || 1),
        );
        await save();
        ctx.rerender();
      }),
  );
  app.querySelectorAll("[data-line-source]").forEach(
    (e) =>
      (e.onchange = async () => {
        const plan = p.plans.find((v) => v.id === e.dataset.lineSource);
        plan.imageConfig = { ...plan.imageConfig, sourceSceneId: e.value };
        await save();
      }),
  );
  app.querySelector("#linePrepare").onclick = async () => {
    try {
      busy = true;
      await applySettings();
      await save();
      flow = await post(`/studio/projects/${p.id}/monitor-workflow`, {
        autoVideo: app.querySelector("#lineAutomation").value === "auto",
      });
      await window.monitorUpdateSettings(ctx.choice);
      await refresh();
    } catch (e) {
      notice(e.message);
    } finally {
      busy = false;
    }
  };
  app.querySelector("#lineConfirmFrames").onclick = async () => {
    try {
      if (!flow) {
        await save();
        flow = await post(`/studio/projects/${p.id}/monitor-workflow`, {
          reuseExisting: true,
          autoVideo: false,
        });
      }
      await post(`/studio/projects/${p.id}/monitor-workflow/confirm`, {});
      refresh();
    } catch (e) {
      notice(e.message);
    }
  };
  app.querySelector("#lineSubmit").onclick = async () => {
    try {
      busy = true;
      await applySettings();
      await save();
      await persistPrompts(true);
      const batch = await post(`/studio/projects/${p.id}/submit`, {
        requestId: flow.id + ":manual-video",
        generationSettings: ctx.choice,
      });
      notice("本地任务已创建，进度和结果在本页显示。");
      await refresh();
      app
        .querySelector(".monitor-results")
        .scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      notice("视频未提交：" + e.message);
    } finally {
      busy = false;
    }
  };
  refresh();
  renderMonitorWorkspace.timer = setInterval(refresh, 2500);
}
