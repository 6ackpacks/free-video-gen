const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('doubaoAccounts', {
  available: true,
  list: () => ipcRenderer.invoke('accounts:list'),
  add: input => ipcRenderer.invoke('accounts:add', input),
  update: (id, input) => ipcRenderer.invoke('accounts:update', { id, input }),
  remove: id => ipcRenderer.invoke('accounts:remove', id),
  start: id => ipcRenderer.invoke('accounts:start', id),
  stop: id => ipcRenderer.invoke('accounts:stop', id),
  select: id => ipcRenderer.invoke('accounts:select', id),
  setLimit: value => ipcRenderer.invoke('accounts:set-limit', value),
  setBounds: bounds => ipcRenderer.send('accounts:bounds', bounds),
  hide: () => ipcRenderer.send('accounts:hide')
});
