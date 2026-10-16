// ============ 简易 Hash 路由（纯渲染进程，非主进程能力） ============
const routes = [
  "home",
  "counter",
  "window",
  "dialog",
  "notify",
  "clipboard",
  "components",
  "table",
  "form",
  "overlay",
  "dashboard",
  "ai",
];

function resolveRoute() {
  const name = location.hash.replace("#/", "");
  return routes.includes(name) ? name : "home";
}

function render() {
  const current = resolveRoute();
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${current}`);
  });
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === current);
  });
}

window.addEventListener("hashchange", render);

// 视图菜单（主进程）驱动路由：主进程 → 渲染进程（navigate 事件）
window.electronAPI.onNavigate((hash) => {
  if (location.hash !== hash) location.hash = hash;
});

// ============ 首页：contextBridge 注入的环境信息 ============
const versionsEl = document.getElementById("versions");
if (versionsEl) {
  const v = window.electronAPI.versions;
  const rows = [
    ["Electron", v.electron()],
    ["Node.js", v.node()],
    ["Chromium", v.chrome()],
    ["平台", v.platform()],
  ];
  for (const [name, value] of rows) {
    const li = document.createElement("li");
    li.textContent = `${name}：${value}`;
    versionsEl.appendChild(li);
  }
}

// ============ 计数器：主进程 → 渲染进程 + 单向回传 ============
const counter = document.getElementById("counter");

window.electronAPI.onUpdateCounter((value) => {
  const oldValue = Number(counter.innerText);
  const newValue = oldValue + value;
  counter.innerText = newValue.toString();
  // 渲染进程 → 主进程（单向）：把新值回传给主进程打印
  window.electronAPI.counterValue(newValue);
});

// ============ 窗口控制：渲染进程 ↔ 主进程（invoke/handle） ============
document.getElementById("btn-minimize").addEventListener("click", () => {
  window.electronAPI.window.minimize();
});

document.getElementById("btn-maximize").addEventListener("click", async () => {
  const maximized = await window.electronAPI.window.toggleMaximize();
  document.getElementById("btn-maximize").textContent = maximized
    ? "还原窗口"
    : "最大化 / 还原";
});

document.getElementById("btn-close").addEventListener("click", () => {
  window.electronAPI.window.close();
});

// ============ 文件对话框：渲染进程 ↔ 主进程（invoke/handle） ============
const dialogResult = document.getElementById("dialog-result");

document.getElementById("btn-open").addEventListener("click", async () => {
  const filePath = await window.electronAPI.openFile();
  dialogResult.textContent = filePath || "（已取消）";
});

document.getElementById("btn-save").addEventListener("click", async () => {
  const filePath = await window.electronAPI.saveFile();
  dialogResult.textContent = filePath || "（已取消）";
});

// ============ 通知：纯渲染进程（HTML5 API，无 IPC） ============
const notifyState = document.getElementById("notify-state");

document.getElementById("btn-notify").addEventListener("click", () => {
  if (Notification.permission === "granted") {
    new Notification("来自渲染进程", {
      body: "这条通知完全由渲染进程发出，没有经过主进程。",
    });
    notifyState.textContent = "通知已发送（纯渲染进程）";
  } else {
    Notification.requestPermission().then((permission) => {
      notifyState.textContent = `权限状态：${permission}`;
    });
  }
});

// 初始渲染
render();
