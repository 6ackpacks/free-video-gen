import { normalizeReplica } from './replica-workflow.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class WorkspaceState {
  constructor(file) {
    this.file = file;
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { favorite: [], hidden: [], presets: [] };
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
    return this.state;
  }
  update(input) {
    const updated = { ...this.state };
    for (const key of ['favorite', 'hidden']) if (input[key] !== undefined) {
      if (!Array.isArray(input[key]) || input[key].length > 2000 || input[key].some(v => typeof v !== 'string' || v.length > 128)) throw Error('记录标记格式无效');
      updated[key] = [...new Set(input[key])];
    }
    this.state = updated;
    return this.save();
  }
  addPreset(input) {
    const name = String(input.name || '').trim().slice(0, 80);
    if (!name) throw Error('请填写预设名称');
    if (!/^(?:\/story|\/)(?:\?[^#]*)?$/.test(String(input.page || ''))) throw Error('预设页面无效');
    const fields = input.fields || {};
    if (!fields || typeof fields !== 'object' || Array.isArray(fields) || JSON.stringify(fields).length > 60000 || Object.entries(fields).some(([key,value]) => /password|secret|api.?key|token/i.test(key) || !['string','boolean','number'].includes(typeof value))) throw Error('预设参数无效');
    const templateIds = Array.isArray(input.templateIds) ? input.templateIds.map(v => String(v).slice(0,100)).slice(0,100) : [];
    const preset = { id: randomUUID(), name, page: input.page, fields, templateIds, createdAt: new Date().toISOString() };
    this.state.presets.unshift(preset);
    this.save();
    return preset;
  }
  saveReplica(input) {
    const name=String(input.name||'').trim().slice(0,80);if(!name)throw Error('请填写预设名称');
    const replica=normalizeReplica(input.replica);const existing=input.id&&this.state.presets.find(p=>p.id===input.id&&p.kind==='replica');if(input.id&&!existing)throw Error('预设不存在');
    const raw=input.settings||existing?.settings||{},refs=[...new Set(raw.referenceImageIds||[])];if(refs.length>3||refs.some(id=>!/^[-a-f0-9]{36}$/i.test(id)))throw Error('预设图片格式无效');
    const settings={videoRoute:String(raw.videoRoute||'').slice(0,40),duration:Number(raw.duration)||15,resolution:String(raw.resolution||'').slice(0,40),ratio:['9:16','16:9','1:1'].includes(raw.ratio)?raw.ratio:'9:16',referenceImageIds:refs};
    const preset={settings,id:existing?.id||randomUUID(),name,kind:'replica',page:'/clone',fields:{},templateIds:[],replica,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(existing)Object.assign(existing,preset);else this.state.presets.unshift(preset);this.save();return preset;
  }
  removePreset(id) {
    if (!this.state.presets.some(p => p.id === id)) throw Error('预设不存在');
    this.state.presets = this.state.presets.filter(p => p.id !== id);
    this.state.favorite = this.state.favorite.filter(key => key !== 'preset:' + id);
    this.state.hidden = this.state.hidden.filter(key => key !== 'preset:' + id);
    return this.save();
  }
}
