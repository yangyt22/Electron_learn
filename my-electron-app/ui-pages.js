// ===========================================================================
// UI 框架页的交互逻辑
// ---------------------------------------------------------------------------
// 依赖：vendor/bootstrap/bootstrap.bundle.min.js（先加载）→ renderer.js → 本文件
// 全部跑在渲染进程里；只有剪贴板、表单落盘、指标采集三类操作会走 IPC。
// ===========================================================================

/* ------------------------------------------------------------------ 通用 */

/** 右下角轻提示。多次触发会依次堆叠，2.6 秒后自动消失。 */
function showToast(message, variant = "primary", title = "提示") {
  const area = document.getElementById("toast-area");
  if (!area) return;

  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "assertive");
  el.setAttribute("aria-atomic", "true");

  const wrap = document.createElement("div");
  wrap.className = "d-flex";

  const body = document.createElement("div");
  body.className = "toast-body";
  const strong = document.createElement("strong");
  strong.textContent = `${title}：`;
  body.appendChild(strong);
  body.appendChild(document.createTextNode(message));

  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn-close btn-close-white me-2 m-auto";
  close.setAttribute("data-bs-dismiss", "toast");
  close.setAttribute("aria-label", "关闭");

  wrap.append(body, close);
  el.appendChild(wrap);
  area.appendChild(el);

  el.addEventListener("hidden.bs.toast", () => el.remove());
  bootstrap.Toast.getOrCreateInstance(el, { delay: 2600 }).show();
}

const fmt = (n, digits = 1) => Number(n).toFixed(digits);

/** 秒 → 「x天 x小时 x分」 */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分 ${s % 60} 秒`;
}

/* -------------------------------------------------- 组件陈列页：初始化 JS */

(function initComponentsPage() {
  // Tooltip / Popover 在 Bootstrap 5 里不会自动初始化，必须显式 new。
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    bootstrap.Tooltip.getOrCreateInstance(el);
  });
  document.querySelectorAll('[data-bs-toggle="popover"]').forEach((el) => {
    bootstrap.Popover.getOrCreateInstance(el);
  });

  // 演示「加载中」按钮：点一下进入禁用态，1.5 秒后恢复
  const loadingBtn = document.getElementById("demo-loading");
  if (loadingBtn) {
    const restore = loadingBtn.innerHTML;
    loadingBtn.addEventListener("click", () => {
      if (loadingBtn.disabled) return;
      loadingBtn.disabled = true;
      setTimeout(() => {
        loadingBtn.disabled = false;
        loadingBtn.innerHTML = restore;
        showToast("异步任务完成", "success", "演示");
      }, 1500);
    });
  }
})();

/* ------------------------------------------------------------ 剪贴板页 */

(function initClipboardPage() {
  const input = document.getElementById("clip-input");
  const result = document.getElementById("clip-result");
  if (!input || !result) return;

  document.getElementById("clip-write").addEventListener("click", async () => {
    const text = input.value;
    if (!text.trim()) {
      showToast("先输入点内容再写入", "warning", "剪贴板");
      return;
    }
    // invoke → 主进程 clipboard.writeText → 返回写后的内容
    const written = await window.electronAPI.clipboard.write(text);
    result.textContent = written || "（空）";
    showToast("已写入系统剪贴板", "success", "剪贴板");
  });

  document.getElementById("clip-read").addEventListener("click", async () => {
    const text = await window.electronAPI.clipboard.read();
    result.textContent = text || "（剪贴板为空）";
    input.value = text;
    showToast(`读到 ${text.length} 个字符`, "info", "剪贴板");
  });

  document.getElementById("clip-clear").addEventListener("click", async () => {
    await window.electronAPI.clipboard.clear();
    result.textContent = "（尚未读取）";
    input.value = "";
    showToast("剪贴板已清空", "secondary", "剪贴板");
  });
})();

/* ------------------------------------------------------------ 数据表格页 */

(function initTablePage() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const DEPTS = ["前端工程组", "客户端组", "测试组", "产品组", "设计中台", "基础架构"];
  const STATUS = ["在职", "试用", "休假", "离职"];
  const STATUS_BADGE = {
    在职: "text-bg-success",
    试用: "text-bg-info",
    休假: "text-bg-warning",
    离职: "text-bg-secondary",
  };
  const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张".split("");
  const GIVEN = [
    "一鸣", "思远", "雨桐", "嘉禾", "文博", "子涵",
    "若溪", "晨曦", "浩然", "静怡", "泽宇", "梦琳",
    "亦然", "书豪", "清越", "知远", "南风", "未央",
  ];

  // 用固定种子的伪随机数，保证每次启动数据一致，方便对照效果
  let seed = 20261015;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const data = Array.from({ length: 42 }, (_, i) => {
    const id = i + 1;
    return {
      id,
      name: pick(SURNAMES) + pick(GIVEN),
      dept: pick(DEPTS),
      email: `emp${String(id).padStart(3, "0")}@corp.example`,
      score: 55 + Math.floor(rnd() * 45),
      status: rnd() < 0.72 ? "在职" : pick(STATUS),
    };
  });

  const state = {
    keyword: "",
    status: "",
    sortKey: "name",
    sortDir: "asc",
    page: 1,
    size: 8,
    selected: new Set(),
  };

  const view = () => {
    const kw = state.keyword.trim().toLowerCase();
    let rows = data.filter((row) => {
      const hitKw =
        !kw ||
        row.name.toLowerCase().includes(kw) ||
        row.dept.toLowerCase().includes(kw) ||
        row.email.toLowerCase().includes(kw);
      const hitStatus = !state.status || row.status === state.status;
      return hitKw && hitStatus;
    });

    const dir = state.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const x = a[state.sortKey];
      const y = b[state.sortKey];
      if (typeof x === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "zh-Hans-CN") * dir;
    });
    return rows;
  };

  function renderSortIcons() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      const active = th.dataset.sort === state.sortKey;
      th.classList.toggle("sorted-asc", active && state.sortDir === "asc");
      th.classList.toggle("sorted-desc", active && state.sortDir === "desc");
      const icon = th.querySelector(".sort-icon");
      if (!icon) return;
      icon.className = "bi sort-icon " + (
        active
          ? state.sortDir === "asc"
            ? "bi-caret-up-fill"
            : "bi-caret-down-fill"
          : "bi-arrow-down-up"
      );
    });
  }

  function renderPager(totalPages) {
    const pager = document.getElementById("table-pager");
    pager.innerHTML = "";

    const addItem = (label, page, opts = {}) => {
      const li = document.createElement("li");
      li.className = "page-item" + (opts.active ? " active" : "") + (opts.disabled ? " disabled" : "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-link";
      btn.textContent = label;
      btn.disabled = Boolean(opts.disabled);
      btn.addEventListener("click", () => {
        state.page = page;
        renderTable();
      });
      li.appendChild(btn);
      pager.appendChild(li);
    };

    addItem("‹", Math.max(1, state.page - 1), { disabled: state.page === 1 });
    for (let p = 1; p <= totalPages; p += 1) {
      addItem(String(p), p, { active: p === state.page });
    }
    addItem("›", Math.min(totalPages, state.page + 1), { disabled: state.page === totalPages });
  }

  function renderTable() {
    const rows = view();
    const totalPages = Math.max(1, Math.ceil(rows.length / state.size));
    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.size;
    const pageRows = rows.slice(start, start + state.size);

    tbody.innerHTML = "";
    pageRows.forEach((row) => {
      const tr = document.createElement("tr");

      const tdCheck = document.createElement("td");
      tdCheck.className = "text-center";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-check-input";
      checkbox.checked = state.selected.has(row.id);
      checkbox.setAttribute("aria-label", `选择 ${row.name}`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selected.add(row.id);
        else state.selected.delete(row.id);
        syncSelection();
      });
      tdCheck.appendChild(checkbox);

      const cell = (text, className) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (className) td.className = className;
        return td;
      };

      const tdStatus = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge ${STATUS_BADGE[row.status]}`;
      badge.textContent = row.status;
      tdStatus.appendChild(badge);

      const tdAction = document.createElement("td");
      tdAction.className = "text-end";
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn btn-sm btn-outline-secondary";
      viewBtn.textContent = "查看";
      viewBtn.addEventListener("click", () => {
        showToast(`${row.name} · ${row.dept} · 绩效 ${row.score}`, "primary", "行详情");
      });
      tdAction.appendChild(viewBtn);

      tr.append(
        tdCheck,
        cell(row.name),
        cell(row.dept),
        cell(row.email, "d-none d-lg-table-cell"),
        cell(String(row.score)),
        tdStatus,
        tdAction
      );
      tbody.appendChild(tr);
    });

    if (pageRows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.className = "text-center text-body-secondary py-4";
      td.textContent = "没有匹配的记录";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    document.getElementById("table-pageinfo").textContent =
      `第 ${state.page} / ${totalPages} 页，命中 ${rows.length} 条（总计 ${data.length} 条）`;
    document.getElementById("table-count-badge").textContent = `${rows.length} 条`;

    renderSortIcons();
    renderPager(totalPages);
    syncSelection();
  }

  function syncSelection() {
    const onPage = view().slice((state.page - 1) * state.size, state.page * state.size);
    const selectedOnPage = onPage.filter((row) => state.selected.has(row.id)).length;

    const checkAll = document.getElementById("table-check-all");
    checkAll.checked = onPage.length > 0 && selectedOnPage === onPage.length;
    checkAll.indeterminate = selectedOnPage > 0 && selectedOnPage < onPage.length;

    const n = state.selected.size;
    document.getElementById("table-selection").textContent =
      n === 0 ? "未选择任何行" : `已选择 ${n} 行`;

    const bulk = document.getElementById("table-bulk");
    bulk.classList.toggle("d-none", n === 0);
    document.getElementById("table-bulk-text").textContent = `已选中 ${n} 行，可执行批量操作`;
  }

  // ---- 事件绑定 ----

  document.getElementById("table-search").addEventListener("input", (e) => {
    state.keyword = e.target.value;
    state.page = 1;
    renderTable();
  });

  document.getElementById("table-status").addEventListener("change", (e) => {
    state.status = e.target.value;
    state.page = 1;
    renderTable();
  });

  document.getElementById("table-size").addEventListener("change", (e) => {
    state.size = Number(e.target.value);
    state.page = 1;
    renderTable();
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      renderTable();
    });
  });

  document.getElementById("table-check-all").addEventListener("change", (e) => {
    const onPage = view().slice((state.page - 1) * state.size, state.page * state.size);
    onPage.forEach((row) => {
      if (e.target.checked) state.selected.add(row.id);
      else state.selected.delete(row.id);
    });
    renderTable();
  });

  document.querySelectorAll("[data-bulk]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = state.selected.size;
      if (btn.dataset.bulk === "export") {
        showToast(`已导出 ${n} 条记录（演示，未真正写盘）`, "success", "批量");
        return;
      }
      // 删除：从数据源里移除并清空选择
      const removed = state.selected.size;
      for (let i = data.length - 1; i >= 0; i -= 1) {
        if (state.selected.has(data[i].id)) data.splice(i, 1);
      }
      state.selected.clear();
      renderTable();
      showToast(`已删除 ${removed} 条记录`, "danger", "批量");
    });
  });

  renderTable();
})();

/* -------------------------------------------------------- 表单与校验页 */

(function initFormPage() {
  const form = document.getElementById("demo-form");
  if (!form) return;

  const level = document.getElementById("f-level");
  const levelOut = document.getElementById("f-level-out");
  const note = document.getElementById("f-note");
  const noteCount = document.getElementById("f-note-count");
  const output = document.getElementById("f-output");
  const savedPath = document.getElementById("f-saved-path");

  level.addEventListener("input", () => {
    levelOut.textContent = `P${level.value}`;
  });

  note.addEventListener("input", () => {
    noteCount.textContent = String(note.value.length);
  });

  const collect = () => {
    const fd = new FormData(form);
    return {
      name: fd.get("name") || "",
      email: fd.get("email") || "",
      dept: fd.get("dept") || "",
      level: `P${fd.get("level")}`,
      note: fd.get("note") || "",
      skills: fd.getAll("skills"),
      mode: fd.get("mode") || "",
      notify: fd.get("notify") === "on",
      agree: fd.get("agree") === "on",
      submittedAt: new Date().toISOString(),
    };
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Bootstrap 的校验：靠 checkValidity() + was-validated 类切换样式
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      showToast("还有必填项没填完", "danger", "校验失败");
      form.querySelector(":invalid")?.focus();
      return;
    }

    const payload = collect();
    // 走 IPC：让主进程写进用户数据目录
    const { filePath, savedAt } = await window.electronAPI.saveForm(payload);

    output.textContent = JSON.stringify(payload, null, 2);
    savedPath.textContent = `已保存 · ${new Date(savedAt).toLocaleTimeString()}`;
    showToast(`主进程已写入 ${filePath}`, "success", "提交成功");
    console.log("[renderer] 表单已通过 invoke 交给主进程:", filePath);
  });

  form.addEventListener("reset", () => {
    form.classList.remove("was-validated");
    levelOut.textContent = "P5";
    noteCount.textContent = "0";
    output.textContent = "（提交后这里会显示主进程保存下来的 JSON 内容）";
    savedPath.textContent = "尚未提交";
  });

  document.getElementById("f-invalid-demo").addEventListener("click", () => {
    // 故意制造一次失败：清空姓名 + 取消勾选条款
    document.getElementById("f-name").value = "";
    document.getElementById("f-agree").checked = false;
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      showToast("看红色提示，这就是失败态的样子", "warning", "演示");
    }
  });
})();

/* -------------------------------------------------------- 浮层与反馈页 */

(function initOverlayPage() {
  const basicEl = document.getElementById("ov-modal-basic-el");
  if (!basicEl) return;

  const openModal = (el) => bootstrap.Modal.getOrCreateInstance(el).show();

  document.getElementById("ov-modal-basic").addEventListener("click", () => openModal(basicEl));

  document
    .getElementById("ov-modal-large")
    .addEventListener("click", () => openModal(document.getElementById("ov-modal-large-el")));

  const confirmEl = document.getElementById("ov-modal-confirm-el");
  document.getElementById("ov-modal-confirm").addEventListener("click", () => openModal(confirmEl));

  document.getElementById("ov-confirm-yes").addEventListener("click", () => {
    bootstrap.Modal.getOrCreateInstance(confirmEl).hide();
    showToast("记录已删除（演示）", "danger", "已确认");
  });

  // Toast 演示按钮：data-toast 指定配色
  document.querySelectorAll("[data-toast]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const variant = btn.dataset.toast;
      const titles = { success: "成功", danger: "失败", warning: "警告", info: "信息" };
      showToast(`这是一条 ${variant} 级别的轻提示`, variant, titles[variant] || "提示");
    });
  });

  // 全屏加载遮罩
  const mask = document.getElementById("ov-loading-mask");
  document.getElementById("ov-loading").addEventListener("click", () => {
    mask.classList.remove("d-none");
    setTimeout(() => {
      mask.classList.add("d-none");
      showToast("异步任务已完成，遮罩已撤下", "success", "加载");
    }, 1600);
  });

  // 抽屉里的滑块
  const drawerRange = document.getElementById("drawer-range");
  drawerRange.addEventListener("input", () => {
    document.getElementById("drawer-range-out").textContent = drawerRange.value;
  });
})();

/* -------------------------------------------------------- 实时仪表盘页 */

(function initDashboardPage() {
  const canvas = document.getElementById("dash-chart");
  if (!canvas) return;

  const HISTORY_MAX = 60;
  const history = [];

  const els = {
    cpu: document.getElementById("m-cpu"),
    cpuBar: document.getElementById("m-cpu-bar"),
    mem: document.getElementById("m-mem"),
    memBar: document.getElementById("m-mem-bar"),
    proc: document.getElementById("m-proc"),
    uptime: document.getElementById("m-uptime"),
    updated: document.getElementById("m-updated"),
    state: document.getElementById("dash-state"),
    info: document.getElementById("dash-info"),
    toggle: document.getElementById("dash-toggle"),
  };

  /** 折线图：不用图表库，手绘一条 sparkline */
  function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 700;
    const h = 220;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 12, right: 34, bottom: 20, left: 6 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const yOf = (v) => pad.top + plotH * (1 - Math.min(100, Math.max(0, v)) / 100);

    // 网格与刻度
    ctx.strokeStyle = "#e8ebef";
    ctx.fillStyle = "#8b949e";
    ctx.font = "11px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach((v) => {
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(`${v}%`, pad.left + plotW + 6, y + 4);
    });

    if (history.length < 2) {
      ctx.fillStyle = "#8b949e";
      ctx.fillText("点击「开始采集」后开始绘制……", pad.left + 8, pad.top + plotH / 2);
      return;
    }

    const stepX = plotW / (HISTORY_MAX - 1);
    const newest = history[history.length - 1];

    // 面积填充
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, "rgba(47, 111, 237, 0.28)");
    grad.addColorStop(1, "rgba(47, 111, 237, 0.02)");
    ctx.beginPath();
    ctx.moveTo(pad.left, yOf(history[0]));
    history.forEach((v, i) => ctx.lineTo(pad.left + i * stepX, yOf(v)));
    ctx.lineTo(pad.left + (history.length - 1) * stepX, pad.top + plotH);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 折线：高负载转红，作为视觉预警
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = pad.left + i * stepX;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = newest > 80 ? "#d64545" : "#2f6fed";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // 当前值圆点
    const lastX = pad.left + (history.length - 1) * stepX;
    const lastY = yOf(newest);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  function renderMetrics(m) {
    history.push(m.cpu);
    if (history.length > HISTORY_MAX) history.shift();

    els.cpu.textContent = `${fmt(m.cpu)}%`;
    els.cpuBar.style.width = `${Math.min(100, m.cpu)}%`;
    els.cpuBar.className =
      "progress-bar " + (m.cpu > 80 ? "bg-danger" : m.cpu > 55 ? "bg-warning" : "bg-primary");

    els.mem.textContent = `${fmt(m.memPercent)}%`;
    els.memBar.style.width = `${Math.min(100, m.memPercent)}%`;
    els.memBar.className =
      "progress-bar " + (m.memPercent > 85 ? "bg-danger" : "bg-success");

    els.proc.textContent = String(m.processCount ?? "–");
    els.uptime.textContent = formatDuration(m.systemUptimeSec);
    els.updated.textContent = `更新于 ${new Date(m.ts).toLocaleTimeString()}`;

    drawChart();
  }

  // 一次 invoke 拿静态系统信息
  window.electronAPI.metrics.info().then((info) => {
    els.info.innerHTML = "";
    Object.entries(info).forEach(([key, value]) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.className = "text-body-secondary fw-normal";
      th.scope = "row";
      th.textContent = key;
      const td = document.createElement("td");
      td.className = "text-end";
      td.textContent = value;
      tr.append(th, td);
      els.info.appendChild(tr);
    });
  });

  // 主进程每秒推送过来的实时指标
  window.electronAPI.metrics.onUpdate(renderMetrics);

  const setRunning = (running) => {
    els.toggle.dataset.running = running ? "1" : "0";
    els.toggle.innerHTML = running
      ? '<i class="bi bi-stop-fill me-1"></i>停止采集'
      : '<i class="bi bi-play-fill me-1"></i>开始采集';
    els.toggle.className = running ? "btn btn-danger" : "btn btn-primary";
    els.state.textContent = running ? "采集中 · 1s" : "未开始";
    els.state.className = running ? "badge text-bg-success" : "badge text-bg-light";
  };

  els.toggle.addEventListener("click", async () => {
    if (els.toggle.dataset.running === "1") {
      await window.electronAPI.metrics.stop();
      setRunning(false);
      showToast("主进程已停止推送", "secondary", "仪表盘");
    } else {
      await window.electronAPI.metrics.start();
      setRunning(true);
      showToast("主进程开始每秒推送指标", "primary", "仪表盘");
    }
  });

  document.getElementById("dash-snapshot").addEventListener("click", async () => {
    const snapshot = await window.electronAPI.metrics.snapshot();
    renderMetrics(snapshot);
    showToast(`CPU ${fmt(snapshot.cpu)}% · 内存 ${fmt(snapshot.memPercent)}%`, "info", "快照");
  });

  setRunning(false);
  drawChart();
})();

/* ---------------------------------------------------------- 启动自检 */

// 一次性确认「本地化的框架资源」真的加载成功。
// 调 CSP 或资源路径时，这种检查最省事：失败会直接打到启动终端。
(function selfCheck() {
  const probe = document.createElement("div");
  probe.className = "d-none";
  document.body.appendChild(probe);
  const cssOk = getComputedStyle(probe).display === "none";
  probe.remove();

  const bsVersion = window.bootstrap?.Tooltip?.VERSION;
  const iconOk = Array.from(document.styleSheets).some((sheet) =>
    String(sheet.href || "").includes("bootstrap-icons")
  );

  const report = [
    `CSS ${cssOk ? "生效" : "未生效"}`,
    `JS ${bsVersion ? `v${bsVersion}` : "未加载"}`,
    `图标 ${iconOk ? "已加载" : "未加载"}`,
  ].join(" · ");

  if (cssOk && bsVersion && iconOk) {
    console.log(`[renderer] 框架自检通过 —— Bootstrap ${report}`);
  } else {
    console.error(`[renderer] 框架自检异常 —— ${report}（请检查 vendor 路径与 CSP）`);
  }

  // 顺带跑一次 invoke/handle 往返，确认 preload 与主进程的 IPC 通道是通的
  window.electronAPI.metrics
    .snapshot()
    .then((m) => {
      console.log(
        `[renderer] IPC 自检通过 —— CPU ${m.cpu.toFixed(1)}% · ` +
          `内存 ${m.memPercent.toFixed(1)}% · 应用进程数 ${m.processCount}`
      );
    })
    .catch((err) => {
      console.error("[renderer] IPC 自检失败 ——", err);
    });
})();
