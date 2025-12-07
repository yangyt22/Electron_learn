// const { contextBridge, ipcRenderer } = require('electron')

// contextBridge.exposeInMainWorld('versions', {
//   node: () => process.versions.node,
//   chrome: () => process.versions.chrome,
//   electron: () => process.versions.electron,
//     // 除函数之外，我们也可以暴露变量
//   ping: () => ipcRenderer.invoke('ping')
// })

// window.addEventListener('DOMContentLoaded', () => {
//   const replaceText = (selector, text) => {
//     const element = document.getElementById(selector)
//     if (element) element.innerText = text
//   }

//   for (const type of ['chrome', 'node', 'electron']) {
//     replaceText(`${type}-version`, process.versions[type])
//   }
// })

const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  // setTitle: (title) => ipcRenderer.send('set-title', title)
  // openFile: () => ipcRenderer.invoke('dialog:openFile')
  onUpdateCounter: (callback) => ipcRenderer.on('update-counter', (_event, value) => callback(value)),
  counterValue: (value) => ipcRenderer.send('counter-value', value)
})