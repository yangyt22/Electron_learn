// ==================== 登录状态管理 ====================
let isLoggedIn = false;

const viewLogin = document.getElementById('view-login');
const viewApp = document.getElementById('view-app');
const avatarImg = document.getElementById('avatar-img');
const avatarPlaceholder = document.getElementById('avatar-placeholder');
const avatarLabel = document.getElementById('avatar-label');

// 切换到「未登录」状态：主区域显示登录表单，头像为占位图，菜单仅剩退出客户端
function showLoginState() {
  isLoggedIn = false;
  viewApp.style.display = 'none';
  viewApp.classList.remove('active');
  viewLogin.classList.add('active');
  viewLogin.style.display = 'flex';

  avatarImg.style.display = 'none';
  avatarPlaceholder.style.display = 'block';
  avatarLabel.textContent = '未登录';

  // 隐藏需要登录的菜单项
  document.querySelectorAll('.menu-popup .auth-only').forEach((el) => {
    el.style.display = 'none';
  });

  // 重置登录表单
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

// 切换到「已登录」状态：主区域显示工作台，头像为真实图片，菜单全部可见
function showLoggedInState() {
  isLoggedIn = true;
  viewLogin.classList.remove('active');
  viewLogin.style.display = 'none';
  viewApp.style.display = 'flex';
  viewApp.classList.add('active'); // 必须加 active，保证纵向 flex 布局

  avatarImg.style.display = 'block';
  avatarPlaceholder.style.display = 'none';
  avatarLabel.style.display = 'none';

  // 显示需要登录的菜单项
  document.querySelectorAll('.menu-popup .auth-only').forEach((el) => {
    el.style.display = el.tagName === 'LI' && el.classList.contains('divider') ? 'block' : 'flex';
  });

  // 默认回到工作台页面
  switchPage('workbench', document.querySelector('.nav-item[data-page="workbench"]'));
}

// ==================== 登录逻辑 ====================
const btnLogin = document.getElementById('btn-login');
const inputUsername = document.getElementById('login-username');
const inputPassword = document.getElementById('login-password');

function doLogin() {
  const username = inputUsername.value.trim();
  if (!username) {
    inputUsername.focus();
    inputUsername.style.borderColor = '#e81123';
    setTimeout(() => (inputUsername.style.borderColor = ''), 1500);
    return;
  }
  if (!inputPassword.value) {
    inputPassword.focus();
    inputPassword.style.borderColor = '#e81123';
    setTimeout(() => (inputPassword.style.borderColor = ''), 1500);
    return;
  }
  // TODO: 此处接入真实登录接口；当前为本地演示，直接进入主界面
  showLoggedInState();
}

btnLogin.addEventListener('click', doLogin);

// 回车在表单内依次跳到下一个输入框，最后一项回车直接登录
inputUsername.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    inputPassword.focus();
  }
});

inputPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doLogin();
  }
});

// 密码显示/隐藏
const btnEye = document.getElementById('btn-eye');
const eyeOpen = document.getElementById('eye-open');
const eyeClosed = document.getElementById('eye-closed');

btnEye.addEventListener('click', () => {
  const isPwd = inputPassword.type === 'password';
  inputPassword.type = isPwd ? 'text' : 'password';
  eyeOpen.style.display = isPwd ? 'none' : 'block';
  eyeClosed.style.display = isPwd ? 'block' : 'none';
});

// ==================== 窗口控制（最小化 / 最大化 / 关闭） ====================
document.getElementById('btn-min').addEventListener('click', () => window.windowControls.minimize());
document.getElementById('btn-max').addEventListener('click', () => window.windowControls.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.windowControls.close());

// 最大化/还原图标切换
const iconMax = document.getElementById('icon-max');
const iconRestore = document.getElementById('icon-restore');
window.windowControls.onMaximizedChange((isMaximized) => {
  iconMax.style.display = isMaximized ? 'none' : 'block';
  iconRestore.style.display = isMaximized ? 'block' : 'none';
});

// ==================== 页面标题与页头配置 ====================
const pageTitle = document.getElementById('page-title');
const headerTools = document.getElementById('header-tools');

const PAGE_META = {
  workbench: { title: '欢迎使用工作台', tools: true },
  settings:  { title: '', tools: false },
  profile:   { title: '', tools: false }
};

// ==================== 左侧导航切换（仅登录后生效） ====================
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach((item) => {
  item.addEventListener('click', () => {
    if (!isLoggedIn) return; // 未登录时不响应导航
    switchPage(item.dataset.page, item);
  });
});

function switchPage(pageKey, navEl) {
  // 导航高亮
  navItems.forEach((n) => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  // 页面切换
  document.querySelectorAll('#view-app .page').forEach((p) => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageKey);
  if (page) page.classList.add('active');

  // 页头：工作台显示标题+工具栏；设置/个人信息整条页头隐藏（白底页面占满）
  const meta = PAGE_META[pageKey] || { title: '', tools: false };
  const mainHeader = document.getElementById('main-header');
  if (meta.title) {
    mainHeader.style.display = 'flex';
    pageTitle.textContent = meta.title;
    headerTools.style.display = 'flex';
  } else {
    mainHeader.style.display = 'none';
  }
}

// ==================== 底部菜单弹出 ====================
const menuBtn = document.getElementById('btn-menu');
const menuPopup = document.getElementById('menu-popup');

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuPopup.classList.toggle('show');
});

// 点击其他区域关闭菜单
document.addEventListener('click', (e) => {
  if (menuPopup.classList.contains('show') && !menuPopup.contains(e.target)) {
    menuPopup.classList.remove('show');
  }
});

// ==================== 菜单项动作 ====================
menuPopup.querySelectorAll('li[data-action]').forEach((li) => {
  li.addEventListener('click', () => {
    const action = li.dataset.action;
    menuPopup.classList.remove('show');

    switch (action) {
      case 'profile': // 个人信息
        switchPage('profile', null);
        break;
      case 'logout': // 注销登录：弹确认框
        document.getElementById('logout-modal').style.display = 'flex';
        break;
      case 'exit': // 退出客户端
        window.windowControls.close();
        break;
      // permission / terminal 待后续实现
    }
  });
});

// ==================== 注销确认弹窗 ====================
const logoutModal = document.getElementById('logout-modal');

document.getElementById('btn-modal-close').addEventListener('click', () => logoutModal.style.display = 'none');
document.getElementById('btn-logout-cancel').addEventListener('click', () => logoutModal.style.display = 'none');
document.getElementById('btn-logout-ok').addEventListener('click', () => {
  logoutModal.style.display = 'none';
  // TODO: 此处接入真实注销接口（清除 token/会话）
  showLoginState();
});

// ==================== 右下角工具条折叠 ====================
const diagBar = document.getElementById('diag-bar');
const btnDiagToggle = document.getElementById('btn-diag-toggle');
const diagIconExpand = document.getElementById('diag-icon-expand');
const diagIconCollapse = document.getElementById('diag-icon-collapse');

btnDiagToggle.addEventListener('click', () => {
  const collapsed = diagBar.classList.toggle('collapsed');
  diagIconExpand.style.display = collapsed ? 'none' : 'block';
  diagIconCollapse.style.display = collapsed ? 'block' : 'none';
});

// ==================== 初始化：未登录状态 ====================
showLoginState();
