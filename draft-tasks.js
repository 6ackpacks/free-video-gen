import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class DraftTasks {
  constructor(file, draft) {
    this.file = file;
    this.draft = draft;
    this.tasks = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    for (const task of this.tasks) if (task.status === 'running') {
      task.status = 'error'; task.error = '工作台已重启，请重新生成提示词。';
    }
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.tasks));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  get(id) { const task = this.tasks.find(x => x.id === id); if (!task) throw Error('提示词任务不存在'); return task; }
  create(input) {
    const existing = input.requestId && this.tasks.find(x => x.requestId === input.requestId);
    if (existing) return existing;
    const task = { id: randomUUID(), requestId: input.requestId, createdAt: new Date().toISOString(), status: 'running' };
    this.tasks.unshift(task); this.save();
    Promise.resolve().then(() => this.draft(input)).then(result => {
      task.result = result; task.status = 'complete';
    }).catch(error => { task.error = error.message; task.status = 'error'; }).finally(() => this.save());
    return task;
  }
}
