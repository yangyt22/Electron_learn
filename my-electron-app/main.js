const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron/main')

const path = require('node:path')

// 路由表：视图菜单（主进程）与渲染进程的 hash 路由共用同一份约定
const ROUTES = [
  { hash: '#/home', label: '首页' },
  { hash: '#/counter', label: '计数器' },
  { hash: '#/window', label: '窗口控制' },
  { hash: '#/dialog', label: '文件对话框' },
  { hash: '#/notify', label: '通知' }
]

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  const menu = Menu.buildFromTemplate([
    {
      // 应用菜单：主进程 → 渲染进程（webContents.send 推送计数变化）
      label: app.name,
      submenu: [
        {
          label: 'Increment',
          accelerator: 'CmdOrCtrl+Up',
          click: () => mainWindow.webContents.send('update-counter', 1)
        },
        {
          label: 'Decrement',
          accelerator: 'CmdOrCtrl+Down',
          click: () => mainWindow.webContents.send('update-counter', -1)
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      // 视图菜单：主进程 → 渲染进程（驱动渲染进程的 hash 路由）
      label: '视图',
      submenu: [
        ...ROUTES.map((route, index) => ({
          label: route.label,
          accelerator: `CmdOrCtrl+${index + 1}`,
          click: () => mainWindow.webContents.send('navigate', route.hash)
        })),
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    }
  ])

  Menu.setApplicationMenu(menu)
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  mainWindow.webContents.openDevTools()
}

app.whenReady().then(() => {
  // ---- 渲染进程 → 主进程（单向）：计数器回传 ----
  ipcMain.on('counter-value', (_event, value) => {
    console.log('[main] counter-value:', value)
  })

  // ---- 渲染进程 ↔ 主进程（双向）：窗口控制 ----
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return win.isMaximized()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // ---- 渲染进程 ↔ 主进程（双向）：系统对话框（只能在主进程调用） ----
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      buttonLabel: '选择位置'
    })
    return canceled ? null : filePath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
