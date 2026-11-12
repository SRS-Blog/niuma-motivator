'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('niuma', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (next) => ipcRenderer.invoke('config:update', next),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  toggleClickThrough: () => ipcRenderer.invoke('clickthrough:toggle'),
  setTheme: (id) => ipcRenderer.invoke('theme:set', id),
  setWidgetHeight: (h) => ipcRenderer.send('widget:height', h),
  openSettings: () => ipcRenderer.send('settings:open'),
  openConfigDir: () => ipcRenderer.send('app:open-config-dir'),
  quit: () => ipcRenderer.send('app:quit'),
  onConfig: (cb) => {
    ipcRenderer.on('config:changed', (_e, c) => cb(c));
  },
});
