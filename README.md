# Electron_learn

一个用于学习 Electron 的个人练习项目。从零搭建工程，逐步实践 Electron 的三种进程间通信（IPC）模式。

- 包名：`my-electron-app`
- 应用名：`MyElectronApp`
- 作者：yangyating
- 许可：ISC

## 目录结构

```
Electron_learn/
├── README.md
└── my-electron-app/          # Electron 工程本体
    ├── main.js               # 主进程：窗口、菜单、ipcMain 监听/处理器
    ├── preload.js            # 预加载脚本：contextBridge 暴露安全 API
    ├── renderer.js           # 渲染进程：hash 路由 + 各页面逻辑
    ├── index.html            # 页面结构（5 个路由 section）
    ├── styles.css            # 样式
    ├── forge.config.js       # Electron Forge 打包配置（squirrel / zip / deb / rpm）
    ├── package.json
    └── .vscode/launch.json   # 调试配置
```

## 环境要求

- Node.js（建议 18 及以上）
- npm

## 常用命令

在 `my-electron-app/` 目录下执行：

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm start` | 启动开发环境（`electron-forge start`） |
| `npm run package` | 打包为免安装目录 |
| `npm run make` | 生成安装包（Squirrel / zip / deb / rpm） |

## 页面与路由

应用是一个单窗口多页面 Demo：渲染进程内实现 hash 路由（`#/home`、`#/counter`…），
顶部导航栏（渲染进程驱动）与菜单栏「视图」（主进程驱动，Ctrl+1 ~ Ctrl+5）都能切换页面。

| 路由 | 页面 | 演示的通信模式 |
| --- | --- | --- |
| `#/home` | 应用信息 | 无 IPC：preload 经 contextBridge 注入 `process.versions` |
| `#/counter` | 计数器 | 主 → 渲染（`webContents.send`，菜单触发）+ 渲染 → 主单向回传 |
| `#/window` | 窗口控制 | 渲染 ↔ 主（`invoke`/`handle`）：最小化 / 最大化 / 关闭 |
| `#/dialog` | 文件对话框 | 渲染 ↔ 主（`invoke`/`handle` 返回值）：打开文件 / 另存为 |
| `#/notify` | 通知 | 纯渲染进程：HTML5 Notification，不经过主进程 |

## 已实践的 IPC 模式

1. **渲染进程 → 主进程（单向）** — `ipcRenderer.send` 配 `ipcMain.on`（计数器回传）
2. **渲染进程 ↔ 主进程（双向）** — `ipcRenderer.invoke` 配对 `ipcMain.handle`（窗口控制、文件对话框）
3. **主进程 → 渲染进程** — `webContents.send` 配菜单 `click` 事件（计数推送、路由导航）

早期的主题切换、文件选择等实验代码已被上述正式实现取代（git 历史中仍可找到）。

## 技术栈

| 依赖 | 版本 |
| --- | --- |
| electron | ^39.2.5 |
| @electron-forge/cli | ^7.10.2 |
| @electron/fuses | ^1.8.0 |
| electron-squirrel-startup | ^1.0.1 |

## 说明

`node_modules/`、`out/`、`build/`、`.history/` 均为可再生或编辑器临时内容，已在 `.gitignore` 中排除。克隆后执行 `npm install` 即可还原开发环境。
