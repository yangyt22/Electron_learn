const { contextBridge, ipcRenderer } = require('electron/renderer')

// contextBridge 是渲染进程访问主进程能力的唯一入口。
// 页面上所有 window.electronAPI.* 都来自这里。
contextBridge.exposeInMainWorld('electronAPI', {
  // ---- 无 IPC：preload 进程直接读取的环境信息 ----
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    platform: () => process.platform
  },

  // ---- 主进程 → 渲染进程（on/send） ----
  onUpdateCounter: (callback) =>
    ipcRenderer.on('update-counter', (_event, value) => callback(value)),
  onNavigate: (callback) =>
    ipcRenderer.on('navigate', (_event, hash) => callback(hash)),

  // ---- 渲染进程 → 主进程（单向 send/on） ----
  counterValue: (value) => ipcRenderer.send('counter-value', value),

  // ---- 渲染进程 ↔ 主进程（双向 invoke/handle） ----
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: () => ipcRenderer.invoke('dialog:saveFile')
})
