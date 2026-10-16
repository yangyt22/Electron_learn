const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('window:maximized', (_event, isMaximized) => callback(isMaximized));
  }
});
