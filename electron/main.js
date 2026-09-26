import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, WebContentsView, ipcMain, session, shell } from 'electron';
import { AccountStore } from './account-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(here);
const bootLog = message => { try { fs.appendFileSync(path.join(projectRoot, 'data', 'desktop-boot.log'), `${new Date().toISOString()} ${message}\n`); } catch {} };
bootLog('main module loaded');
function loadEnv(filename) {
  if (!fs.existsSync(filename)) return;
  for (const raw of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('='); if (i < 1) continue;
    const key = line.slice(0, i).trim(); let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv(path.join(projectRoot, 'project.env'));
process.env.PORT ||= '4173';

let window; let store; let selectedId = ''; let bounds = { x: 420, y: 62, width: 1000, height: 800 };
const views = new Map();
const running = () => new Set(views.keys());
const accountPartition = id => `persist:doubao-account-${id}`;
function fitSelected() { for (const [id, view] of views) view.setBounds(id === selectedId ? bounds : { x: 0, y: 0, width: 0, height: 0 }); }
async function createView(id) {
  if (views.has(id)) return views.get(id);
  if (views.size >= store.state.activeLimit) throw new Error(`最多同时运行 ${store.state.activeLimit} 个账号`);
  const account = store.get(id);
  const accountSession = session.fromPartition(accountPartition(id));
  await accountSession.setProxy(account.proxy ? { proxyRules: account.proxy } : { mode: 'system' });
  const view = new WebContentsView({ webPreferences: { partition: accountPartition(id), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  view.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) view.webContents.loadURL(url); return { action: 'deny' }; });
  view.webContents.on('will-navigate', (event, url) => { if (!/^https:\/\//.test(url)) { event.preventDefault(); shell.openExternal(url); } });
  window.contentView.addChildView(view); views.set(id, view);
  await view.webContents.loadURL('https://www.doubao.com/chat/');
  return view;
}
async function stopView(id, clear = false) {
  const view = views.get(id);
  if (view) { window.contentView.removeChildView(view); view.webContents.close(); views.delete(id); }
  if (selectedId === id) selectedId = '';
  if (clear) await session.fromPartition(accountPartition(id)).clearStorageData();
}

async function bootstrap() {
  bootLog('electron ready');
  store = new AccountStore(app.getPath('userData'));
  await import('../server.js');
  bootLog('local server imported');
  window = new BrowserWindow({ width: 1500, height: 940, minWidth: 1100, minHeight: 720, backgroundColor: '#f3f0e9', title: '帧间 · 视频工作台', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });

  ipcMain.handle('accounts:list', () => store.list(running()));
  ipcMain.handle('accounts:add', (_, input) => { const value = store.add(input); return { ...value, status: 'idle' }; });
  ipcMain.handle('accounts:update', async (_, { id, input }) => { const value = store.update(id, input); if (views.has(id)) { await session.fromPartition(accountPartition(id)).setProxy(value.proxy ? { proxyRules: value.proxy } : { mode: 'system' }); } return value; });
  ipcMain.handle('accounts:remove', async (_, id) => { await stopView(id, true); store.remove(id); return store.list(running()); });
  ipcMain.handle('accounts:start', async (_, id) => { await createView(id); selectedId = id; fitSelected(); return store.list(running()); });
  ipcMain.handle('accounts:stop', async (_, id) => { await stopView(id); fitSelected(); return store.list(running()); });
  ipcMain.handle('accounts:select', async (_, id) => { await createView(id); selectedId = id; fitSelected(); return { selectedId: id }; });
  ipcMain.handle('accounts:set-limit', (_, value) => ({ activeLimit: store.setLimit(value) }));
  ipcMain.on('accounts:bounds', (_, value) => { bounds = { x: Math.max(0, Math.round(value.x)), y: Math.max(0, Math.round(value.y)), width: Math.max(1, Math.round(value.width)), height: Math.max(1, Math.round(value.height)) }; fitSelected(); });
  ipcMain.on('accounts:hide', () => { selectedId = ''; fitSelected(); });
  await window.loadURL(`http://127.0.0.1:${process.env.PORT}/`);
  bootLog('window loaded');
  window.on('closed', () => { window = null; });
}

app.whenReady().then(bootstrap).catch(error => { bootLog(`boot failed: ${error.stack || error}`); app.quit(); });
app.on('window-all-closed', () => app.quit());
