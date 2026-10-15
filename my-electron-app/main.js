const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard } = require("electron/main");

// 拦截 Squirrel Windows 安装/更新/卸载事件，防止安装过程中弹出主窗口。
// electron-squirrel-startup 会识别 --squirrel-install / --squirrel-updated
// / --squirrel-obsolete / --squirrel-uninstall 参数，创建快捷方式后退出。
if (require("electron-squirrel-startup")) {
  app.quit();
}

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// ---------------------------------------------------------------------------
// 路由表：主进程的「视图」菜单与渲染进程的 hash 路由共用同一份约定。
// 分成两组，菜单里表现为两个子菜单。
// ---------------------------------------------------------------------------
const ROUTE_GROUPS = [
  {
    label: "基础演示",
    routes: [
      { hash: "#/home", label: "首页", accel: "CmdOrCtrl+1" },
      { hash: "#/counter", label: "计数器", accel: "CmdOrCtrl+2" },
      { hash: "#/window", label: "窗口控制", accel: "CmdOrCtrl+3" },
      { hash: "#/dialog", label: "文件对话框", accel: "CmdOrCtrl+4" },
      { hash: "#/notify", label: "通知", accel: "CmdOrCtrl+5" },
      { hash: "#/clipboard", label: "读写剪贴板", accel: "CmdOrCtrl+6" },
    ],
  },
  {
    label: "UI 组件页",
    routes: [
      { hash: "#/components", label: "组件陈列", accel: "CmdOrCtrl+Shift+1" },
      { hash: "#/table", label: "数据表格", accel: "CmdOrCtrl+Shift+2" },
      { hash: "#/form", label: "表单与校验", accel: "CmdOrCtrl+Shift+3" },
      { hash: "#/overlay", label: "浮层与反馈", accel: "CmdOrCtrl+Shift+4" },
      { hash: "#/dashboard", label: "实时仪表盘", accel: "CmdOrCtrl+Shift+5" },
    ],
  },
];

// ---------------------------------------------------------------------------
// 系统指标采集（全部在主进程完成）
// ---------------------------------------------------------------------------

/** 取一份 CPU 时间片快照 */
const snapshotCpuTimes = () => os.cpus().map((cpu) => ({ ...cpu.times }));

let lastCpuTimes = snapshotCpuTimes();

/**
 * 用两次采样的时间片差值算 CPU 使用率。
 * 直接读 os.cpus() 只是累计值，必须自己算增量才是有意义的「当前使用率」。
 */
function readCpuUsage() {
  const now = snapshotCpuTimes();
  let idleDelta = 0;
  let totalDelta = 0;

  now.forEach((times, index) => {
    const prev = lastCpuTimes[index];
    if (!prev) return;
    const idle = times.idle - prev.idle;
    const total =
      times.user - prev.user +
      times.nice - prev.nice +
      times.sys - prev.sys +
      times.irq - prev.irq +
      idle;
    idleDelta += idle;
    totalDelta += total;
  });

  lastCpuTimes = now;
  return totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;
}

/** 采集一帧指标 */
function collectMetrics() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;

  return {
    ts: Date.now(),
    cpu: readCpuUsage(),
    memPercent: (usedBytes / totalBytes) * 100,
    memUsedGB: usedBytes / 1024 ** 3,
    memTotalGB: totalBytes / 1024 ** 3,
    processCount: app.getAppMetrics().length,
    systemUptimeSec: os.uptime(),
    appUptimeSec: process.uptime(),
  };
}

/** 启动时读一次的静态系统信息 */
function collectSystemInfo() {
  const cpus = os.cpus();
  return {
    "操作系统": `${os.type()} ${os.release()}`,
    "架构": os.arch(),
    "主机名": os.hostname(),
    "CPU 型号": (cpus[0]?.model || "未知").trim(),
    "CPU 核心数": String(cpus.length),
    "物理内存": `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`,
    "Electron": process.versions.electron,
    "Node.js": process.versions.node,
    "Chromium": process.versions.chrome,
    "V8": process.versions.v8,
  };
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------

/** 把渲染进程的 console 转发到启动终端，方便一眼看到页面报错 / CSP 违规 */
function forwardRendererConsole(webContents) {
  const LEVELS = { 0: "debug", 1: "info", 2: "warning", 3: "error" };

  // 只声明一个形参，Electron 才知道要用新版事件对象签名
  // （旧的多参数签名已废弃，会打印 deprecation 警告）。
  // level 在新版里是字符串、旧版里是数字，这里两种都兼容。
  webContents.on("console-message", (event) => {
    const level =
      typeof event.level === "number" ? LEVELS[event.level] || event.level : event.level;
    const where = event.sourceId
      ? `  (${path.basename(String(event.sourceId))}:${event.lineNumber})`
      : "";
    console.log(`[renderer:${level}] ${event.message}${where}`);
  });

  webContents.on("render-process-gone", (_event, details) => {
    console.error("[main] 渲染进程异常退出:", details.reason);
  });
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#f5f6f8",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const submenuOf = (group) =>
    group.routes.map((route) => ({
      label: route.label,
      accelerator: route.accel,
      click: () => mainWindow.webContents.send("navigate", route.hash),
    }));

  const menu = Menu.buildFromTemplate([
    {
      // 应用菜单：主进程 → 渲染进程（webContents.send 推送计数变化）
      label: app.name,
      submenu: [
        {
          label: "Increment",
          accelerator: "CmdOrCtrl+Up",
          click: () => mainWindow.webContents.send("update-counter", 1),
        },
        {
          label: "Decrement",
          accelerator: "CmdOrCtrl+Down",
          click: () => mainWindow.webContents.send("update-counter", -1),
        },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    {
      // 视图菜单：主进程 → 渲染进程（驱动渲染进程的 hash 路由）
      label: "视图",
      submenu: [
        ...ROUTE_GROUPS.map((group) => ({
          label: group.label,
          submenu: submenuOf(group),
        })),
        { type: "separator" },
        { role: "reload", label: "重新加载" },
        { role: "toggleDevTools", label: "开发者工具" },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
  mainWindow.loadFile("index.html");

  forwardRendererConsole(mainWindow.webContents);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // 窗口关闭时停掉正在跑的指标定时器，避免向已销毁的窗口发送消息
  mainWindow.on("closed", () => stopMetricsPush());
};

// ---------------------------------------------------------------------------
// 指标推送（主进程 → 渲染进程）
// ---------------------------------------------------------------------------

const PUSH_INTERVAL_MS = 1000;
let metricsTimer = null;

function stopMetricsPush() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
}

function startMetricsPush(target) {
  stopMetricsPush();
  metricsTimer = setInterval(() => {
    if (target.isDestroyed()) {
      stopMetricsPush();
      return;
    }
    const metrics = collectMetrics();
    target.send("metrics:update", metrics);
    console.log(
      `[main] metrics push  cpu=${metrics.cpu.toFixed(1)}%  mem=${metrics.memPercent.toFixed(1)}%`
    );
  }, PUSH_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // ---- 渲染进程 → 主进程（单向）：计数器回传 ----
  ipcMain.on("counter-value", (_event, value) => {
    console.log("[main] counter-value:", value);
  });

  // ---- 渲染进程 ↔ 主进程（双向）：窗口控制 ----
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle("window:toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  // ---- 渲染进程 ↔ 主进程（双向）：系统对话框（只能在主进程调用） ----
  ipcMain.handle("dialog:openFile", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("dialog:saveFile", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      buttonLabel: "选择位置",
    });
    return canceled ? null : filePath;
  });

  // ---- 渲染进程 ↔ 主进程（双向）：剪贴板 ----
  ipcMain.handle("clipboard:read", () => clipboard.readText());

  ipcMain.handle("clipboard:write", (_event, text) => {
    clipboard.writeText(String(text ?? ""));
    return clipboard.readText();
  });

  ipcMain.handle("clipboard:clear", () => {
    clipboard.clear();
    return "";
  });

  // ---- 渲染进程 ↔ 主进程（双向）：表单数据落盘 ----
  ipcMain.handle("form:save", async (_event, payload) => {
    const filePath = path.join(app.getPath("userData"), "form-submission.json");
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    console.log("[main] 表单已写入:", filePath);
    return { filePath, savedAt: Date.now() };
  });

  // ---- 渲染进程 ↔ 主进程（双向）：系统信息（读一次） ----
  ipcMain.handle("metrics:info", () => collectSystemInfo());

  ipcMain.handle("metrics:snapshot", () => collectMetrics());

  // ---- 主进程 → 渲染进程：开始 / 停止定时推送 ----
  ipcMain.handle("metrics:start", (event) => {
    const target = event.sender;
    startMetricsPush(target);
    return true;
  });

  ipcMain.handle("metrics:stop", () => {
    stopMetricsPush();
    return false;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopMetricsPush();
  if (process.platform !== "darwin") app.quit();
});
