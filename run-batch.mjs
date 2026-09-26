import fs from 'node:fs';

const filename = process.argv[2];
if (!filename) throw Error('用法：npm run batch -- batch.json');
const input = JSON.parse(fs.readFileSync(filename, 'utf8'));
const endpoint = process.env.WORKBENCH_URL || 'http://127.0.0.1:4173';
const response = await fetch(new URL('/api/batches', endpoint), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
});
const result = await response.json();
if (!response.ok) throw Error(result.error || `HTTP ${response.status}`);
console.log(`批次 ${result.id} 已加入队列，共 ${result.count} 条。`);
