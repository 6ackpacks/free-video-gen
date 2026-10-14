import {
  primaryReference,
  referenceGroups,
  assignOriginal,
  projectImageIds,
  imageReady,
} from "./monitor-ui-state.js";

export function renderMonitorStudio(ctx) {
  const {
    project: p,
    app,
    esc,
    api,
    post,
    save,
    settings,
    applySettings,
    persistPrompts,
  } = ctx;
  let data = ctx.data,
    step =
      new URLSearchParams(location.search).get("step") ||
      localStorage.getItem("monitor:step:" + p.id) ||
      (p.plans.length ? "production" : "templates");
  clearInterval(renderMonitorStudio.timer);
  document.querySelector(".bottom")?.remove();
  app.className = "monitor-studio monitor-auto";
  window.monitorPipelineDrafting = false;
  p.materials ||= {
    sceneImageIds: [],
    personImageIds: [],
    productImageIds: [],
  };
  const allowed = data.templateTypes.find(
    (t) => t.id === p.templateTypeId,
  )?.actionIds;
  const templates = data.templates.filter(
    (t) =>
      t.packId === "foot-spa-store" &&
      !t.archived &&
      (!allowed || allowed.includes(t.id)),
  );
  let selectedImage =
      p.commonImageId || localStorage.getItem("monitor:image:" + p.id) ||
      projectImageIds(p)[0] ||
      "",
    search = "",
    category = "all",
    polling = false,
    promptSaving = false;
  let directDraft = null,
    productionTask = null,
    flow = null,
    imageTask = null,
    transformTask = null,
    pendingImage = localStorage.getItem("monitor:pending:" + p.id) || "",
    actionBusy = false,
    submitBusy = false,
    promptStarting = false,
    processingMode = localStorage.getItem("monitor:processing:" + p.id) || "",
    videoSignature = "",
    promptSignature = "",
    completedSlots = new Set(),videoBusy=false;
  let rememberedImages = [];
  let sourceSceneId=localStorage.getItem('monitor:scene-source:'+p.id)||p.materials.sceneImageIds.find(id=>data.assets.some(a=>a.id===id&&a.type==='upload'&&!a.projectId))||'';
  const chooseSource=id=>{sourceSceneId=id||'';localStorage.setItem('monitor:scene-source:'+p.id,sourceSceneId);};
  try { rememberedImages = JSON.parse(localStorage.getItem("monitor:handled:" + p.id) || "[]"); } catch {}
  const handledImages = new Set(Array.isArray(rememberedImages) ? rememberedImages : []);
  const showCandidate = async (id) => {
    if (handledImages.has(id)) return;
    if (!asset(id)) await refreshData();
    if (!p.materials.sceneImageIds.includes(id)) {
      p.materials.sceneImageIds.push(id);
      await saveProject();
    }
    pendingImage = id;
    selectedImage = id;
    handledImages.add(id);
    localStorage.setItem(
      "monitor:handled:" + p.id,
      JSON.stringify([...handledImages]),
    );
    localStorage.setItem("monitor:pending:" + p.id, id);
    drawImages();
    drawPlans();
  };
  const asset = (id) => data.assets.find((a) => a.id === id),
    template = (id) => templates.find((t) => t.id === id),
    total = () => p.plans.reduce((n, v) => n + v.count, 0);
  const message = (text) => {
    const target = app.querySelector("#studioNotice");
    if (target) target.textContent = text;
  };
  const saveProject = async () => {
    const result = await save();
    for (const plan of p.plans) {
      const remote = result.plans.find((v) => v.id === plan.id);
      if (remote) {
        plan.promptsDirty = remote.promptsDirty;
        plan.signature = remote.signature;
      }
    }
    return result;
  };
  const imageBusy = () =>
    actionBusy ||
    (imageTask && !["complete", "error"].includes(imageTask.status)) ||
    (transformTask && !["complete", "error"].includes(transformTask.status));
  const setProcessing = (mode) => {
    processingMode = mode;
    localStorage.setItem("monitor:processing:" + p.id, mode);
  };
  function drawImageLoading() {
    const preview=app.querySelector('#studioImagePreview');if(!preview)return;
    preview.querySelector('.studio-image-loading')?.remove();
    const task=processingMode==='auto'?productionTask:processingMode==='image'?imageTask:processingMode==='transform'?transformTask:processingMode==='variants'?flow:null;
    const item=processingMode==='image'?task?.items?.[0]:task;
    const busy=actionBusy||item&&!['complete','error','needs_review','images_ready','ready','submitted'].includes(item.status);
    const error=item?.status==='error';if(!busy&&!error)return;
    const title=error?(processingMode==='auto'?'本次制作未完成':'底图生成失败'):processingMode==='auto'?'正在自动制作':processingMode==='transform'?'正在加工监控视角':processingMode==='variants'?'正在生成动作底图':'正在生成AI底图';
    const stage=processingMode==='auto'&&!error?`图片 ${productionTask?.imageCompleted||0}/${productionTask?.imageTotal||total()} · ${productionTask?.stage==='scene'?'分析场景结构':productionTask?.stage==='images'?'生成监控底图':productionTask?.stage==='submit'?'提交视频':'准备视频动作描述'}`:error?item.error||task.error||'请查看下方失败原因':item?.status==='downloading'?'画面已生成，正在保存到项目':item?.status==='queued'?'任务已收到，正在排队':'正在等待生成服务返回图片';
    const panel=document.createElement('div');panel.className='studio-image-loading'+(error?' failed':'');panel.setAttribute('role','status');panel.innerHTML=`${error?'<b class="studio-loading-icon">!</b>':'<i class="studio-loading-spinner"></i>'}<strong>${esc(title)}</strong><p>${esc(stage)}</p>${error?'<button id="studioPreviewRetry">重试这张底图</button>':'<div class="studio-loading-track"><i></i></div><small>完成后自动保存到本项目 · 可离开后回来查看</small>'}`;preview.append(panel);
    panel.querySelector('button')?.addEventListener('click',()=>processingMode==='auto'?submit(!!productionTask?.trial):app.querySelector('#studioRetryImage')?.click());if(error&&processingMode==='auto')panel.querySelector('button').textContent='重试未完成的制作';
  }
  const refreshData = async () => {
    data = await api("/studio");
    ctx.updateCatalog(data);
    return data;
  };
  const go = (target) => {
    step = target;
    localStorage.setItem("monitor:step:" + p.id, target);
    const url = new URL(location.href);
    url.searchParams.set("step", target);
    history.pushState({ monitorStep: target }, "", url);
    render();
    scrollTo(0, 0);
  };
  const stepBar = () =>
    `<div class="studio-stepbar"><button data-step="templates" class="${step === "templates" ? "current" : "done"}"><b>${step === "templates" ? "1" : "✓"}</b>选择模板</button><span>→</span><button data-step="production" class="${step === "production" ? "current" : ""}" ${p.plans.length ? "" : "disabled"}><b>2</b>底图与视频</button>${step === "production" ? '<button class="studio-back" data-step="templates">← 上一步：选择模板</button>' : ""}</div>`;
  function preview(ref, title) {
    if (ref?.videoUrl)
      ctx.modal(
        `<h2>${esc(title)}</h2><video class="big-preview" controls playsinline preload="metadata" poster="${esc(ref.posterUrl || "")}" src="${esc(ref.videoUrl)}"></video>${ref.source ? `<a class="button" href="${esc(ref.source.url)}" target="_blank" rel="noopener noreferrer">在抖音看原作 ↗</a>` : ""}`,
      );
  }
  function selection() {
    app.innerHTML =
      stepBar() +
      `<div class="studio-select-layout"><section><div class="studio-page-title"><h1>选择动作模板</h1><p>每个动作分别生成视频，下一步准备底图并选择模型。</p></div><div class="studio-filters"><input id="studioActionSearch" placeholder="搜索动作"><div id="studioCategories">${[
        ["all", "全部"],
        ["door", "门口互动"],
        ["corridor", "走廊同行"],
        ["daily", "门店日常"],
      ]
        .map(
          ([id, name]) =>
            `<button data-category="${id}" class="${category === id ? "active" : ""}">${name}</button>`,
        )
        .join(
          "",
        )}</div></div><div id="studioActionGallery"></div></section><aside class="studio-selection card"><h2>已选动作 <span id="studioSelectedCount"></span></h2><div id="studioSelectedActions"></div><p>可在下一步设置数量、时长和底图。</p><div class="studio-tip">ⓘ 上传的动作原图可以直接使用。</div></aside></div><footer class="studio-footer"><span id="studioSelectionTotal"></span><div><a class="button" href="/projects">返回项目</a><button id="studioNext" class="primary">下一步：准备底图 →</button></div></footer><div id="studioNotice" role="status"></div>`;
    const matches = (t) => {
      const text = t.name + t.description;
      if (search && !text.includes(search)) return false;
      return (
        category === "all" ||
        (category === "door"
          ? /门|房间/.test(text)
          : category === "corridor"
            ? /走廊|同行|带路|楼梯/.test(text)
            : !/敲门|进入|同行|带路/.test(text))
      );
    };
    const summary = () => {
      app.querySelector("#studioSelectedCount").textContent = p.plans.length;
      app.querySelector("#studioSelectionTotal").innerHTML =
        `已选择 <b>${p.plans.length}</b> 个动作`;
      app.querySelector("#studioNext").disabled = !p.plans.length;
      app.querySelector("#studioSelectedActions").innerHTML =
        p.plans
          .map((v) => {
            const ref = primaryReference(template(v.templateId));
            return `<article>${ref?.posterUrl ? `<img src="${esc(ref.posterUrl)}" alt="${esc(v.snapshot.name)}参考">` : '<span class="studio-mini-empty">▧</span>'}<strong>${esc(v.snapshot.name)}</strong><button data-unselect="${v.templateId}" aria-label="移除${esc(v.snapshot.name)}">×</button></article>`;
          })
          .join("") ||
        '<div class="studio-empty">勾选左侧动作，组成制作计划。</div>';
      app
        .querySelectorAll("[data-unselect]")
        .forEach((b) => (b.onclick = () => toggle(b.dataset.unselect, false)));
    };
    const toggle = async (id, checked) => {
      if (checked) {
        if (!p.plans.some((v) => v.templateId === id)) {
          const t = template(id);
          p.plans.push({
            id: crypto.randomUUID(),
            templateId: id,
            count: 1,
            duration: 5,
            videoRoute: ctx.choice.videoRoute,
            resolution: ctx.choice.resolution,
            ratio: "9:16",
            autoRatio: true,
            referenceMode: "first-frame",
            mapping: "common",
            imageIds: [],
            rows: [],
            shotImages: [],
            imageConfig: {},
            creativeBrief: "",
            content: "",
            snapshot: t,
            prompts: [],
          });
        }
      } else p.plans = p.plans.filter((v) => v.templateId !== id);
      const card = app.querySelector(`[data-action-card="${CSS.escape(id)}"]`);
      if (card) {
        card.classList.toggle("selected", checked);
        card.querySelector("input").checked = checked;
      }
      summary();
      try {
        await saveProject();
      } catch (e) {
        message(e.message);
      }
    };
    const gallery = () => {
      app.querySelector("#studioActionGallery").innerHTML =
        referenceGroups(templates.filter(matches))
          .filter((g) => g.items.length)
          .map(
            (g) =>
              `<section class="studio-action-group" data-reference-group="${g.id}"><h2>${g.name} <span>${g.items.length}</span></h2><div class="studio-action-grid">${g.items
                .map((t) => {
                  const ref = primaryReference(t),
                    selected = p.plans.some((v) => v.templateId === t.id);
                  return `<article class="studio-action-card ${selected ? "selected" : ""}" data-action-card="${t.id}"><label class="studio-check"><input data-studio-action="${t.id}" aria-label="选择${esc(t.name)}" type="checkbox" ${selected ? "checked" : ""}></label>${ref?.videoUrl ? `<button class="studio-action-preview" data-action-preview="${t.id}" aria-label="预览${esc(t.name)}"><img src="${esc(ref.posterUrl)}" alt="${esc(t.name)}原片"><span class="studio-play">▶</span><small>原作参考</small></button>` : `<div class="studio-action-missing"><span>${g.id === "external" ? "▻" : "▧"}</span><small>${g.id === "external" ? "本地原片待导入" : "暂无参考，可正常制作"}</small></div>`}<h3>${esc(t.name)}</h3><div class="studio-card-actions">${ref?.videoUrl ? `<button data-action-preview="${t.id}">▶ 播放参考</button>` : ""}${ref?.source ? `<a href="${esc(ref.source.url)}" target="_blank" rel="noopener noreferrer">在抖音看原作 ↗</a>` : "<small>后续补充配图</small>"}</div></article>`;
                })
                .join("")}</div></section>`,
          )
          .join("") ||
        '<div class="studio-empty">没有匹配的动作，请更换搜索或分类。</div>';
      app
        .querySelectorAll("[data-studio-action]")
        .forEach(
          (e) => (e.onchange = () => toggle(e.dataset.studioAction, e.checked)),
        );
      app
        .querySelectorAll("[data-action-preview]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              preview(
                primaryReference(template(b.dataset.actionPreview)),
                template(b.dataset.actionPreview).name,
              )),
        );
    };
    app.querySelector("#studioActionSearch").oninput = (e) => {
      search = e.target.value;
      gallery();
    };
    app.querySelectorAll("[data-category]").forEach(
      (b) =>
        (b.onclick = () => {
          category = b.dataset.category;
          app
            .querySelectorAll("[data-category]")
            .forEach((v) => v.classList.toggle("active", v === b));
          gallery();
        }),
    );
    app.querySelector("#studioNext").onclick = () => go("production");
    gallery();
    summary();
  }
  function production() {
    if (!p.plans.length) {
      step = "templates";
      selection();
      return;
    }
    app.innerHTML =
      stepBar() +
      `<div class="studio-page-title"><h1>底图与视频</h1><p>选择动作、数量和模型，场景可选上传。确认后后台自动生成监控图片与视频。</p></div><section class="studio-customization card"><header><h2>人物与门店设置 <small>批量生成前可修改</small></h2><p>不改模板动作和监控机位，统一应用到本次新生成的底图与视频。</p></header><div class="studio-customization-fields"><label>门店名称（选填）<input id="studioStoreName" maxlength="80" value="${esc(p.brandName||'')}" placeholder="例如：悦足堂足浴养生"><small>自然放在背景的实体招牌上，已有成片保持原样。</small></label><label>人物形象（选填）<textarea id="studioAppearance" maxlength="2000" placeholder="例如：清秀漂亮、自然淡妆、整洁高马尾、得体门店制服">${esc(p.peopleBrief||'')}</textarea><small>默认优化五官和仪容；上传人物图时保留其身份。</small></label><label>背景与细节补充（选填）<textarea id="studioSceneBrief" maxlength="3000" placeholder="例如：中式足浴店走廊、木饰面、暖色壁灯、包间号码牌；墙面有门店招牌">${esc(p.contentBrief||'')}</textarea><small>默认使用真实足浴店环境，保留上传场景的空间结构。</small></label></div></section><div class="studio-production-layout"><section class="studio-material-panel card"><header><h2>场景参考与生成素材</h2><div><button id="studioUpload">↥ 上传场景（可选）</button><button id="studioAssets">▧ 我的素材</button><button id="studioGenerateImage" hidden>✧ AI生成底图</button></div></header><details class="studio-legacy-image-tools"><summary>已有底图的高级操作</summary><div class="studio-image-tools"><button id="studioUseOriginal" class="active">✓ 直接使用原图</button><button id="studioTransform">◉ 监控视角加工</button><button id="studioVariants">✧ 按动作生成变体</button></div></details><div id="studioImagePreview" class="studio-image-preview"></div><p class="studio-image-hint" id="studioImageHint">上传场景只作空间参考，后台会为每条视频生成独立监控图片。</p><div id="studioImageProgress" role="status"></div><h3 id="studioImagesCount">已上传的底图</h3><div id="studioImageThumbs" class="studio-image-thumbs"></div><div class="studio-people"><h3>人物参考（可选）</h3><div id="studioPersonThumbs"></div><button id="studioPeople">＋ 添加人物图</button><small>上传后保留该人物身份；不上传时自动生成不同人物。</small></div></section><div class="studio-production-right"><section class="studio-assignment card"><header><h2>动作与底图分配</h2><small>一张底图可用于多个视频，数量由你设置。</small></header><div id="studioPlanRows"></div></section><section class="studio-settings card"><h2>视频设置</h2><div id="studioVideoSettings"></div></section><section class="studio-prompts card" id="studioCompletedPrompts" hidden><header><h2>提示词 <small id="studioPromptCount"></small></h2><button id="studioGeneratePrompts" hidden>更新提示词</button></header><div id="studioPromptState" role="status"></div><div id="studioPromptList"></div></section></div></div><section id="results" class="studio-results card"><header><h2>任务与成片 <small id="studioResultCount"></small></h2><button id="studioOpenAccounts">豆包账号池</button></header><div id="studioResults"></div></section><footer class="studio-footer"><span id="studioProductionTotal"></span><div><select id="studioTrialSlot" aria-label="试片动作"></select><button id="studioTrial">生成1条试片</button><button id="studioSubmit" class="primary">批量生成</button></div></footer><div id="studioNotice" role="status"></div>`;
    for(const [id,key] of [['studioStoreName','brandName'],['studioAppearance','peopleBrief'],['studioSceneBrief','contentBrief']]){const input=app.querySelector('#'+id);input.oninput=()=>{p[key]=input.value;};input.onchange=async()=>{try{await saveProject();}catch(e){message(e.message);}};}
    settings(app.querySelector("#studioVideoSettings"));
    const fifth = app.querySelector("#projectReferenceMode")?.closest("label");
    if (fifth) {
      const details = document.createElement("details");
      details.className = "studio-advanced";
      details.innerHTML = "<summary>图片用途与高级设置</summary>";
      details.append(fifth);
      app.querySelector("#studioVideoSettings").append(details);
    }
    drawImages();
    drawPlans();
    drawPrompts();
    bindProduction();
    refresh();
  }
  function drawImages() {
    if (!app.querySelector("#studioImagePreview")) return;
    const ids = [...new Set([...projectImageIds(p),...data.assets.filter(a=>a.projectId===p.id&&!a.archived).map(a=>a.id)])];
    if (pendingImage && !ids.includes(pendingImage)) ids.push(pendingImage);
    if (!asset(selectedImage))
      selectedImage = ids.find((id) => asset(id)) || "";
    const current = asset(selectedImage),
      position = ids.indexOf(selectedImage) + 1;
    app.querySelector("#studioImagePreview").innerHTML = current
      ? `<img src="${esc(current.previewUrl)}" alt="${esc(current.name)}"><span>${pendingImage === current.id ? "生成结果 · 待采用" : current.monitorView ? "监控底图" : "原图" + position} · ${esc(current.name)}</span><button id="studioLargeImage">⌕ 查看大图</button>`
      : '<div class="studio-empty"><strong>场景参考可选，不上传也能制作</strong><p>上传后保留门店结构；不上传时自动创建不同场景、人物与动作底图。每张均带老旧监控质感。</p><button id="studioFirstUpload">＋ 上传自己的场景</button></div>';
    app.querySelector("#studioImagesCount").textContent =
      `项目图片素材（${ids.length}）`;
    app.querySelector("#studioImageThumbs").innerHTML =
      ids
        .map((id, index) => {
          const a = asset(id);
          return a
            ? `<div class="studio-image-thumb ${id === selectedImage ? "selected" : ""}"><button data-preview-image="${id}"><img src="${esc(a.previewUrl)}" alt="${esc(a.name)}"><span>${a.type === "generated" ? "AI底图" : a.monitorView ? "监控底图" : "原图"}${index + 1}</span></button><button data-remove-image="${id}" class="studio-remove" aria-label="从项目移除${esc(a.name)}">×</button></div>`
            : "";
        })
        .join("") +
      '<button id="studioAddImage" class="studio-add-image">＋<small>添加图片</small></button>';
    app.querySelector("#studioPersonThumbs").innerHTML = (
      p.materials.personImageIds || []
    )
      .map(
        (id) =>
          `<div><img src="${esc(asset(id)?.previewUrl || "")}" alt="人物参考"><button data-remove-person="${id}" aria-label="移除人物图">×</button></div>`,
      )
      .join("");
    const pending = pendingImage === selectedImage || current?.confirmed === false;
    app.querySelector("#studioImageHint").textContent = productionTask?.prepareImages?"图片自动保存并对应各条视频，无需手动采用。":pending
      ? "预览生成结果；点击“采用这张底图”后才用于视频，原图保留。"
      : current
        ? current.monitorView
          ? "当前为监控底图，可直接用于视频。"
          : current.type==="generated"?"按监控模板生成的项目图片，对应视频沿用这张图的人物与场景。":"场景参考保留门店结构；正式制作时自动生成监控视角图片。"
        : "场景可选上传；不上传时后台自动生成监控图片与视频。";
    app.querySelector("#studioUseOriginal").textContent = pending
      ? "✓ 采用这张底图"
      : "✓ 直接使用原图";
    app.querySelector("#studioTransform").disabled = !current || actionBusy;
    app.querySelector("#studioUseOriginal").disabled = !current;
    app.querySelector("#studioVariants").disabled = actionBusy;
    drawImageLoading();
    app
      .querySelector("#studioLargeImage")
      ?.addEventListener("click", () =>
        ctx.modal(
          `<h2>${esc(current.name)}</h2><img class="big-preview" src="${esc(current.previewUrl)}" alt="${esc(current.name)}">`,
        ),
      );
    for (const id of ["studioFirstUpload", "studioAddImage"])
      app
        .querySelector("#" + id)
        ?.addEventListener("click", () => upload("sceneImageIds"));
    app.querySelectorAll("[data-preview-image]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedImage = b.dataset.previewImage;
          chooseSource(selectedImage);
          localStorage.setItem("monitor:image:" + p.id, selectedImage);
          drawImages();
        }),
    );
    app.querySelectorAll("[data-remove-image]").forEach(
      (b) =>
        (b.onclick = async () => {
          const id = b.dataset.removeImage;
          p.materials.sceneImageIds = p.materials.sceneImageIds.filter(
            (v) => v !== id,
          );
          if (p.commonImageId === id) p.commonImageId = "";
          for (const plan of p.plans) {
            plan.imageIds = plan.mapping === "one-to-one" ? plan.imageIds.map((v) => v === id ? "" : v) : plan.imageIds.filter((v) => v !== id);
            if (plan.imageConfig?.sourceSceneId === id)
              plan.imageConfig.sourceSceneId = "";
          }
          if (pendingImage === id) pendingImage = "";
          if(sourceSceneId===id)chooseSource('');
          try {
            await saveProject();
            drawImages();
            drawPlans();
          } catch (e) {
            message(e.message);
          }
        }),
    );
    app.querySelectorAll("[data-remove-person]").forEach(
      (b) =>
        (b.onclick = async () => {
          p.materials.personImageIds = p.materials.personImageIds.filter(
            (id) => id !== b.dataset.removePerson,
          );
          await saveProject();
          drawImages();
        }),
    );
  }
  function drawPlans() {
    if (!app.querySelector("#studioPlanRows")) return;
    const ids = projectImageIds(p),
      route = data.routes.find((r) => r.id === ctx.choice.videoRoute),
      values =
        route?.duration?.values ||
        Array.from(
          {
            length: Math.max(
              0,
              Math.min(route?.duration?.max || 15, 15) -
                (route?.duration?.min || 2) +
                1,
            ),
          },
          (_, i) => (route?.duration?.min || 2) + i,
        );
    app.querySelector("#studioPlanRows").innerHTML = p.plans
      .map((plan) => {
        const ref = primaryReference(template(plan.templateId));
        return `<article>${ref?.posterUrl ? `<button class="studio-plan-preview" data-plan-preview="${plan.templateId}"><img src="${esc(ref.posterUrl)}" alt="${esc(plan.snapshot.name)}原片"></button>` : '<span class="studio-mini-empty">▧</span>'}<strong>${esc(plan.snapshot.name)}</strong><label>底图<select data-plan-image="${plan.id}"><option value="">请选择底图</option>${ids.map((id, i) => `<option value="${id}" ${plan.imageIds?.[0] === id ? "selected" : ""}>${asset(id)?.monitorView ? "监控图" : asset(id)?.type === "generated" ? "AI图" : "原图"}${i + 1} · ${esc(asset(id)?.name || "图片")}</option>`).join("")}</select></label><label>数量<input type="number" min="1" max="30" data-plan-count="${plan.id}" value="${plan.count}"></label><label>时长<select data-video-duration="${plan.id}" data-plan-duration="${plan.id}">${values.includes(plan.duration) ? "" : `<option value="${plan.duration}">${plan.duration}秒（不支持）</option>`}${values.map((v) => `<option value="${v}" ${v === plan.duration ? "selected" : ""}>${v}秒</option>`).join("")}</select></label>${plan.mapping === "one-to-one" && plan.imageIds.length > 1 ? `<small class="studio-plan-mapping">已按${plan.imageIds.length}张图片逐条分配</small>` : ""}</article>`;
      })
      .join("");
    app
      .querySelectorAll("[data-plan-preview]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            preview(
              primaryReference(template(b.dataset.planPreview)),
              template(b.dataset.planPreview).name,
            )),
      );
    app.querySelectorAll("[data-plan-image]").forEach(
      (e) =>
        (e.onchange = async () => {
          const plan = p.plans.find((v) => v.id === e.dataset.planImage);
          if(e.value){await api('/studio/assets/'+e.value,{method:'PATCH',body:{confirmed:true}});await refreshData();if(pendingImage===e.value){pendingImage='';localStorage.removeItem('monitor:pending:'+p.id);}}
          assignOriginal(plan, e.value);
          await saveProject();
          drawImages();
          drawPrompts();
          updateButtons();
        }),
    );
    app.querySelectorAll("[data-plan-count]").forEach(
      (e) =>
        (e.onchange = async () => {
          const plan = p.plans.find((v) => v.id === e.dataset.planCount);
          plan.count = Math.max(
            1,
            Math.min(30, Math.floor(Number(e.value)) || 1),
          );
          plan.promptsDirty = !!plan.prompts.length;
          await saveProject();
          drawPrompts();
          updateButtons();
        }),
    );
    app.querySelectorAll("[data-plan-duration]").forEach(
      (e) =>
        (e.onchange = async () => {
          const plan = p.plans.find((v) => v.id === e.dataset.planDuration);
          plan.duration = Number(e.value);
          plan.promptsDirty = !!plan.prompts.length;
          await saveProject();
          drawPrompts();
          updateButtons();
        }),
    );
    const priorTrial = app.querySelector("#studioTrialSlot").value;
    const slots = p.plans.flatMap((v) =>
        Array.from({ length: v.count }, (_, index) => ({
          id: v.id + ":" + index,
          name: v.snapshot.name + " · " + (index + 1),
        })),
      ),
      trial = app.querySelector("#studioTrialSlot");
    trial.innerHTML = slots
      .map((v) => `<option value="${v.id}">${esc(v.name)}</option>`)
      .join("");
    if ([...trial.options].some((o) => o.value === priorTrial))
      trial.value = priorTrial;
    updateButtons();
  }
  function drawPrompts() {
    if (!app.querySelector("#studioPromptList")) return;
    const signature = JSON.stringify(
      [p.plans.map((v) => [v.id, v.prompts, v.promptsDirty, v.count]),[...completedSlots]],
    );
    if (
      promptSaving ||
      app.querySelector("[data-prompt]:focus") ||
      signature === promptSignature
    )
      return;
    promptSignature = signature;
    const open = new Set(
      [...app.querySelectorAll("#studioPromptList details[open]")].map(
        (e) => e.dataset.promptGroup,
      ),
    );
    app.querySelector("#studioPromptList").innerHTML = p.plans
      .filter(plan=>[...completedSlots].some(v=>v.startsWith(plan.id+":")))
      .map(
        (plan, i) =>
          `<details data-prompt-group="${plan.id}" ${open.has(plan.id) || (!open.size && i === 0) ? "open" : ""}><summary><b>${i + 1}</b>${esc(plan.snapshot.name)}<small>${plan.prompts.length}/${plan.count}</small></summary>${plan.promptsDirty ? '<p class="studio-warning">设置已改变，可以更新提示词或编辑后直接生成。</p>' : ""}${plan.prompts.length ? plan.prompts.map((text, index) => completedSlots.has(plan.id+":"+index) ? `<label>${plan.count > 1 ? "视频" + (index + 1) : ""}<textarea data-prompt="${plan.id}:${index}" aria-label="${esc(plan.snapshot.name)}提示词${index + 1}">${esc(text)}</textarea><button data-remake-prompt="${plan.id}:${index}">用此提示词重新生成</button></label>` : "").join("") : '<p class="studio-muted">点击“生成 / 更新提示词”，本页查看和编辑结果。</p>'}</details>`,
      )
      .join("");
    app.querySelectorAll("[data-remake-prompt]").forEach(b=>b.onclick=()=>remakePrompt(b.dataset.remakePrompt));
    app.querySelectorAll("[data-prompt]").forEach(
      (e) =>
        (e.oninput = () => {
          const [id, index] = e.dataset.prompt.split(":");
          p.plans.find((v) => v.id === id).prompts[index] = e.value;
          promptSaving = true;
          clearTimeout(e.timer);
          e.timer = setTimeout(async () => {
            try {
              await savePromptSlot(id,Number(index),e.value);
              promptSaving = false;
              updateButtons();
            } catch (err) {
              message("提示词未保存：" + err.message);
            }
          }, 500);
        }),
    );
  }
  async function savePromptSlot(planId,index,prompt) {
    if(!prompt.trim())throw Error("请输入这条视频的新描述");
    await post(`/studio/projects/${p.id}/prompts`,{slot:{planId,index,prompt},confirm:true});
  }
  async function flushEditedPrompts(){
    for(const el of app.querySelectorAll("[data-prompt]")){const [id,index]=el.dataset.prompt.split(":");clearTimeout(el.timer);await savePromptSlot(id,Number(index),el.value);}
  }
  async function remakePrompt(value) {
    try { await flushEditedPrompts(); app.querySelector("#studioTrialSlot").value=value; await submit(true); } catch(e) { message("未重新生成："+e.message); }
  }
  function updateButtons() {
    if (!app.querySelector("#studioSubmit")) return;
    const prepared = p.plans.reduce(
      (n, v) => n + v.prompts.filter((s) => s?.trim()).length,
      0,
    );
    app.querySelector("#studioPromptCount").textContent =
      `已准备 ${prepared}/${total()}`;
    app.querySelector("#studioProductionTotal").innerHTML =
      `<b>${p.plans.length}</b> 个动作 · 共 <b>${total()}</b> 条视频 · ${sourceSceneId?"参考场景已选择":"无需上传场景"} · 逐条自动生图与制作`;
    const drafting = productionTask?.status === "preparing";
    app.querySelectorAll("#studioVideoSettings select,#studioStoreName,#studioAppearance,#studioSceneBrief").forEach(el=>el.disabled=drafting||submitBusy);
    window.monitorPipelineDrafting = drafting || flow?.status === "images";
    app.querySelectorAll("[data-prompt]").forEach(el => { el.disabled = drafting; });
    app
      .querySelectorAll(
        "[data-plan-image],[data-plan-count],[data-plan-duration],#studioUpload,#studioAssets,#studioGenerateImage,#studioPeople,#studioTransform,#studioUseOriginal,#studioVariants,[data-remove-image],[data-remove-person]",
      )
      .forEach((e) => {
        e.disabled =
          window.monitorPipelineDrafting ||
          submitBusy ||
          ((e.id === "studioUseOriginal" || e.id === "studioTransform") &&
            !asset(selectedImage));
      });
    app.querySelector("#studioGeneratePrompts").disabled = drafting;
    for (const id of [
      "studioTransform",
      "studioGenerateImage",
      "studioVariants",
    ])
      app.querySelector("#" + id).disabled =
        app.querySelector("#" + id).disabled || imageBusy();
    app.querySelector("#studioSubmit").textContent = submitBusy
      ? "正在提交…"
      : videoBusy?"视频生成中…":`${completedSlots.size?"再生成一批 · ":"批量生成"}${total()}条`;
    app.querySelector("#studioSubmit").disabled =
      submitBusy ||
      videoBusy ||
      drafting ||
      !p.plans.length ||
      false;
    const trial = app.querySelector("#studioTrialSlot").value.split(":"),
      trialPlan = p.plans.find((v) => v.id === trial[0]);
    app.querySelector("#studioTrial").disabled =
      submitBusy ||
      videoBusy ||
      drafting ||
      !trialPlan ||
      false;
    drawImageLoading();
  }
  async function upload(role) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = async () => {
      if (!input.files.length) return;
      if ((p.materials[role]?.length || 0) + input.files.length > 12) {
        message("每类最多12张图片，请减少选择");
        return;
      }
      try {
        let index = 0;
        for (const file of input.files) {
          message(`正在保存图片 ${++index}/${input.files.length}`);
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
          p.materials[role] ||= [];
          p.materials[role].push(ref.id);
          if (role === "sceneImageIds") {
            if(!sourceSceneId)chooseSource(ref.id);
            if (!selectedImage) selectedImage = ref.id;
            for (const plan of p.plans)
              if (!plan.imageIds.length) assignOriginal(plan, ref.id);
          }
          await saveProject();
        }
        await refreshData();
        drawImages();
        drawPlans();
        message(`已保存${input.files.length}张图片，可直接使用或选择加工。`);
      } catch (e) {
        message(e.message);
        await refreshData();
        drawImages();
      }
    };
    input.click();
  }
  async function adopt(id) {
    await api("/studio/assets/" + id, {
      method: "PATCH",
      body: { confirmed: true },
    });
    if (!p.materials.sceneImageIds.includes(id))
      p.materials.sceneImageIds.push(id);
    const source = localStorage.getItem("monitor:processing-source:" + p.id);
    for (const plan of p.plans) {
      if (!plan.imageIds.some(Boolean)) assignOriginal(plan,id);
      else if (pendingImage === id && source && plan.imageIds.includes(source)) {
        plan.imageIds = plan.imageIds.map(v=>v===source?id:v);
        plan.promptsDirty = !!plan.prompts.length;
      }
    }
    p.commonImageId = p.plans.every(v=>v.mapping==="common"&&v.imageIds[0]===id) ? id : "";
    selectedImage = id;
    pendingImage = "";
    setProcessing("original");
    localStorage.removeItem("monitor:pending:" + p.id);
    await saveProject();
    await refreshData();
    drawImages();
    drawPlans();
    drawPrompts();
    updateButtons();
  }
  async function generatePrompts() {
    if (promptStarting || directDraft?.status === "running") return;
    try {
      promptStarting = true;
      updateButtons();
      await applySettings();
      await saveProject();
      directDraft = await post(`/studio/projects/${p.id}/draft`, {
        requestId: crypto.randomUUID(),
        mode: p.plans.some((v) => v.promptsDirty) ? "dirty" : "missing",
      });
      localStorage.setItem("monitor:draft:" + p.id, directDraft.id);
      updateButtons();
      message("正在生成提示词，可调整视频模型；结果会在本页显示。");
    } catch (e) {
      message("提示词未生成：" + e.message);
    } finally {
      promptStarting = false;
      updateButtons();
    }
  }
  function bindProduction() {
    app.querySelector("#studioUpload").onclick = () => upload("sceneImageIds");
    app.querySelector("#studioPeople").onclick = () => upload("personImageIds");
    app.querySelector("#studioOpenAccounts").onclick = () =>
      window.StudioShell.openAccounts();
    app.querySelector("#studioGeneratePrompts").onclick = generatePrompts;
    app.querySelector("#studioUseOriginal").onclick = async () => {
      try {
        await adopt(selectedImage);
        message("已直接使用这张底图，没有重新生成图片。");
      } catch (e) {
        message(e.message);
      }
    };
    app.querySelector("#studioAssets").onclick = () => {
      ctx.modal(
        `<h2>选择底图</h2><p>点击缩略图加入项目；一张图片可用于多个视频。</p><div class="studio-asset-picker">${data.assets
          .filter(
            (a) =>
              a.previewUrl &&
              ["upload", "generated"].includes(a.type) &&
              !a.archived,
          )
          .map(
            (a) =>
              `<button data-pick-studio-image="${a.id}"><img src="${esc(a.previewUrl)}" alt="${esc(a.name)}"><strong>${esc(a.name)}</strong><small>${a.type === "generated" ? "AI生成" : "已保存图片"}</small></button>`,
          )
          .join("")}</div>`,
      );
      document.querySelectorAll("[data-pick-studio-image]").forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              const id = b.dataset.pickStudioImage;
              if (!p.materials.sceneImageIds.includes(id))
                p.materials.sceneImageIds.push(id);
              for (const plan of p.plans)
                if (!plan.imageIds.length) assignOriginal(plan, id);
              selectedImage = id;
              chooseSource(id);
              await saveProject();
              ctx.closeModal();
              drawImages();
              drawPlans();
              message("底图已加入项目，可直接使用。");
            } catch (e) {
              message(e.message);
            }
          }),
      );
    };
    app.querySelector("#studioTransform").onclick = async () => {
      if (imageBusy()) return;
      try {
        actionBusy = true;
        setProcessing("transform");
        localStorage.setItem("monitor:processing-source:" + p.id,selectedImage);
        updateButtons();
        drawImages();
        transformTask = await post("/image-transforms", {
          referenceId: selectedImage,
        });
        localStorage.setItem("monitor:transform:" + p.id, transformTask.id);
        message("正在加工监控视角，原图保留，完成后可预览并采用。");
      } catch (e) {
        message("监控加工未提交：" + e.message);
      } finally {
        actionBusy = false;
        drawImages();
        updateButtons();
      }
    };
    app.querySelector("#studioGenerateImage").onclick = async () => {
      if (imageBusy()) return;
      try {
        actionBusy = true;
        setProcessing("image");
        localStorage.setItem("monitor:processing-source:" + p.id,selectedImage);
        updateButtons();
        await applySettings();
        await saveProject();
        imageTask = await post("/studio/images", {
          projectId: p.id,
          planId: p.plans[0].id,
          count: 1,
          isolatedReference: true,
          sourceSceneId: selectedImage,
          requestId: crypto.randomUUID(),
        });
        localStorage.setItem("monitor:image-task:" + p.id, imageTask.id);
        drawImageLoading();
        message("正在按模板生成底图，自动包含监控视角要求。");
      } catch (e) {
        message("底图未生成：" + e.message);
      } finally {
        actionBusy = false;
        updateButtons();
        drawImageLoading();
      }
    };
    app.querySelector("#studioVariants").onclick = async () => {
      if (imageBusy()) return;
      try {
        actionBusy = true;
        setProcessing("variants");
        updateButtons();
        await applySettings();
        for (const plan of p.plans) {
          const source = plan.imageIds[0] || selectedImage;
          if (source && !p.materials.sceneImageIds.includes(source))
            p.materials.sceneImageIds.push(source);
          plan.imageConfig = { ...plan.imageConfig, sourceSceneId: source };
        }
        await saveProject();
        flow = await post(`/studio/projects/${p.id}/monitor-workflow`, {
          autoVideo: false,
        });
        message("正在分别生成动作变体，每张包含监控视角，完成后预览确认。");
        updateButtons();
      } catch (e) {
        message(e.message);
      } finally {
        actionBusy = false;
        updateButtons();
      }
    };
    app.querySelector("#studioTrialSlot").onchange = updateButtons;
    app.querySelector("#studioSubmit").onclick = () => submit(false);
    app.querySelector("#studioTrial").onclick = () => submit(true);
  }
  async function submit(trial) {
    if (submitBusy) return;
    try {
      submitBusy = true;
      if(promptSaving){app.querySelectorAll("[data-prompt]").forEach(e=>clearTimeout(e.timer));await flushEditedPrompts();promptSaving=false;}
      updateButtons();
      await applySettings();
      await saveProject();
      const [planId, index] = app
          .querySelector("#studioTrialSlot")
          .value.split(":"),
        key =
          "monitor:submit:" +
          p.id +
          ":" +
          (trial ? planId + ":" + index : "all");
      const fingerprint = JSON.stringify({sourceSceneId,brandName:p.brandName||"",peopleBrief:p.peopleBrief||"",contentBrief:p.contentBrief||"",plans:p.plans.map(v=>({id:v.id,prompts:v.prompts.map((text,index)=>completedSlots.has(v.id+":"+index)?text:""),count:v.count,duration:v.duration})),settings:ctx.choice});
      let previous = null;
      try { previous = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
      const finishedIntent=productionTask?.requestId===previous?.requestId&&productionTask?.status==='submitted'&&productionTask.jobs?.length&&productionTask.jobs.every(j=>j.status==='complete');
      const requestId = previous?.fingerprint === fingerprint&&!finishedIntent ? previous.requestId : crypto.randomUUID();
      localStorage.setItem(key,JSON.stringify({requestId,fingerprint}));
      productionTask = await post(`/studio/projects/${p.id}/generate-video`, {
        requestId,
        trial,
        planId: trial ? planId : undefined,
        index: trial ? Number(index) : undefined,
        generationSettings: ctx.choice,
        prepareImages: !trial || !completedSlots.has(planId+":"+index),
        sceneReferenceIds: sourceSceneId?[sourceSceneId]:[],
      });
      localStorage.setItem("monitor:production:"+p.id,productionTask.id);setProcessing("auto");drawImageLoading();
      message("正在制作视频，内容会在后台自动准备，无需再次确认。");
      await refresh();
      app
        .querySelector("#results")
        .scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      message("视频未提交：" + e.message);
    } finally {
      submitBusy = false;
      updateButtons();
    }
  }
  function drawResults(jobs) {
    if (!app.querySelector("#studioResults")) return;
    const mine = jobs.filter((j) => j.projectId === p.id),
      signature = JSON.stringify(mine);
    app.querySelector("#studioResultCount").textContent =
      `${mine.filter((j) => j.status === "complete" && j.outputs?.length).length}条成片 · ${mine.length}个任务`;
    if (signature === videoSignature) return;
    videoSignature = signature;
    const previous = new Map(
      [...app.querySelectorAll("[data-studio-job]")].map((el) => [
        el.dataset.studioJob,
        {
          video: el.querySelector("video"),
          open: el.querySelector("details")?.open,
        },
      ]),
    );
    const label = (j) =>
      j.status === "error"
        ? "生成失败"
        : j.status === "needs_review"
          ? "待核对发送结果"
          : j.status === "queued"
            ? "等待发送"
            : j.status === "complete" && j.outputs?.length
              ? "已完成"
              : j.status === "complete"
                ? "未取得成片地址"
                : j.providerProgress?.stage === "starting"
                  ? "正在发送 / 确认方案"
                  : j.videoRoute === "doubao" &&
                      !j.providerProgress?.conversationId
                    ? "豆包尚未确认接收"
                    : "服务处理中";
    app.querySelector("#studioResults").innerHTML =
      mine
        .map(
          (j) =>
            `<article data-studio-job="${j.id}"><div class="studio-result-preview">${j.status === "complete" && j.outputs?.length ? `<video controls playsinline preload="none" src="/api/video/${j.id}?preview=1"></video>` : "<span>▻</span>"}</div><div class="studio-result-info"><strong>${esc(j.templateName || "视频")}${j.isTrial ? " · 试片" : ""}</strong><span class="studio-job-state ${j.status === "error" ? "error" : ""}">${label(j)}</span><p>${esc(j.status === "complete" ? "已取得真实成片，可播放或下载。" : j.error || j.providerProgress?.message || (j.status === "queued" ? "本地任务已创建，尚未发送到生成服务。" : ""))}</p><details><summary>${j.status === "complete" ? "查看发送记录与提示词" : "查看发送记录"}</summary><p>本地任务：${esc(j.id)}<br>服务任务：${esc(j.providerId || "尚无")}<br>会话确认：${esc(j.providerProgress?.conversationId || "尚未返回")}</p>${j.status === "complete" ? `<pre>${esc(j.prompt || "")}</pre>` : ""}</details></div><div class="studio-result-actions">${j.status === "error" ? `<button data-retry-studio-job="${j.id}">重试这条视频</button>` : ""}${j.status === "complete" && j.outputs?.length ? `<a class="button" href="/api/video/${j.id}?download=1">下载</a>${j.isTrial ? `<button data-adopt-studio-trial="${j.id}">采纳试片</button>` : ""}` : ""}${j.status === "needs_review" ? `<button data-query-studio-job="${j.id}">查询已有任务</button>` : ""}</div></article>`,
        )
        .join("") ||
      `<div class="studio-empty">${productionTask?.status==='preparing'?'图片与视频正在后台准备，图片完成后自动提交视频。':productionTask?.status==='error'?'本次制作未完成，请在上方重试；已成功的图片保留。':'选择动作和模型，点击批量生成，图片与视频将在后台逐条制作。'}</div>`;
    for (const el of app.querySelectorAll("[data-studio-job]")) {
      const old = previous.get(el.dataset.studioJob),
        next = el.querySelector("video");
      if (
        old?.video &&
        next &&
        old.video.getAttribute("src") === next.getAttribute("src")
      )
        next.replaceWith(old.video);
      if (old?.open) el.querySelector("details").open = true;
    }
    app.querySelectorAll("[data-retry-studio-job]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            b.disabled = true;
            await applySettings();
            await saveProject();
            await persistPrompts(true);
            await post(`/studio/jobs/${b.dataset.retryStudioJob}/retry`, {
              useProjectSettings: true,
            });
            refresh();
          } catch (e) {
            message(e.message);
            b.disabled = false;
          }
        }),
    );
    app.querySelectorAll("[data-adopt-studio-trial]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await post(`/studio/projects/${p.id}/adopt`, {
              jobId: b.dataset.adoptStudioTrial,
            });
            message("已采纳试片，批量生成时会抵扣这一条。");
            refresh();
          } catch (e) {
            message(e.message);
          }
        }),
    );
    app.querySelectorAll("[data-query-studio-job]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await post(
              `/studio/jobs/${b.dataset.queryStudioJob}/reconcile`,
              {},
            );
            refresh();
          } catch (e) {
            message(e.message);
          }
        }),
    );
  }
  async function refresh() {
    if (
      polling ||
      step !== "production" ||
      !app.querySelector("#studioResults")
    )
      return;
    polling = true;
    try {
      const [catalog, jobs] = await Promise.all([
        api("/studio"),
        api("/studio/works"),
      ]);
      data = catalog;
      ctx.updateCatalog(data);
      const productionId = productionTask?.id || localStorage.getItem("monitor:production:"+p.id);
      if (productionId) { productionTask = await api("/studio/video-productions/"+productionId); message(productionTask.status==="error"?"制作失败："+productionTask.error:productionTask.status==="preparing"?"正在准备视频内容，随后自动生成，请稍候…":""); }
      if (step !== "production" || !app.querySelector("#studioResults")) return;
      const remote = data.projects.find((v) => v.id === p.id);
      if(remote&&productionTask?.prepareImages){p.materials=remote.materials;p.commonImageId=remote.commonImageId;for(const plan of p.plans){const found=remote.plans.find(v=>v.id===plan.id);if(found){plan.imageIds=found.imageIds;plan.mapping=found.mapping;}}}
      if (remote && !promptSaving && !app.querySelector("[data-prompt]:focus"))
        for (const plan of p.plans) {
          const found = remote.plans.find((v) => v.id === plan.id);
          if (found) {
            plan.prompts = found.prompts;
            plan.promptsDirty = found.promptsDirty;
            if (flow?.status === "images_ready") {
              plan.imageIds = found.imageIds;
              plan.mapping = found.mapping;
            }
          }
        }
      const draftId =
        directDraft?.id ||
        localStorage.getItem("monitor:draft:" + p.id) ||
        p.promptTaskId;
      if (draftId) {
        directDraft = await api("/studio/drafts/" + draftId);
        if (step !== "production") return;
        app.querySelector("#studioPromptState").textContent =
          directDraft.status === "running"
            ? `正在生成提示词 · ${directDraft.completed || 0}/${directDraft.total || total()}`
            : directDraft.status === "error"
              ? "提示词生成失败：" + directDraft.error
              : "";
      }
      const activeFlow = await api(`/studio/projects/${p.id}/monitor-workflow`);
      if (step !== "production") return;
      if (
        activeFlow &&
        (flow || ["images", "drafting"].includes(activeFlow.status))
      )
        flow = activeFlow;
      const imageId =
        imageTask?.id || localStorage.getItem("monitor:image-task:" + p.id);
      if (imageId && processingMode === "image") {
        imageTask = await api("/studio/image-tasks/" + imageId);
        if (step !== "production") return;
        const item = imageTask.items[0];
        if (item.status === "complete" && item.referenceIdResult)
          await showCandidate(item.referenceIdResult);
        app.querySelector("#studioImageProgress").innerHTML =
          item.status === "complete"
            ? "<p>AI底图已完成，请预览并采用。</p>"
            : item.status === "error"
              ? `<p class="studio-warning">底图生成失败：${esc(item.error)}</p><button id="studioRetryImage">重试这张底图</button>`
              : item.status === "needs_review"
                ? "<p class=\"studio-warning\">底图结果待核实，请先查看服务记录，避免重复提交。</p>"
                : "<p>AI底图正在生成…</p>";
        app
          .querySelector("#studioRetryImage")
          ?.addEventListener("click", async () => {
            try {
              await post(
                `/studio/image-tasks/${imageTask.id}/items/${item.id}/retry`,
                {},
              );
              message("已恢复这张底图的生成。");
            } catch (e) {
              message(e.message);
            }
          });
        drawImageLoading();
      }
      const transformId =
        transformTask?.id || localStorage.getItem("monitor:transform:" + p.id);
      if (transformId && processingMode === "transform") {
        transformTask = await api("/image-transforms/" + transformId);
        if (step !== "production") return;
        if (
          transformTask.status === "complete" &&
          transformTask.resultReferenceId &&
          !handledImages.has(transformTask.resultReferenceId)
        ) {
          await api("/studio/assets/" + transformTask.resultReferenceId, {
            method: "PATCH",
            body: {
              monitorView: true,
              confirmed: false,
              role: "monitor-frame",
            },
          });
          await refreshData();
          await showCandidate(transformTask.resultReferenceId);
        }
        app.querySelector("#studioImageProgress").innerHTML =
          transformTask.status === "complete"
            ? "<p>监控加工已完成，请预览并采用。原图保留。</p>"
            : transformTask.status === "error"
              ? `<p class="studio-warning">监控加工失败：${esc(transformTask.error)}</p>`
              : "<p>正在加工监控视角，原图保留…</p>";
      }
      if (
        flow &&
        processingMode === "variants" &&
        ["images", "images_ready", "error"].includes(flow.status)
      ) {
        const done = flow.slots.filter((s) => s.status === "complete").length;
        app.querySelector("#studioImageProgress").innerHTML =
          `<p>${flow.status === "images_ready" ? "动作变体已完成，请确认" : "动作变体 · 已完成" + done + "/" + flow.slots.length}</p><div class="studio-variant-thumbs">${flow.slots.map((s) => `<div>${s.referenceId ? `<img src="${esc(asset(s.referenceId)?.previewUrl || "")}" alt="动作变体">` : "<span>生成中</span>"}<small>${esc(p.plans.find((v) => v.id === s.planId)?.snapshot.name || "动作")} · ${s.index + 1}</small>${s.error ? `<p class="studio-warning">${esc(s.error)}</p>` : ""}${s.status === "error" ? `<button data-retry-variant="${s.id}">重试这一张</button>` : ""}</div>`).join("")}</div>${flow.status === "images_ready" ? '<button id="studioAdoptVariants">采用动作变体</button>' : ""}`;
        app
          .querySelector("#studioAdoptVariants")
          ?.addEventListener("click", async () => {
            try {
              flow = await post(
                `/studio/projects/${p.id}/monitor-workflow/confirm`,
                {autoDraft:false},
              );
              const adopted = await api(`/studio/projects/${p.id}`);
              for (const plan of p.plans) {
                const found = adopted.plans.find(v=>v.id===plan.id);
                if (found) { plan.imageIds = found.imageIds; plan.mapping = found.mapping; plan.signature = found.signature; }
              }
              drawImages();
              drawPlans();
              updateButtons();
            } catch (e) {
              message(e.message);
            }
          });
        app.querySelectorAll("[data-retry-variant]").forEach(
          (b) =>
            (b.onclick = async () => {
              try {
                flow = await post(
                  `/studio/projects/${p.id}/monitor-workflow/retry`,
                  { slotId: b.dataset.retryVariant },
                );
              } catch (e) {
                message(e.message);
              }
            }),
        );
      }
      videoBusy=jobs.some(j=>j.projectId===p.id&&!['complete','error','cancelled','needs_review'].includes(j.status));
      const finished = jobs.filter(j=>j.projectId===p.id&&j.status==="complete"&&j.outputs?.length);
      completedSlots = new Set(finished.map(j=>j.planId+":"+j.slotIndex));
      app.querySelector("#studioCompletedPrompts").hidden = !finished.length;
      drawImages();
      drawPrompts();
      drawResults(jobs);
      updateButtons();
    } catch (e) {
      message("进度读取失败：" + e.message);
    } finally {
      polling = false;
    }
  }
  window.monitorUpdateSettings = async (selection) => {
    if (flow && ["images", "drafting", "ready"].includes(flow.status))
      await post(
        `/studio/projects/${p.id}/monitor-workflow/settings`,
        selection,
      );
  };
  function render() {
    promptSignature = "";
    videoSignature = "";
    if (step === "templates") selection();
    else production();
    app
      .querySelectorAll("[data-step]")
      .forEach((b) => (b.onclick = () => go(b.dataset.step)));
    clearInterval(renderMonitorStudio.timer);
    if (step === "production")
      renderMonitorStudio.timer = setInterval(refresh, 2500);
  }
  renderMonitorStudio.abort?.abort();
  renderMonitorStudio.abort = new AbortController();
  window.addEventListener(
    "popstate",
    () => {
      const target = new URLSearchParams(location.search).get("step");
      if (target && target !== step) {
        step = target;
        render();
      }
    },
    { signal: renderMonitorStudio.abort?.signal },
  );
  render();
}
