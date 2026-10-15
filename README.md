# Electron_learn

一个用于学习 Electron 的个人练习项目。从零搭建工程，逐步实践 Electron 的进程间通信（IPC）模式，
并在其上搭建了一套由常见 UI 框架驱动的页面。

- 包名：`my-electron-app`
- 应用名：`MyElectronApp`
- 作者：yangyating
- 许可：ISC

## 目录结构

```
Electron_learn/
├── README.md
└── my-electron-app/              # Electron 工程本体
    ├── main.js                   # 主进程：窗口、菜单、ipcMain 处理器、系统指标采集
    ├── preload.js                # 预加载脚本：contextBridge 暴露安全 API
    ├── renderer.js               # 渲染进程：hash 路由 + 基础演示页逻辑
    ├── ui-pages.js               # 渲染进程：UI 框架页的交互逻辑
    ├── index.html                # 页面结构（11 个路由 section）
    ├── styles.css                # 应用样式（含与框架的隔离规则）
    ├── vendor/                   # 本地化的第三方 UI 框架（见 vendor/README.md）
    │   ├── bootstrap/            # Bootstrap 5.3.8 · CSS + bundle JS（含 Popper）
    │   └── bootstrap-icons/      # Bootstrap Icons 1.13.2 · CSS + 字体
    ├── forge.config.js           # Electron Forge 打包配置（squirrel / zip / deb / rpm）
    ├── package.json
    └── .vscode/launch.json       # 调试配置
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

## 打包与分发

```bash
cd my-electron-app
npm run package                        # 免安装版
npm run make                           # 安装包（会先自动执行一次 package，可用 --skip-package 复用上次产物）
```

Windows 下的产物：

| 路径 | 说明 | 体积 |
| --- | --- | --- |
| `build/MyElectronApp-win32-x64/` | 免安装版，整个目录拷走即可运行（双击 `MyElectronApp.exe`） | ≈ 327 MB |
| `build/make/squirrel.windows/x64/MyElectronApp-1.0.0 Setup.exe` | Squirrel 安装程序 | ≈ 127 MB |
| `build/make/squirrel.windows/x64/MyElectronApp-1.0.0-full.nupkg` | 完整更新包（Squirrel 自动更新用） | ≈ 127 MB |
| `build/make/squirrel.windows/x64/RELEASES` | 更新清单 | 84 B |

三点说明：

- **输出目录**由 `forge.config.js` 顶层的 `outDir` 决定。写成 `packagerConfig.out` **不会生效**（会被 forge 覆盖）。
- **平台差异**：Windows 上只会执行 `maker-squirrel`；`maker-deb` / `maker-rpm` 是 Linux 专用、`maker-zip` 限 darwin，在 Windows 上会被自动跳过。
- **打包内容**：`packagerConfig.ignore` 控制哪些文件不进包（已排除 `.history` / `.vscode` / 输出目录等）。注意该数组会**整体覆盖** forge 的默认 ignore，改动时别漏掉输出目录，否则会被递归打进应用。

> 若 `npm run make` 报 `System.ComponentModel.Win32Exception: 系统找不到指定的文件`，通常是 `electron-winstaller` 的 postinstall 被跳过，导致 vendor 里缺少 `7z.exe`（Squirrel 解包 nupkg 要用）。手动补跑一次即可：
> ```bash
> node node_modules/electron-winstaller/script/select-7z-arch.js
> ```

## 页面与路由

单窗口多页面 Demo：渲染进程内实现 hash 路由，顶部导航栏（渲染进程驱动）与菜单栏
「视图 → 基础演示 / UI 组件页」（主进程驱动）都能切换页面。

### 基础演示（讲 IPC 方向）

| 路由 | 页面 | 演示的通信模式 |
| --- | --- | --- |
| `#/home` | 应用信息 | 无 IPC：preload 经 contextBridge 注入 `process.versions` |
| `#/counter` | 计数器 | 主 → 渲染（`webContents.send`，菜单触发）+ 渲染 → 主单向回传 |
| `#/window` | 窗口控制 | 渲染 ↔ 主（`invoke`/`handle`）：最小化 / 最大化 / 关闭 |
| `#/dialog` | 文件对话框 | 渲染 ↔ 主（`invoke`/`handle` 返回值）：打开文件 / 另存为 |
| `#/notify` | 通知 | 纯渲染进程：HTML5 Notification，不经过主进程 |
| `#/clipboard` | 读写剪贴板 | 渲染 ↔ 主：`clipboard` 模块只能在主进程调用 |

### UI 组件页（Bootstrap 5.3）

| 路由 | 页面 | 主要内容 |
| --- | --- | --- |
| `#/components` | 组件陈列 | 按钮体系 / 徽章 / 卡片 / 进度条 / 折叠面板 / 标签页 / 警告框 / 列表组 / 色彩模式 |
| `#/table` | 数据表格 | 搜索过滤、点击表头排序、分页、全选与行选择、批量操作 |
| `#/form` | 表单与校验 | 输入组、下拉、范围滑块、复选 / 单选按钮组、开关、前端校验、提交落盘（走 IPC） |
| `#/overlay` | 浮层与反馈 | 模态框、Toast、Offcanvas 抽屉、下拉菜单、Tooltip / Popover、全屏加载遮罩 |
| `#/dashboard` | 实时仪表盘 | 主进程 `os` 模块读取系统信息 + `setInterval` 每秒推送，渲染进程手绘 canvas 折线 |

菜单快捷键：基础演示 `Ctrl+1 ~ Ctrl+6`，UI 组件页 `Ctrl+Shift+1 ~ Ctrl+Shift+5`。

## 已实践的 IPC 模式

1. **渲染进程 → 主进程（单向）** — `ipcRenderer.send` 配 `ipcMain.on`（计数器回传）
2. **渲染进程 ↔ 主进程（双向）** — `ipcRenderer.invoke` 配对 `ipcMain.handle`
   （窗口控制、文件对话框、剪贴板、表单落盘、指标快照）
3. **主进程 → 渲染进程** — `webContents.send` 配菜单 `click` 事件
   （计数推送、路由导航、每秒指标推送）

有一个小设计值得留意：`#/components` 等「纯前端」页面完全不碰 IPC，
和 `#/dashboard` 这类重度依赖主进程的页面放在一起，正好形成对照。

## 关于 UI 框架的引入方式

`index.html` 的 CSP 是：

```
default-src 'self'; script-src 'self'; img-src 'self' data:
```

`'self'` 意味着**不能走 CDN**；而这个工程没有打包器（没有 Vite / Webpack）。
因此做法是把 Bootstrap 的 `dist` 文件复制进 `vendor/` 目录，用相对路径引用：
离线可用、版本锁在仓库里、也满足 CSP。细节见 [`vendor/README.md`](my-electron-app/vendor/README.md)。

两点容易踩的坑，代码里都做了处理：

- **`img-src` 需要放行 `data:`**：Bootstrap 把复选框勾选标记、下拉箭头等图标内联成
  `data:image/svg+xml` 写在 CSS 背景图里，不放行会「丢图标」。
- **样式隔离**：`styles.css` 里通用的 `button` 规则加了 `:not([class*="btn"])` 守卫，
  legacy 排版规则限定在 `.page:not(.ui-page)`，避免和 Bootstrap 组件互相覆盖。

## 调试提示

`main.js` 里注册了 `console-message` 转发：**渲染进程的 `console.log` 会打印到启动终端**，
带 `[renderer:info]` / `[renderer:error]` 前缀。页面报错和 CSP 违规不用切到 DevTools 就能看到。

`ui-pages.js` 末尾有一段启动自检，每次启动会打印两行，用来确认框架资源与 IPC 通道都正常：

```
[renderer] 框架自检通过 —— Bootstrap CSS 生效 · JS v5.3.8 · 图标 已加载
[renderer] IPC 自检通过 —— CPU 58.7% · 内存 63.9% · 应用进程数 5
```

## 技术栈

| 依赖 | 版本 |
| --- | --- |
| electron | ^39.2.5 |
| @electron-forge/cli | ^7.10.2 |
| @electron/fuses | ^1.8.0 |
| electron-squirrel-startup | ^1.0.1 |
| bootstrap（本地化到 vendor/） | 5.3.8 |
| bootstrap-icons（本地化到 vendor/） | 1.13.2 |

## 说明

`node_modules/`、`out/`、`build/`、`.history/` 均为可再生或编辑器临时内容，已在 `.gitignore` 中排除。

`package.json` 中的 `overrides` 把 `@electron/node-gyp` 指向了 registry 已发布版本：
该包原本被 `@electron/rebuild` 钉在 git 提交上，在禁止 git 拉包的环境里会导致 `npm install` 失败。
