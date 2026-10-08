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
const focusWorkbench = () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } };
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => focusWorkbench());
  app.on('open-url', event => { event.preventDefault(); focusWorkbench(); });
}
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
const identityFromPayload = (payload, cookies = [], localStorage = {}) => {
  const data = payload?.data || {};
  const queue = [data.user, data.user_data, data.user_info, data.account_info, data, payload?.user].filter(Boolean);
  const seen = new Set();
  while (queue.length) {
    const user = queue.shift();
    if (!user || typeof user !== 'object' || seen.has(user)) continue;
    seen.add(user);
    const userId = user.user_id_str || user.user_id || user.sec_user_id || user.uid;
    if (userId) return { user_id: String(userId), nickname: String(user.name || user.screen_name || user.nickname || data.name || '') };
    for (const value of Object.values(user)) if (value && typeof value === 'object') queue.push(value);
  }
  const persistedId = cookies.find(cookie => cookie.name === 'flow_cur_user_sec_id')?.value
    || localStorage.flow_tea_user_id
    || cookies.find(cookie => cookie.name === 'uid_tt')?.value;
  if (persistedId && cookies.some(cookie => ['sessionid', 'sessionid_ss', 'sid_tt'].includes(cookie.name) && cookie.value)) {
    return { user_id: String(persistedId), nickname: '' };
  }
  throw new Error('当前窗口尚未登录豆包，请先完成登录再同步');
};
async function syncAccount(id) {
  const view = await createView(id);
  const response = await view.webContents.executeJavaScript(`fetch('/passport/web/account/info/', { credentials: 'include' }).then(async response => ({ ok: response.ok, status: response.status, payload: await response.json() }))`, true);
  if (!response?.ok) throw new Error(`豆包登录态检查失败（HTTP ${response?.status || 0}）`);
  const accountSession = session.fromPartition(accountPartition(id));
  const cookies = (await accountSession.cookies.get({})).filter(cookie => /(^|\.)doubao\.com$/i.test(String(cookie.domain || '').replace(/^\./, '')));
  const localStorage = await view.webContents.executeJavaScript(`Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => { const key = localStorage.key(index); return [key, localStorage.getItem(key)] }))`, true);
  const identity = identityFromPayload(response.payload, cookies, localStorage);
  const apiResponse = await fetch(`http://127.0.0.1:${process.env.PORT}/api/doubao/import-session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, cookies, local_storage: localStorage })
  });
  const result = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) throw new Error(result.error || result.detail || '执行账号同步失败');
  store.update(id, { managerAccountId: result.id, nickname: result.display_name || identity.nickname, lastSyncedAt: new Date().toISOString() });
  return { local: store.get(id), manager: result };
}
async function syncSavedAccounts() {
  const accounts = [...store.state.accounts];
  for (const account of accounts) {
    try {
      const result = await syncAccount(account.id);
      bootLog(`account synced ${account.id} -> ${result.manager.id}`);
    } catch (error) {
      bootLog(`account sync skipped ${account.id}: ${error.message}`);
    } finally {
      await stopView(account.id).catch(() => {});
    }
  }
}

async function bootstrap() {
  bootLog('electron ready');
  const protocolRegistered = process.defaultApp
    ? app.setAsDefaultProtocolClient('video-workbench', process.execPath, [projectRoot])
    : app.setAsDefaultProtocolClient('video-workbench');
  bootLog(`launch protocol ${protocolRegistered ? 'registered' : 'unavailable'}`);
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
  ipcMain.handle('accounts:select', async (_, id) => {
    for (const openId of [...views.keys()]) if (openId !== id) await stopView(openId);
    await createView(id); selectedId = id; fitSelected(); return { selectedId: id };
  });
  ipcMain.handle('accounts:sync', async (_, id) => syncAccount(id));
  ipcMain.handle('accounts:set-limit', (_, value) => ({ activeLimit: store.setLimit(value) }));
  ipcMain.on('accounts:bounds', (_, value) => { bounds = { x: Math.max(0, Math.round(value.x)), y: Math.max(0, Math.round(value.y)), width: Math.max(1, Math.round(value.width)), height: Math.max(1, Math.round(value.height)) }; fitSelected(); });
  ipcMain.on('accounts:hide', () => { selectedId = ''; fitSelected(); });
  await window.loadURL(`http://127.0.0.1:${process.env.PORT}/`);
  bootLog('window loaded');
  setTimeout(() => syncSavedAccounts().catch(error => bootLog(`account sync failed: ${error.message}`)), 500);
  window.on('closed', () => { window = null; });
}

if (singleInstance) app.whenReady().then(bootstrap).catch(error => { bootLog(`boot failed: ${error.stack || error}`); app.quit(); });
app.on('window-all-closed', () => app.quit());
