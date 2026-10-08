import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class AccountStore {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'doubao-accounts.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { activeLimit: 20, accounts: [] };
  }
  save() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  list(running = new Set()) { return { activeLimit: this.state.activeLimit, accounts: this.state.accounts.map(x => ({ ...x, status: running.has(x.id) ? 'running' : 'idle' })) }; }
  add(input = {}) {
    const n = this.state.accounts.length + 1;
    const account = { id: randomUUID(), name: String(input.name || `豆包-${String(n).padStart(3, '0')}`).trim().slice(0, 40), proxy: String(input.proxy || '').trim().slice(0, 500), createdAt: new Date().toISOString() };
    this.state.accounts.push(account); this.save(); return account;
  }
  update(id, input) {
    const account = this.state.accounts.find(x => x.id === id); if (!account) throw new Error('账号不存在');
    if (input.name !== undefined) account.name = String(input.name).trim().slice(0, 40) || account.name;
    if (input.proxy !== undefined) account.proxy = String(input.proxy).trim().slice(0, 500);
    if (input.managerAccountId !== undefined) account.managerAccountId = String(input.managerAccountId || '').trim();
    if (input.nickname !== undefined) account.nickname = String(input.nickname || '').trim().slice(0, 80);
    if (input.lastSyncedAt !== undefined) account.lastSyncedAt = String(input.lastSyncedAt || '');
    this.save(); return account;
  }
  remove(id) { const before = this.state.accounts.length; this.state.accounts = this.state.accounts.filter(x => x.id !== id); if (before === this.state.accounts.length) throw new Error('账号不存在'); this.save(); }
  get(id) { const value = this.state.accounts.find(x => x.id === id); if (!value) throw new Error('账号不存在'); return value; }
  setLimit(value) { this.state.activeLimit = Math.max(1, Math.min(30, Number(value) || 6)); this.save(); return this.state.activeLimit; }
}
