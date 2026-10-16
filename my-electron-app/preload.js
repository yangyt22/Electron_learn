const { contextBridge, ipcRenderer } = require('electron/renderer')

// contextBridge 是渲染进程访问主进程能力的唯一入口。
// 页面上所有 window.electronAPI.* 都来自这里。
//
// 约定：只暴露「函数」。复杂对象经过 contextBridge 序列化时可能被洗成空对象，
// 而函数会被安全地代理过去，是官方推荐的写法。
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
  saveFile: () => ipcRenderer.invoke('dialog:saveFile'),

  // 剪贴板：内容读写都在主进程（clipboard 模块）
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read'),
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
    clear: () => ipcRenderer.invoke('clipboard:clear')
  },

  // 表单落盘：把渲染进程收集到的数据交给主进程写入用户数据目录
  saveForm: (payload) => ipcRenderer.invoke('form:save', payload),

  // ---- AI 助手 ----
  // 请求一律由主进程发出：密钥不出主进程，页面 CSP / CORS 也管不到主进程。
  // 回答不是一次性返回的，而是主进程边收 SSE 边推 ai:chunk，这里逐块转发。
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:config:get'),
    saveConfig: (patch) => ipcRenderer.invoke('ai:config:set', patch),
    test: () => ipcRenderer.invoke('ai:test'),

    // 立刻拿到 requestId，正文靠下面三个事件回来
    chat: (history) => ipcRenderer.invoke('ai:chat:start', history),
    stop: () => ipcRenderer.invoke('ai:chat:stop'),

    onChunk: (callback) =>
      ipcRenderer.on('ai:chunk', (_event, payload) => callback(payload)),
    onDone: (callback) =>
      ipcRenderer.on('ai:done', (_event, payload) => callback(payload)),
    onError: (callback) =>
      ipcRenderer.on('ai:error', (_event, payload) => callback(payload))
  },

  // 系统指标：快照 / 静态信息走 invoke，实时数据由主进程定时推送
  metrics: {
    info: () => ipcRenderer.invoke('metrics:info'),
    snapshot: () => ipcRenderer.invoke('metrics:snapshot'),
    start: () => ipcRenderer.invoke('metrics:start'),
    stop: () => ipcRenderer.invoke('metrics:stop'),
    onUpdate: (callback) =>
      ipcRenderer.on('metrics:update', (_event, metrics) => callback(metrics))
  }
})
