(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(path, options = {}) {
    const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '仓库请求失败');
    return result;
  }
  async function open() {
    const dialog = window.WorkbenchUI.dialog('我的图片仓库');
    const body = dialog.querySelector('.wb-dialog-body');
    body.innerHTML = '<div class="wb-library-tools"><input data-search placeholder="搜索图片名称"><select data-kind><option value="all">全部图片</option><option value="original">原图</option><option value="processed">加工图</option><option value="generated">生成图</option></select></div><div class="wb-toolbar"><select data-upload-kind><option value="original">上传原图</option><option value="processed">上传加工图</option></select><label class="btn alt">＋ 上传图片<input data-upload type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></label></div><p data-message role="status">所有上传和生成的图片保存在本机，可选作固定底图。</p><div class="wb-warehouse-grid"></div>';
    const search = body.querySelector('[data-search]'), kind = body.querySelector('[data-kind]'), grid = body.querySelector('.wb-warehouse-grid'), message = body.querySelector('[data-message]');
    let images = [], limit = 40;
    const labels = { original: '原图', processed: '加工图', generated: '生成图' };
    async function load() { images = await api('/references'); render(); }
    function render() {
      const matches = images.filter(item => (kind.value === 'all' || item.assetKind === kind.value) && item.name.toLowerCase().includes(search.value.toLowerCase()));
      grid.innerHTML = matches.slice(0, limit).map(item => `<article class="wb-warehouse-item"><button data-preview="${item.id}" aria-label="放大 ${esc(item.name)}"><img loading="lazy" src="${esc(item.previewUrl)}" alt="${esc(item.name)}"></button><strong>${esc(item.name)}</strong><small>${labels[item.assetKind] || '原图'} · ${new Date(item.createdAt).toLocaleDateString('zh-CN')}</small><button class="btn" data-select="${item.id}">选作固定底图</button></article>`).join('') || '<div class="wb-empty">没有匹配图片，可上传原图或加工图。</div>';
      grid.querySelectorAll('[data-preview]').forEach(button => button.onclick = () => window.WorkbenchUI.preview(images.find(i => i.id === button.dataset.preview).previewUrl, 'image'));
      grid.querySelectorAll('[data-select]').forEach(button => button.onclick = async () => {
        button.disabled = true;
        try {
          const ref = await api(`/references/${button.dataset.select}/background`, { method: 'POST', body: '{}' });
          if (document.getElementById('studioPage')) document.dispatchEvent(new CustomEvent('workbench:select-background', { detail: ref }));
          else { localStorage.selectedRef = ref.id; location.href = '/?mode=store'; }
          dialog.close();
        } catch (error) { message.textContent = error.message; button.disabled = false; }
      });
      if (matches.length > limit) {
        const more = document.createElement('button'); more.className = 'btn alt'; more.textContent = `显示更多（${limit} / ${matches.length}）`; more.onclick = () => { limit += 40; render(); }; grid.append(more);
      }
    }
    kind.onchange = search.oninput = () => { limit = 40; render(); };
    body.querySelector('[data-upload]').onchange = async event => {
      const input = event.target; input.disabled = true;
      try {
        for (const file of input.files) {
          if (file.size > 20 * 1024 * 1024) throw Error(`${file.name} 超过 20 MB`);
          message.textContent = '正在保存 ' + file.name;
          const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(Error('读取图片失败')); reader.readAsDataURL(file); });
          await api('/references', { method: 'POST', body: JSON.stringify({ name: file.name, mime: file.type, base64, purpose: 'store-background', assetKind: body.querySelector('[data-upload-kind]').value }) });
        }
        message.textContent = '图片已保存，点击“选作固定底图”即可使用。'; await load();
      } catch (error) { message.textContent = error.message; await load(); }
      finally { input.value = ''; input.disabled = false; }
    };
    try { await load(); } catch (error) { message.textContent = error.message; }
    return dialog;
  }
  window.ImageWarehouse = { open };
})();
