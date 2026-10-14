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
    ├── main.js               # 主进程：创建窗口、构建菜单、注册 IPC 监听
    ├── preload.js            # 预加载脚本：contextBridge 暴露安全 API
    ├── renderer.js           # 渲染进程：DOM 与业务逻辑
    ├── index.html            # 页面结构
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

## 已实践的 IPC 模式

按 git 提交时间线，依次实践了三种通信方向：

1. **渲染进程 → 主进程（单向）** — `ipcRenderer.send` 配 `ipcMain.on`
2. **渲染进程 ↔ 主进程（双向）** — `ipcRenderer.invoke` 配对 `ipcMain.handle`
3. **主进程 → 渲染进程** — `webContents.send` 配菜单 `click` 事件

当前生效的是「菜单计数器」示例：菜单栏的 Increment / Decrement 触发主进程向渲染进程推送 `update-counter`，渲染进程更新计数后经 `counter-value` 回传主进程打印。在此之前的主题切换、文件选择等实验代码以注释形式保留在源码中。

## 技术栈

| 依赖 | 版本 |
| --- | --- |
| electron | ^39.2.5 |
| @electron-forge/cli | ^7.10.2 |
| @electron/fuses | ^1.8.0 |
| electron-squirrel-startup | ^1.0.1 |

## 说明

`node_modules/`、`out/`、`build/`、`.history/` 均为可再生或编辑器临时内容，已在 `.gitignore` 中排除。克隆后执行 `npm install` 即可还原开发环境。
