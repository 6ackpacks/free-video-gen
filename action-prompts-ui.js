(() => {
  const byId = id => document.getElementById(id);
  const key = 'action-prompt-batch:v1:' + selectedPack;
  const settingsKey = 'template-settings:v1:' + selectedPack;
  let configs = {};
  try { configs = JSON.parse(localStorage.getItem(settingsKey) || '{}'); } catch {}
  function persistSettings() { localStorage.setItem(settingsKey, JSON.stringify(configs)); }
  function settings() {
    if (actionMode === 'random') return [{ actionMode:'random',duration:Number(byId('duration').value)||5,count:Number(byId('quantity').value)||1,creativeBrief:byId('creativeBrief')?.value||'' }];
    return templates.filter(t=>configs[t.id]&&t.compatibility.compatible).map(t=>({actionId:t.id,actionMode:'manual',...configs[t.id]}));
  }
  function sync() {
    // The first ready event precedes the asynchronous template inventory.
    // Preserve saved selections until compatibility can actually be checked.
    if (!templates.length) return;
    for (const id of Object.keys(configs)) if(!templates.some(t=>t.id===id&&t.compatibility.compatible))delete configs[id];
    if (!Object.keys(configs).length && selectedAction) configs[selectedAction]={duration:5,count:1,creativeBrief:''};
    persistSettings(); renderSettings();
  }
  function renderSettings() {
    if (!byId('templateSettings')) return;
    const route=(provider.routes||[]).find(r=>r.id===byId('videoRoute').value);
    const values=(route?.duration?.values||Array.from({length:14},(_,i)=>i+2)).filter(v=>v<=15&&v>=(route?.duration?.min||2)&&v<=(route?.duration?.max||15));
    byId('templateSettings').innerHTML=actionMode==='random'?'':settings().map(c=>{
      if(!values.includes(Number(c.duration))){c.duration=values.reduce((a,b)=>Math.abs(a-5)<=Math.abs(b-5)?a:b,values[0]||5);configs[c.actionId].duration=c.duration;}
      const t=templates.find(t=>t.id===c.actionId);
      return `<section class="template-setting" data-setting="${c.actionId}"><strong>${esc(t.name)}</strong><div class="twos"><label>时长<select data-setting-field="duration">${values.map(v=>`<option value="${v}" ${v===Number(c.duration)?'selected':''}>${v} 秒</option>`).join('')}</select></label><label>数量<input type="number" min="1" max="500" value="${c.count}" data-setting-field="count"></label></div><label>补充想法（选填）<textarea data-setting-field="creativeBrief" placeholder="没有想法可以直接生成">${esc(c.creativeBrief||'')}</textarea></label></section>`;
    }).join('')|| (actionMode==='manual'?'<p class="hint">请在中间选择一个或多个模板。</p>':'');
    byId('duration').closest('.field').hidden=actionMode!=='random';
    byId('quantity').closest('.field').hidden=actionMode!=='random';
    byId('promptInputsPanel').hidden=actionMode!=='random';
    persistSettings();
  }
  let items = [], inputs = null, signature = '', taskId = '', generating = false, submitting = false, requestId = '', submitSignature = '', pollTimer;
  function context() { return { packId: selectedPack, referenceId: selectedRef, actionMode, selections: settings(), duration:5, outfitPreferences: outfitPreferences(), userPrompt: '' }; }
  function current() { return !!inputs && signature === JSON.stringify(context()); }
  function selected() { return items.filter(item => item.selected && item.prompt?.trim() && !item.error && !item.submitted); }
  function save() { try { localStorage.setItem(key, JSON.stringify({ items, inputs, signature, taskId, requestId, submitSignature })); } catch { notify('提示词草稿保存失败，请复制后再离开。'); } }
  function update() {
    const ready = provider.promptModel && currentRef()?.sceneProfile && settings().length;
    const route = (provider.routes || []).find(r=>r.id === byId('videoRoute').value);
    const view = document.querySelector('.wb-frame')?.dataset.view;
    byId('generateActionPrompts').hidden = !['templates','prompts'].includes(view);
    byId('createTrial').hidden = view !== 'prompts';
    const count = settings().reduce((n,c)=>n+Number(c.count),0);
    byId('generateActionPrompts').disabled = generating || submitting || !ready || !Number.isInteger(count) || count < 1 || count > 500 || settings().some(c=>!Number.isInteger(Number(c.count))||Number(c.count)<1);
    byId('generateActionPrompts').textContent = generating ? '正在生成提示词…' : `${view==='templates'?'确认模板，':items.length?'重新':''}生成 ${count || 0} 条提示词 →`;
    byId('createTrial').disabled = generating || submitting || !current() || !selected().length || !route || (!route.configured && route.id !== 'doubao');
    byId('createTrial').textContent = submitting ? '正在提交…' : `确认生成${selected().length ? ' ' + selected().length + ' 条' : ''}视频`;
    if (byId('actionSelectedCount')) byId('actionSelectedCount').textContent = `已选 ${selected().length} / ${items.filter(i=>i.prompt && !i.error).length} 条`;
    if (byId('actionDraftState') && !generating) byId('actionDraftState').textContent = items.length ? current() ? `${items.length} 条提示词` : '底图或模板设置已变化，请重新生成' : '尚未生成';
    if (byId('selectAllActionPrompts')) byId('selectAllActionPrompts').disabled = !items.length || submitting;
    if (byId('clearActionPromptSelection')) byId('clearActionPromptSelection').disabled = !items.length || submitting;
  }
  function render() {
    const list = byId('actionPromptList'); if (!list) return;
    const groups=new Map();for(const item of items){if(!groups.has(item.actionName))groups.set(item.actionName,[]);groups.get(item.actionName).push(item);}
    const opened=new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.group));
    list.innerHTML = items.length ? [...groups].map(([name,rows],groupIndex)=>`<details class="prompt-template-group" data-group="${esc(name)}" ${opened.has(name)||groupIndex===0?'open':''}><summary>${esc(name)} · ${rows.length} 条</summary>${rows.map(item => `<article class="action-prompt-item"><label class="action-prompt-check"><input type="checkbox" data-action-prompt-select="${item.id}" ${item.selected ? 'checked' : ''} ${item.error || item.submitted ? 'disabled' : ''}><strong>画面 ${item.index} · ${item.duration||inputs?.duration||5} 秒</strong>${item.submitted ? '<span>已提交</span>' : ''}</label>${item.error ? `<p role="alert">生成失败：${esc(item.error)}</p>` : `<p class="prompt-excerpt">${esc(item.prompt)}</p><button class="secondary" data-expand-prompt="${item.id}">展开查看 / 编辑</button>`}</article>`).join('')}</details>`).join('') : '<p class="hint">生成的提示词会显示在这里。</p>';
    list.querySelectorAll('[data-action-prompt-select]').forEach(el => el.onchange = () => { items.find(i=>i.id===el.dataset.actionPromptSelect).selected = el.checked; save(); update(); });
    list.querySelectorAll('[data-action-prompt-text]').forEach(el => el.oninput = () => { items.find(i=>i.id===el.dataset.actionPromptText).prompt = el.value; save(); update(); });
    list.querySelectorAll('[data-expand-prompt]').forEach(el=>el.onclick=()=>{
      const item=items.find(i=>i.id===el.dataset.expandPrompt),dialog=window.WorkbenchUI.dialog(`画面 ${item.index} · ${item.actionName} · ${item.duration||5} 秒`);
      const box=dialog.querySelector('.wb-dialog-body');box.innerHTML=`<label>完整提示词<textarea style="min-height:360px" ${item.submitted?'readonly':''}>${esc(item.prompt)}</textarea></label><p class="hint">${item.submitted?'已提交的文本仅供查看':'修改会自动保存，关闭后勾选并确认生成视频。'}</p>`;
      box.querySelector('textarea').oninput=event=>{item.prompt=event.target.value;save();update();};dialog.addEventListener('close',render);
    });
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
    inputs = { ...context(), count: settings().reduce((n,c)=>n+Number(c.count),0), requestId: crypto.randomUUID() };
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
    const container=document.createElement('div');container.id='templateSettings';byId('quantity').closest('.field').after(container);
    container.addEventListener('input',event=>{const field=event.target.dataset.settingField,id=event.target.closest('[data-setting]')?.dataset.setting;if(!id||!field)return;configs[id][field]=field==='creativeBrief'?event.target.value:Number(event.target.value);persistSettings();update();});
    byId('generateActionPrompts').onclick = generate; byId('createTrial').onclick = submit;
    byId('selectAllActionPrompts').onclick = () => { items.forEach(i=>{if(i.prompt && !i.error && !i.submitted)i.selected=true;});save();render(); };
    byId('clearActionPromptSelection').onclick = () => { items.forEach(i=>i.selected=false);save();render(); };
    sync();render(); if (taskId) { generating = true; update(); poll(); }
  }
  document.addEventListener('workbench:prompt-inputs-ready', ready);
  document.addEventListener('workbench:view', ()=>{renderSettings();update();});
  document.addEventListener('workbench:ready', ()=>{sync();update();});
  document.addEventListener('workbench:reuse', async event => {
    const record = event.detail; if(record.kind !== 'store' || !record.result?.inputs || generating || submitting)return;
    inputs = record.result.inputs; selectedRef = inputs.referenceId; selectedAction = inputs.actionId; actionMode = inputs.actionMode || 'manual';
    localStorage.selectedRef = selectedRef; localStorage.setItem(`selectedAction:${selectedPack}`, selectedAction);
    byId('duration').value = inputs.duration; byId('quantity').value = inputs.count;
    configs=Object.fromEntries((inputs.selections||[{actionId:inputs.actionId,duration:inputs.duration,count:inputs.count,creativeBrief:inputs.creativeBrief||''}]).filter(c=>c.actionId).map(c=>[c.actionId,{duration:c.duration,count:c.count,creativeBrief:c.creativeBrief||''}]));persistSettings();
    byId('creativeBrief').value = inputs.creativeBrief || '';
    byId('creativeBrief').dispatchEvent(new Event('input', { bubbles: true }));
    byId('outfitMode').value = Object.values(inputs.outfitPreferences || {}).some(Boolean) ? 'custom' : 'random';
    for(const id of ['femaleAppearance','femaleClothing','maleAppearance','maleClothing'])byId(id).value = inputs.outfitPreferences?.[id] || '';
    byId('customOutfit').hidden = byId('outfitMode').value !== 'custom';
    items = record.result.items.map(item=>({...item,submitted:false,selected:!!item.prompt && !item.error})); taskId = record.id; requestId = ''; submitSignature = '';
    signature = JSON.stringify(context()); save(); renderRefs(); renderScene(); await loadActions(); render(); window.WorkbenchUI.show('prompts');
  });
  document.addEventListener('input', event=>{if(event.target.id==='quantity')update();});
  window.ActionPrompts = { update, sync, settings, renderSettings, ids:()=>Object.keys(configs),has:id=>!!configs[id],restore:rows=>{configs=Object.fromEntries((rows||[]).map(c=>[c.actionId,{duration:c.duration||5,count:c.count||1,creativeBrief:c.creativeBrief||''}]));sync();},toggle:id=>{if(configs[id])delete configs[id];else configs[id]={duration:5,count:1,creativeBrief:''};persistSettings();renderSettings();update();} };
  document.addEventListener('change',event=>{if(['videoModel','videoRoute'].includes(event.target.id)){renderSettings();update();}});
})();
