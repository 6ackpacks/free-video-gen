(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'prompt-inputs:v1:' + location.pathname + location.search;
  let mode, panel;
  function read() { return { creativeBrief: $('creativeBrief')?.value || '', outputRequirements: '', outputLanguage: 'auto' }; }
  function selected() {
    const detail = { items: [], context: {}, apply: null };
    document.dispatchEvent(new CustomEvent('workbench:collect-prompt-drafts', { detail }));
    return detail;
  }
  async function generate(rewrite = false) {
    const message = panel.querySelector('[data-status]');
    if (mode !== 'store' && !rewrite) {
      if (mode === 'replica') return generate(true);
      const trigger = $(mode === 'story' ? 'draft' : 'previewTuning');
      if (!trigger || trigger.disabled) { message.textContent = '请先选择主体、模板并完成必要设置。'; return; }
      trigger.click(); message.textContent = '已把输入要求交给模型，结果显示在下方，可继续编辑或改写。'; return;
    }
    const buttons = [...panel.querySelectorAll('[data-generate],[data-rewrite]')];
    buttons.forEach(button => button.disabled = true); message.textContent = rewrite ? '正在按输入要求改写…' : '正在根据模板约束生成完整提示词…';
    try {
      if (mode === 'store') {
        await new Promise((resolve,reject) => document.dispatchEvent(new CustomEvent('workbench:generate-action-prompt', { detail: { resolve,reject,rewrite, ...read() } })));
      } else {
        const draft = selected();
        if (!draft.items.length) throw Error('请先生成并勾选需要改写的提示词；复刻页请先打开模板。');
        if (draft.items.length > 30) throw Error('每次最多改写 30 条，请减少勾选条数。');
        const response = await fetch('/api/prompt-rewrites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ...read(), items: draft.items, context: draft.context }) });
        const result = await response.json(); if (!response.ok) throw Error(result.error || '改写失败');
        draft.apply(result.items);
      }
      message.textContent = '提示词已更新，可直接编辑文本。尚未提交图片或视频生成。';
    } catch (error) { message.textContent = error.message; }
    finally { buttons.forEach(button => button.disabled = false); }
  }
  function ready() {
    if (location.pathname === '/presets') return;
    mode = $('studioPage') ? 'store' : $('subjectId') ? 'story' : $('pairPreview') ? 'paired' : $('promptTemplate') ? 'replica' : '';
    if (!mode) return;
    panel = document.createElement('section'); panel.className = 'card prompt-input-panel'; panel.id = 'promptInputsPanel';
    panel.innerHTML = '<div class="body"><label for="creativeBrief">创作想法（选填）</label><textarea id="creativeBrief" placeholder="有想法就填写，没有也可以直接生成。"></textarea><div class="wb-toolbar"><button class="btn" data-generate>生成提示词</button><button class="btn alt" data-rewrite>改写选中的提示词</button></div><p data-status role="status"></p></div>';
    const target = $('wbPane-prompts') || $('templateEditor');
    target?.prepend(panel);
    if (mode === 'store') {
      panel.querySelector('.wb-toolbar').remove();
      const result = document.createElement('section'); result.className='card'; result.innerHTML='<div class="head"><h2>提示词</h2><span id="actionDraftState" role="status">尚未生成</span></div><div class="body"><div class="wb-toolbar"><button class="btn alt" id="selectAllActionPrompts">全选</button><button class="btn alt" id="clearActionPromptSelection">全不选</button><span id="actionSelectedCount"></span></div><div id="actionPromptList"><p class="hint">生成的提示词会显示在这里。</p></div></div>';
      panel.after(result);
    }
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); $('creativeBrief').value=[saved.creativeBrief,saved.outputRequirements,saved.outputLanguage==='en'?'输出英文提示词':''].filter(Boolean).join('\n'); } catch {}
    panel.addEventListener('input', () => { try { localStorage.setItem(storageKey, JSON.stringify(read())); } catch {} });
    if(mode==='replica')panel.querySelector('[data-rewrite]').textContent='改写当前模板';
    if(mode!=='store'){panel.querySelector('[data-generate]').onclick=()=>generate();panel.querySelector('[data-rewrite]').onclick=()=>generate(true);}
    document.dispatchEvent(new Event('workbench:prompt-inputs-ready'));
  }
  window.PromptInputs={read};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
