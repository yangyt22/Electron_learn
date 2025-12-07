const { ipcMain } = require('electron');
const { app, BrowserWindow, dialog } = require('electron/main')

const path = require('node:path')

// function handleSetTitle (event, title) {
//   const webContents = event.sender
//   const win = BrowserWindow.fromWebContents(webContents)
//   win.setTitle(title)
// }

async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog();
  if (!canceled) {
    return filePaths[0]
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    // width: 800,
    // height: 600,
    webPreferences: {
      //   preload: `${__dirname}/preload.js`
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.on('ready', () => {
  // ipcMain.handle('ping', () => 'pong')
  // ipcMain.on('set-title', handleSetTitle)
  ipcMain.handle('dialog:openFile', handleFileOpen)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})