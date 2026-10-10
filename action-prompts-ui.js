(() => {
  const byId = id => document.getElementById(id);
  const key = 'action-prompt-batch:v1:' + selectedPack;
  let items = [], inputs = null, signature = '', taskId = '', generating = false, submitting = false, requestId = '', submitSignature = '', pollTimer;
  function context() { return { packId: selectedPack, referenceId: selectedRef, actionMode, actionId: selectedAction, duration: Number(byId('duration').value), outfitPreferences: outfitPreferences(), userPrompt: '' }; }
  function current() { return !!inputs && signature === JSON.stringify(context()); }
  function selected() { return items.filter(item => item.selected && item.prompt?.trim() && !item.error && !item.submitted); }
  function save() { try { localStorage.setItem(key, JSON.stringify({ items, inputs, signature, taskId, requestId, submitSignature })); } catch { notify('提示词草稿保存失败，请复制后再离开。'); } }
  function update() {
    const ready = provider.promptModel && currentRef()?.sceneProfile && (actionMode === 'random' ? templates.some(t=>t.compatibility.compatible) : templates.some(t=>t.id === selectedAction && t.compatibility.compatible));
    const route = (provider.routes || []).find(r=>r.id === byId('videoRoute').value);
    const view = document.querySelector('.wb-frame')?.dataset.view;
    byId('generateActionPrompts').hidden = !['templates','prompts'].includes(view);
    byId('createTrial').hidden = view !== 'prompts';
    const count = Number(byId('quantity').value);
    byId('generateActionPrompts').disabled = generating || submitting || !ready || !Number.isInteger(count) || count < 1 || count > 500;
    byId('generateActionPrompts').textContent = generating ? '正在生成提示词…' : view === 'templates' ? '去生成提示词 →' : `${items.length ? '重新生成' : '生成'} ${count || 0} 条提示词`;
    byId('createTrial').disabled = generating || submitting || !current() || !selected().length || !route || (!route.configured && route.id !== 'doubao');
    byId('createTrial').textContent = submitting ? '正在提交…' : `确认生成${selected().length ? ' ' + selected().length + ' 条' : ''}视频`;
    if (byId('actionSelectedCount')) byId('actionSelectedCount').textContent = `已选 ${selected().length} / ${items.filter(i=>i.prompt && !i.error).length} 条`;
    if (byId('actionDraftState') && !generating) byId('actionDraftState').textContent = items.length ? current() ? `${items.length} 条提示词` : '底图或模板设置已变化，请重新生成' : '尚未生成';
    if (byId('selectAllActionPrompts')) byId('selectAllActionPrompts').disabled = !items.length || submitting;
    if (byId('clearActionPromptSelection')) byId('clearActionPromptSelection').disabled = !items.length || submitting;
  }
  function render() {
    const list = byId('actionPromptList'); if (!list) return;
    list.innerHTML = items.length ? items.map(item => `<article class="action-prompt-item"><label class="action-prompt-check"><input type="checkbox" data-action-prompt-select="${item.id}" ${item.selected ? 'checked' : ''} ${item.error || item.submitted ? 'disabled' : ''}><strong>第 ${item.index} 条 · ${esc(item.actionName)}</strong>${item.submitted ? '<span>已提交</span>' : ''}</label>${item.error ? `<p role="alert">生成失败：${esc(item.error)}</p>` : `<textarea aria-label="第 ${item.index} 条提示词" data-action-prompt-text="${item.id}">${esc(item.prompt)}</textarea>`}</article>`).join('') : '<p class="hint">生成的提示词会显示在这里。</p>';
    list.querySelectorAll('[data-action-prompt-select]').forEach(el => el.onchange = () => { items.find(i=>i.id===el.dataset.actionPromptSelect).selected = el.checked; save(); update(); });
    list.querySelectorAll('[data-action-prompt-text]').forEach(el => el.oninput = () => { items.find(i=>i.id===el.dataset.actionPromptText).prompt = el.value; save(); update(); });
    update();
  }
  async function poll() {
    clearTimeout(pollTimer);
    if (!taskId) return;
    try {
      const task = await api('/action-prompt-tasks/' + taskId);
      const received = task.result?.items || task.partialItems || [];
      let changed = false;
      for (const item of received) if (!items.some(i=>i.id===item.id)) { items.push(item); changed = true; }
      items.sort((a,b)=>a.index-b.index);
      generating = task.status === 'running';
      if (changed) render();
      if (byId('actionDraftState')) byId('actionDraftState').textContent = generating ? `已生成 ${task.completed || 0} / ${task.total || inputs?.count || 0} 条` : task.status === 'error' ? task.error : `${items.length} 条提示词`;
      save(); update();
      if (generating) pollTimer = setTimeout(poll, 2500);
    } catch (error) { notify('读取提示词进度失败：' + error.message); pollTimer = setTimeout(poll, 5000); }
  }
  async function generate() {
    if (generating || submitting) return;
    inputs = { ...context(), count: Number(byId('quantity').value), ...window.PromptInputs.read(), requestId: crypto.randomUUID() };
    signature = JSON.stringify(context()); items = []; taskId = ''; requestId = ''; submitSignature = '';
    generating = true; window.WorkbenchUI.show('prompts'); render();
    byId('actionDraftState').textContent = `正在生成 ${inputs.count} 条提示词…`;
    try { const task = await api('/action-prompt-tasks', { method: 'POST', body: JSON.stringify(inputs) }); taskId = task.id; save(); await poll(); }
    catch (error) { generating = false; byId('actionDraftState').textContent = error.message; notify(error.message); update(); }
  }
  async function submit() {
    if (submitting || generating || !current() || !selected().length) return;
    const chosen = selected();
    const payload = { ...inputs, count: chosen.length, videoRoute: byId('videoRoute').value, resolution: byId('resolution').value, preparedPrompts: chosen };
    const contentKey = JSON.stringify(payload);
    if (submitSignature !== contentKey) { requestId = crypto.randomUUID(); submitSignature = contentKey; }
    payload.requestId = requestId; save(); submitting = true; update();
    try {
      const batch = await api('/trials', { method: 'POST', body: JSON.stringify(payload) });
      for (const item of chosen) { item.submitted = true; item.selected = false; }
      save(); render(); currentTrial = batch.id; selectedJob = ''; notify(`已提交 ${chosen.length} 条视频，等待生成。`, true);
      await refreshTrials(); window.WorkbenchUI.show('videos');
    } catch (error) { notify(error.message); }
    finally { submitting = false; update(); }
  }
  function ready() {
    byId('userPrompt').value = '';
    try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved) ({ items, inputs, signature, taskId, requestId, submitSignature } = saved); } catch {}
    byId('generateActionPrompts').onclick = () => { if(document.querySelector('.wb-frame')?.dataset.view === 'templates')window.WorkbenchUI.show('prompts');else generate(); }; byId('createTrial').onclick = submit;
    byId('selectAllActionPrompts').onclick = () => { items.forEach(i=>{if(i.prompt && !i.error && !i.submitted)i.selected=true;});save();render(); };
    byId('clearActionPromptSelection').onclick = () => { items.forEach(i=>i.selected=false);save();render(); };
    render(); if (taskId) { generating = true; update(); poll(); }
  }
  document.addEventListener('workbench:prompt-inputs-ready', ready);
  document.addEventListener('workbench:view', update);
  document.addEventListener('workbench:ready', update);
  document.addEventListener('workbench:reuse', async event => {
    const record = event.detail; if(record.kind !== 'store' || !record.result?.inputs || generating || submitting)return;
    inputs = record.result.inputs; selectedRef = inputs.referenceId; selectedAction = inputs.actionId; actionMode = inputs.actionMode || 'manual';
    localStorage.selectedRef = selectedRef; localStorage.setItem(`selectedAction:${selectedPack}`, selectedAction);
    byId('duration').value = inputs.duration; byId('quantity').value = inputs.count;
    byId('creativeBrief').value = inputs.creativeBrief || '';
    byId('creativeBrief').dispatchEvent(new Event('input', { bubbles: true }));
    byId('outfitMode').value = Object.values(inputs.outfitPreferences || {}).some(Boolean) ? 'custom' : 'random';
    for(const id of ['femaleAppearance','femaleClothing','maleAppearance','maleClothing'])byId(id).value = inputs.outfitPreferences?.[id] || '';
    byId('customOutfit').hidden = byId('outfitMode').value !== 'custom';
    items = record.result.items.map(item=>({...item,submitted:false,selected:!!item.prompt && !item.error})); taskId = record.id; requestId = ''; submitSignature = '';
    signature = JSON.stringify(context()); save(); renderRefs(); renderScene(); await loadActions(); render(); window.WorkbenchUI.show('prompts');
  });
  document.addEventListener('input', event=>{if(event.target.id==='quantity')update();});
  window.ActionPrompts = { update };
})();
