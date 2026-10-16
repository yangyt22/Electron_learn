// ===========================================================================
// AI 服务（只在主进程使用）
// ---------------------------------------------------------------------------
// 为什么 AI 请求必须放主进程？三个原因，正好是这个 Demo 想讲的点：
//
//   1. 密钥安全：API Key 不能出现在渲染进程里。渲染进程 DevTools 一开，
//      window 上任何变量都能被读到。这里用 safeStorage（Windows 走 DPAPI、
//      macOS 走 Keychain）加密后存进 userData，只有主进程能解开。
//   2. CSP：index.html 里 default-src 'self'，渲染进程 fetch 外部域名会被拦。
//      主进程是 Node 环境，不受页面 CSP 约束。
//   3. CORS：浏览器同源策略对渲染进程有效，对主进程的 fetch 无效。
//
// 流式输出走「主进程 → 渲染进程」方向：主进程边收 SSE 边 webContents.send，
// 和 dashboard 页的指标推送是同一套思路，只是数据换成了模型吐出的字。
// ===========================================================================

const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** 默认配置：baseURL 走 OpenAI 兼容协议，DeepSeek / 通义 / 本地 Ollama 都能填 */
const DEFAULT_CONFIG = {
  baseURL: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  temperature: 0.7,
  systemPrompt: "你是 Electron Learn 内置助手，用中文回答，简洁实用，必要时给出代码示例。",
};

/** 允许从渲染进程改写的字段白名单，避免被塞进乱七八糟的东西 */
const WRITABLE_KEYS = ["baseURL", "model", "temperature", "systemPrompt", "apiKey"];

// ---------------------------------------------------------------------------
// 配置读写
// ---------------------------------------------------------------------------

const configFile = () => path.join(app.getPath("userData"), "ai-config.json");

/** 进程内缓存：解密一次就够，别每次请求都读盘 */
let cached = null;

/** 加密：能用系统级加密就用，用不了退化成明文并打标记 */
function encryptSecret(value) {
  if (!value) return "";
  if (!safeStorage.isEncryptionAvailable()) return `plain:${value}`;
  try {
    return `enc:${safeStorage.encryptString(value).toString("base64")}`;
  } catch {
    return `plain:${value}`;
  }
}

function decryptSecret(stored) {
  if (!stored) return "";
  if (stored.startsWith("enc:")) {
    if (!safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), "base64"));
    } catch {
      return "";
    }
  }
  return stored.replace(/^plain:/, "");
}

function sanitize(patch = {}) {
  const out = {};
  if (typeof patch.baseURL === "string") out.baseURL = patch.baseURL.trim();
  if (typeof patch.model === "string") out.model = patch.model.trim();
  if (typeof patch.systemPrompt === "string") out.systemPrompt = patch.systemPrompt;
  if (patch.temperature !== undefined) {
    const t = Number(patch.temperature);
    out.temperature = Number.isFinite(t) ? Math.min(2, Math.max(0, t)) : 0.7;
  }
  return out;
}

/** 读配置（含明文 apiKey，仅供主进程内部使用） */
function readConfig() {
  if (cached) return cached;

  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    stored = {};
  }

  cached = {
    ...DEFAULT_CONFIG,
    ...sanitize(stored),
    apiKey: decryptSecret(stored.apiKey || ""),
  };
  return cached;
}

/** 返回给渲染进程的配置快照：绝不带明文 apiKey */
function describeConfig() {
  const cfg = readConfig();
  return {
    baseURL: cfg.baseURL,
    model: cfg.model,
    temperature: cfg.temperature,
    systemPrompt: cfg.systemPrompt,
    hasKey: Boolean(cfg.apiKey),
    keyHint: cfg.apiKey ? `${cfg.apiKey.slice(0, 3)}***${cfg.apiKey.slice(-4)}` : "",
    mode: cfg.apiKey ? "remote" : "mock",
    encrypted: safeStorage.isEncryptionAvailable(),
  };
}

/** 落盘。apiKey 传空串表示清空，传 undefined 表示不动 */
function saveConfig(patch = {}) {
  const current = readConfig();
  const next = { ...current, ...sanitize(patch) };

  if (typeof patch.apiKey === "string") next.apiKey = patch.apiKey.trim();

  cached = next;
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(
    configFile(),
    JSON.stringify(
      {
        baseURL: next.baseURL,
        model: next.model,
        temperature: next.temperature,
        systemPrompt: next.systemPrompt,
        apiKey: encryptSecret(next.apiKey),
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("[ai] 配置已保存:", configFile(), next.apiKey ? "(含密钥)" : "(无密钥)");
  return next;
}

// ---------------------------------------------------------------------------
// 真实模型：OpenAI 兼容 /chat/completions + SSE 流式
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function endpointOf(baseURL) {
  return `${String(baseURL || "").replace(/\/+$/, "")}/chat/completions`;
}

async function streamRemote({ cfg, messages, signal, onDelta }) {
  const response = await fetch(endpointOf(cfg.baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: cfg.temperature,
      messages,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`模型服务返回 ${response.status} ${response.statusText} ${detail.slice(0, 300)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  // SSE 的基本单位是两个换行分隔的事件块，块内每行以 data: 开头
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      for (const line of block.split("\n")) {
        const text = line.trim();
        if (!text.startsWith("data:")) continue;
        const payload = text.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch {
          // 心跳行或非 JSON 内容直接跳过
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 本地模拟模型：没配 Key 时的兜底，保证打开就能看到流式效果
// ---------------------------------------------------------------------------

const MOCK_NOTICE =
  "> 当前是**本地模拟模型**（未配置 API Key）。填好密钥后会自动切换为真实模型，界面与流式体验完全一致。\n\n";

function mockAnswer(question) {
  const q = String(question || "").trim();

  if (!q) return "说点什么吧，比如「讲讲 Electron 的三层结构」。";

  if (/^(你好|您好|hi|hello|hey|哈喽|在吗)/i.test(q)) {
    return `你好！我是 Electron Learn 的 AI 助手。\n\n我可以聊 Electron 的主进程 / 渲染进程 / preload、四种 IPC 写法、打包分发这些话题。\n\n试试问我：「IPC 有哪几种写法？」`;
  }

  if (/ipc|进程间通信|通信/i.test(q)) {
    return `这个 Demo 里四种 IPC 都用上了：\n\n1. **渲染 → 主（单向）** \`ipcRenderer.send\` + \`ipcMain.on\`：计数器回传，不需要返回值。\n2. **渲染 ↔ 主（双向）** \`ipcRenderer.invoke\` + \`ipcMain.handle\`：窗口控制、文件对话框、剪贴板，返回 Promise。\n3. **主 → 渲染（推送）** \`webContents.send\` + \`ipcRenderer.on\`：菜单驱动路由、仪表盘指标、以及你现在看到的流式回答。\n4. **preload 注入** \`contextBridge.exposeInMainWorld\`：不算 IPC，但同样能安全地把主进程能力交给页面。\n\n\`\`\`js\n// 双向调用的标准写法\nconst filePath = await window.electronAPI.openFile();\n\`\`\``;
  }

  if (/electron|主进程|渲染进程|preload/i.test(q)) {
    return `Electron 可以分成三层看：\n\n- **主进程**：Node 环境，管窗口、菜单、系统对话框、文件读写，整个应用只有一个。\n- **渲染进程**：Chromium 里的网页，只负责界面；拿不到 Node API。\n- **preload**：夹在中间的桥，用 \`contextBridge\` 精确放行少量函数给页面。\n\n关键点在于：**渲染进程不是"不能"碰系统，而是"不该"**。所有危险能力集中在主进程，preload 只开一个小门。`;
  }

  if (/打包|分发|installer|squirrel|forge/i.test(q)) {
    return `本项目用 Electron Forge 打包：\n\n\`\`\`bash\nnpm run package   # 只产出免安装目录\nnpm run make      # 产出 Squirrel 安装器 + nupkg\n\`\`\`\n\nWindows 上 Squirrel 会在安装时带 \`--squirrel-install\` 参数启动一次应用，所以 main.js 顶部必须先 \`electron-squirrel-startup\` 拦截并退出，否则装的时候会弹出主窗口。`;
  }

  if (/代码|示例|怎么写|demo/i.test(q)) {
    return `给你一段最小可用的主进程 ↔ 渲染进程模板：\n\n\`\`\`js\n// main.js\nipcMain.handle("dialog:openFile", async () => {\n  const { canceled, filePaths } = await dialog.showOpenDialog({});\n  return canceled ? null : filePaths[0];\n});\n\n// preload.js\ncontextBridge.exposeInMainWorld("electronAPI", {\n  openFile: () => ipcRenderer.invoke("dialog:openFile"),\n});\n\`\`\`\n\n记住：\`invoke\` 对应 \`handle\`，\`send\` 对应 \`on\`，别混用。`;
  }

  return `【本地模拟回答】你问的是：**${q.slice(0, 120)}**\n\n我目前跑在模拟模式下，只能按关键词命中给预设答案。真要聊起来，点右上角「模型设置」填一个 OpenAI 兼容的 baseURL + API Key 就行。\n\n给你几个可以接着问的方向：\n\n- Electron 主进程和渲染进程怎么分工？\n- IPC 有哪几种写法？\n- 这个项目是怎么打包成安装器的？`;
}

/** 按标点切成小段，模拟真实模型一块一块吐字的手感 */
function chunkText(text) {
  return text.match(/[\s\S]{1,12}/g) || [];
}

async function streamMock({ question, signal, onDelta }) {
  const pieces = chunkText(MOCK_NOTICE + mockAnswer(question));
  for (const piece of pieces) {
    if (signal?.aborted) return;
    onDelta(piece);
    // 每段 35~90ms 的随机间隔，太快不像流式，太慢像卡顿
    await sleep(35 + Math.random() * 55);
  }
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

/**
 * 发起一次流式对话。
 * @param {Array<{role:string,content:string}>} history 渲染进程维护的历史（不含 system）
 * @param {AbortSignal} signal 中止信号
 * @param {(text:string)=>void} onDelta 每收到一小段就回调一次
 * @returns {Promise<{mode:string, elapsedMs:number, length:number}>}
 */
async function streamChat({ history = [], signal, onDelta }) {
  const cfg = readConfig();
  const startedAt = Date.now();
  const question = [...history].reverse().find((m) => m.role === "user")?.content || "";

  if (!cfg.apiKey) {
    await streamMock({ question, signal, onDelta });
    return { mode: "mock", elapsedMs: Date.now() - startedAt };
  }

  const messages = [
    { role: "system", content: cfg.systemPrompt || DEFAULT_CONFIG.systemPrompt },
    ...history.filter((m) => m.role === "user" || m.role === "assistant"),
  ];

  await streamRemote({ cfg, messages, signal, onDelta });
  return { mode: "remote", elapsedMs: Date.now() - startedAt };
}

/** 连通性自检：只问 8 个 token，够快也够说明问题 */
async function testConnection() {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    return { ok: false, mode: "mock", message: "尚未配置 API Key，当前使用本地模拟模型" };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(endpointOf(cfg.baseURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, mode: "remote", message: `HTTP ${response.status} ${detail.slice(0, 200)}` };
    }

    const json = await response.json();
    return {
      ok: true,
      mode: "remote",
      message: `${cfg.model} 就绪，往返 ${Date.now() - startedAt}ms`,
      sample: json.choices?.[0]?.message?.content || "",
    };
  } catch (error) {
    return { ok: false, mode: "remote", message: error.message || String(error) };
  }
}

module.exports = {
  describeConfig,
  saveConfig,
  streamChat,
  testConnection,
};
