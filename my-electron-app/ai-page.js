// ===========================================================================
// AI 助手页的渲染进程逻辑
// ---------------------------------------------------------------------------
// 依赖加载顺序：bootstrap.bundle → renderer.js（hash 路由）→ ui-pages.js → 本文件
//
// 数据流回顾：
//   发送   renderer --invoke('ai:chat:start')--> main（立刻拿到 requestId）
//   流式   main --send('ai:chunk')--> preload --> 这里逐块追加到气泡
//   结束   main --send('ai:done' / 'ai:error')--> 这里收尾
// 渲染进程自己维护消息历史（不含 system prompt，system 由主进程注入）。
// ===========================================================================

(function initAiPage() {
  const messagesEl = document.getElementById("ai-messages");
  const inputEl = document.getElementById("ai-input");
  const sendBtn = document.getElementById("ai-send");
  const stopBtn = document.getElementById("ai-stop");
  const clearBtn = document.getElementById("ai-clear");
  const modeBadge = document.getElementById("ai-mode");
  if (!messagesEl || !inputEl) return;

  const api = window.electronAPI.ai;

  /** 页面内维护的对话历史：[{role, content}] */
  const history = [];
  /** 当前流式请求的 requestId，用于过滤过期推送 */
  let activeRequestId = null;
  let streaming = false;
  /** 本轮流已累积的回答文本（chunk 一块块拼在这里） */
  let received = "";

  /* ------------------------------------------------------- 迷你 Markdown */

  const escapeHtml = (text) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /**
   * 只支持本项目演示够用的子集：```代码块```、`行内码`、**粗体**、
   * > 引用、- 列表、换行。聊天场景不需要上完整 markdown 解析器。
   */
  function renderMarkdown(text) {
    return text
      .split(/```/)
      .map((segment, index) => {
        if (index % 2 === 1) {
          // 代码块：去掉首行可能存在的语言标注
          const code = segment.replace(/^[\w-]*\n/, "");
          return `<pre class="chat-code"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`;
        }
        return escapeHtml(segment)
          .replace(/^&gt; (.*)$/gm, '<span class="chat-quote">$1</span>')
          .replace(/^(-) (.*)$/gm, '<span class="chat-li">$2</span>')
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\n/g, "<br>");
      })
      .join("");
  }

  /* ----------------------------------------------------------- 消息气泡 */

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendBubble(role) {
    const bubble = document.createElement("div");
    bubble.className = `chat-msg chat-msg-${role}`;

    const avatar = document.createElement("i");
    avatar.className = role === "user" ? "bi bi-person-circle" : "bi bi-robot";

    const body = document.createElement("div");
    body.className = "chat-bubble";

    bubble.append(avatar, body);
    messagesEl.appendChild(bubble);
    scrollToBottom();
    return body;
  }

  /** 流式过程中频繁整段重排 innerHTML，量级只有几百字，性能足够 */
  let streamingBody = null;

  function renderStreaming(text) {
    if (!streamingBody) return;
    // 末尾加一个光标符，暗示“还在生成”
    streamingBody.innerHTML = renderMarkdown(text) + '<span class="chat-cursor"></span>';
    scrollToBottom();
  }

  function finishStreaming(text) {
    if (!streamingBody) return;
    streamingBody.innerHTML = renderMarkdown(text);
    streamingBody = null;
    scrollToBottom();
  }

  /* --------------------------------------------------------- 发送与停止 */

  function setStreaming(on) {
    streaming = on;
    sendBtn.classList.toggle("d-none", on);
    stopBtn.classList.toggle("d-none", !on);
    inputEl.disabled = on;
  }

  async function send(question) {
    const text = String(question ?? "").trim();
    if (!text || streaming) return;

    history.push({ role: "user", content: text });
    appendBubble("user").textContent = text;
    inputEl.value = "";
    inputEl.style.height = "auto";

    streamingBody = appendBubble("assistant");
    streamingBody.innerHTML = '<span class="chat-cursor"></span>';
    setStreaming(true);

    try {
      // invoke 立刻返回 requestId；真正的回答靠下面的三个事件逐块回来
      const { requestId } = await api.chat(history);
      activeRequestId = requestId;
      received = "";
    } catch (error) {
      finishStreaming(`⚠️ 发起请求失败：${error.message || error}`);
      setStreaming(false);
    }
  }

  // ---- 主进程 → 渲染进程：流式事件（requestId 不匹配的旧流直接丢弃） ----
  api.onChunk(({ requestId, text }) => {
    if (requestId !== activeRequestId) return;
    received += text;
    renderStreaming(received);
  });

  api.onDone(({ requestId, aborted }) => {
    if (requestId !== activeRequestId) return;
    if (aborted && !received) received = "（已停止生成）";
    finishStreaming(received);
    if (received) history.push({ role: "assistant", content: received });
    setStreaming(false);
    activeRequestId = null;
  });

  api.onError(({ requestId, message }) => {
    if (requestId !== activeRequestId) return;
    finishStreaming(`⚠️ 请求失败：${message}\n\n请检查 Base URL / API Key / 网络后重试。`);
    setStreaming(false);
    activeRequestId = null;
  });

  sendBtn.addEventListener("click", () => send(inputEl.value));
  stopBtn.addEventListener("click", () => api.stop());

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(inputEl.value);
    }
  });

  // 发送后清空并收起输入框高度
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
  });

  // 快捷提问 chips
  document.querySelectorAll("#ai-chips [data-q]").forEach((chip) => {
    chip.addEventListener("click", () => send(chip.dataset.q));
  });

  clearBtn.addEventListener("click", () => {
    if (streaming) api.stop();
    // 置空 requestId：后续到达的 done/chunk 事件会被过滤，不会污染新会话
    activeRequestId = null;
    streamingBody = null;
    history.length = 0;
    messagesEl.innerHTML = "";
    const welcome =
      "你好，我是 Electron Learn 的 AI 助手 👋\n\n" +
      "- 未配置 API Key 时我在**本地模拟模式**下运行，仍然有完整的流式体验\n" +
      "- 点右上角「模型设置」填入任意 OpenAI 兼容接口即可接入真实模型\n" +
      "- 试试下方的快捷提问，或直接问我 Electron 相关问题";
    streamingBody = appendBubble("assistant");
    finishStreaming(welcome);
  });

  /* ------------------------------------------------------------- 配置区 */

  const fieldIds = {
    baseURL: "ai-baseurl",
    model: "ai-model",
    temperature: "ai-temp",
    systemPrompt: "ai-system",
  };

  function fillForm(cfg) {
    for (const [key, id] of Object.entries(fieldIds)) {
      const el = document.getElementById(id);
      if (el) el.value = cfg[key] ?? "";
    }
    const keyEl = document.getElementById("ai-key");
    if (keyEl) keyEl.value = "";
    const hint = document.getElementById("ai-key-hint");
    if (hint) {
      hint.textContent = cfg.hasKey
        ? `已保存密钥（${cfg.keyHint}）${cfg.encrypted ? "，safeStorage 加密存储" : "，本机不支持加密，明文存储"}。输入新值可覆盖。`
        : "尚未配置密钥，当前为本地模拟模型。";
    }
    modeBadge.textContent = cfg.mode === "remote" ? `真实模型 · ${cfg.model}` : "本地模拟模型";
    modeBadge.className = `badge ${cfg.mode === "remote" ? "text-bg-success" : "text-bg-secondary"}`;
  }

  document.getElementById("ai-save")?.addEventListener("click", async () => {
    const patch = {};
    for (const [key, id] of Object.entries(fieldIds)) {
      patch[key] = document.getElementById(id).value;
    }
    const keyEl = document.getElementById("ai-key");
    // 只有真的输入了内容才提交 apiKey，避免把“留空=不修改”误存成空串
    if (keyEl && keyEl.value.trim() !== "") patch.apiKey = keyEl.value.trim();

    const cfg = await api.saveConfig(patch);
    fillForm(cfg);
    if (typeof showToast === "function") {
      showToast(cfg.mode === "remote" ? "配置已保存，将使用真实模型" : "配置已保存，当前为模拟模式", "primary", "AI 助手");
    }
  });

  document.getElementById("ai-test")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const result = document.getElementById("ai-test-result");
    btn.disabled = true;
    result.textContent = "测试中…";
    const outcome = await api.test();
    btn.disabled = false;
    result.textContent = outcome.message;
    result.className = `small ${outcome.ok ? "text-success" : "text-danger"}`;
  });

  /* ------------------------------------------------------------- 初始化 */

  (async function bootstrap() {
    fillForm(await api.getConfig());

    const welcome =
      "你好，我是 Electron Learn 的 AI 助手 👋\n\n" +
      "- 我由**主进程**代理调用，密钥不进渲染进程\n" +
      "- 未配置 API Key 时运行在**本地模拟模式**，开箱即跑\n" +
      "- 试试下方快捷提问，或直接输入问题";
    streamingBody = appendBubble("assistant");
    finishStreaming(welcome);
  })();
})();
