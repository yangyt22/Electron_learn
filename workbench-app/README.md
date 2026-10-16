# 统一工作台（Workbench App）

一个用于学习 Electron 的桌面客户端示例项目：无边框窗口 + 自定义标题栏，左侧固定侧边栏，右侧承载登录页、工作台、设置、个人信息四个视图，并包含注销登录确认弹窗与可折叠的右下角工具条。

> 说明：当前登录、注销等均为**本地模拟**，未接入真实后端接口（代码中已用 `TODO` 标注接入位置）。

## 功能一览

- **登录页**：左侧「温馨提示」卡片 + 3D 风格插画，右侧账号 / 密码表单
  - 密码支持明文与密文切换
  - 账号框回车聚焦密码框，密码框回车直接登录
  - 账号或密码为空时输入框红框提示
- **未登录态**：侧边栏常驻，头像显示灰色占位图并标注「未登录」，菜单仅保留「退出客户端」，导航不响应点击
- **登录后**：侧边栏头像切换为用户头像，菜单恢复完整项（个人信息 / 申请权限 / 终端管理 / 注销登录 / 退出客户端）
- **工作台页**：页头「欢迎使用工作台」+ 刷新、列表/卡片视图切换、搜索框（右对齐），内容区为「未配置应用」空状态
- **设置页**：接入地址、启动设置（开机自启动 / 登录成功后最小化客户端）、语言设置、当前版本与检查更新、《用户协议》
- **个人信息页**：头像、用户名与「永不过期」标签，账号 / 密码安全 / 电子邮箱 / 手机号码 / 用户目录唯一标识
- **注销登录**：二次确认弹窗，确认后回到未登录态
- **窗口行为**：自定义标题栏提供最小化、最大化/还原（图标随状态切换）、关闭；顶部可拖动移动窗口
- **右下角工具条**：诊断修复 / 日志搜集 / 更多操作，支持一键折叠收起

## 技术要点

| 主题 | 说明 |
| --- | --- |
| 无边框窗口 | `frame: false` 自绘标题栏，拖动区用 `-webkit-app-region: drag` |
| 进程通信 | 渲染进程 → `preload` → 主进程 `ipcMain`，主进程用 `webContents.send` 回传事件 |
| 安全配置 | `contextIsolation: true`、`nodeIntegration: false`，仅通过 `contextBridge` 暴露必要 API |
| 视图状态机 | 未登录 / 已登录两种状态，切换时同步维护 `display` 与 `.active` 类 |
| 纯前端渲染 | 图标与插画全部使用内联 SVG，不依赖任何图片资源与第三方库 |

## 目录结构

```
workbench-app/
├── main.js          # 主进程：创建无边框窗口、窗口控制 IPC
├── preload.js       # 预加载脚本：contextBridge 暴露 window.windowControls
├── index.html       # 页面结构：标题栏 / 侧边栏 / 登录视图 / 工作区 / 弹窗 / 工具条
├── styles.css       # 全部样式
├── renderer.js      # 渲染进程逻辑：登录、视图切换、菜单、弹窗、折叠
├── assets/
│   └── avatar.jpg   # 登录后展示的用户头像
└── package.json
```

## 运行方式

```bash
cd workbench-app
npm install
npm start
```

### 两个常见环境问题

1. **依赖装完却启动失败（缺少 Electron 二进制）**
   新版 npm 会拦截依赖的 `postinstall` 脚本，导致 Electron 二进制未下载。手动补一次即可：

   ```bash
   cd node_modules/electron
   node install.js
   ```

   如下载缓慢，可先设置镜像环境变量 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。

2. **启动后报 `Cannot read properties of undefined (reading 'on')`**
   说明 Electron 以纯 Node 模式运行了（环境中存在 `ELECTRON_RUN_AS_NODE=1`）。启动前清掉该变量：

   ```bash
   env -u ELECTRON_RUN_AS_NODE npx electron .
   ```

### 界面调试技巧

界面异常时，可带调试端口启动，用 Chrome 的 `chrome://inspect` 或 CDP 协议截图、查看元素尺寸与计算样式：

```bash
npx electron . --remote-debugging-port=9222
```

## 后续计划

- 接入真实登录 / 注销接口，改用 `ipcRenderer.invoke` + `ipcMain.handle` 的请求-响应模式
- 本地持久化用户偏好（如启动设置、语言）
- 补充多窗口、系统托盘、开机自启动等系统能力
- 使用 electron-forge 打包分发，并开启 fuses 加固

## License

ISC
