(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'prompt-inputs:v1:' + location.pathname + location.search;
  let mode, panel;
  function read() { return { creativeBrief: $('creativeBrief')?.value || '', outputRequirements: $('outputRequirements')?.value || '', outputLanguage: $('outputLanguage')?.value || 'auto' }; }
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
    panel.innerHTML = '<div class="head"><h2>创作想法与输出要求</h2></div><div class="body"><label for="creativeBrief">我的创作想法</label><textarea id="creativeBrief" placeholder="例如：让人物互动更自然，动作节奏慢一点，多写表情和停顿；同批每条的细节明显不同。"></textarea><label for="outputRequirements">提示词输出要求</label><textarea id="outputRequirements" placeholder="例如：一段完整文字，先交代人物，再写动作；避免重复措辞；画面描述简洁具体。"></textarea><label for="outputLanguage">输出语言</label><select id="outputLanguage"><option value="auto">沿用内容类型的语言</option><option value="zh">中文</option><option value="en">英文（中文对白保留）</option></select><div class="wb-toolbar"><button class="btn" data-generate>按这些要求生成提示词</button><button class="btn alt" data-rewrite>按这些要求改写选中提示词</button></div><p data-status role="status">输入会影响模型生成与改写结果。模板保留核心约束，表达和细节由模型创作。</p></div>';
    const target = $('wbPane-prompts') || $('templateEditor');
    target?.prepend(panel);
    if (mode === 'store') {
      const result = document.createElement('section'); result.className='card'; result.innerHTML='<div class="head"><h2>大模型生成的提示词</h2></div><div class="body"><textarea id="actionModelPrompt" class="prompt-full-output" placeholder="选好底图与模板，填写创作想法，点击生成提示词。生成后可直接修改，再生成试片。"></textarea><p id="actionDraftState" role="status">尚未生成提示词</p></div>';
      panel.after(result);
    }
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); for (const [key,value] of Object.entries(saved)) if ($(key)) $(key).value = value; } catch {}
    panel.addEventListener('input', () => { try { localStorage.setItem(storageKey, JSON.stringify(read())); } catch {} });
    if(mode==='store'||mode==='replica')panel.querySelector('[data-rewrite]').textContent='按这些要求改写当前提示词';
    panel.querySelector('[data-generate]').onclick=()=>generate(); panel.querySelector('[data-rewrite]').onclick=()=>generate(true);
    document.dispatchEvent(new Event('workbench:prompt-inputs-ready'));
  }
  window.PromptInputs={read};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
