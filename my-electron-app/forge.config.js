const path = require('node:path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  // 打包输出目录。
  // 注意：只有这个顶层 outDir 生效；写在 packagerConfig.out 里会被 forge 覆盖成 out/（无效）。
  outDir: './build',
  packagerConfig: {
    name: 'MyElectronApp',
    overwrite: true,
    asar: true,
    // 应用图标（win32 会取 icon.ico，linux 会取 icon.png）
    icon: path.join(__dirname, 'assets', 'icon'),
    // 不随应用分发的内容（相对应用根目录、posix 分隔符、带前导斜杠）。
    // 注意：此数组会整体覆盖 forge 默认的 ignore，故 out/ 需自行列出，
    // 否则历史遗留的 out/ 目录会被递归打进应用。
    ignore: [
      /^\/out($|\/)/,          // 历史输出目录（forge 旧默认）
      /^\/build($|\/)/,        // 当前输出目录（保险起见，packager 也会按 out 参数自动排除）
      /^\/\.history($|\/)/,    // VSCode 本地历史：旧代码快照，体积大且含过期代码
      /^\/\.vscode($|\/)/,     // 编辑器调试配置
      /^\/\.gitignore$/,
      /^\/forge\.config\.js$/, // 打包配置仅构建期需要
    ]
  },
  // rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'MyElectronApp',
        authors: 'yangyating',
        description: 'Electron 多页面演示应用',
        title: 'MyElectronApp',
        // 安装器窗口图标（标题栏 + 安装程序文件图标）
        setupIcon: path.join(__dirname, 'assets', 'icon.ico'),
        // 安装时闪屏动画（Squirrel Setup 窗口背景 GIF）
        loadingGif: path.join(__dirname, 'assets', 'install-spinner.gif'),
        // 控制面板/添加删除程序里显示的图标（离线可用）
        iconUrl: 'file:///' + path.join(__dirname, 'assets', 'icon.ico').replace(/\\/g, '/'),
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        name: 'MyElectronApp',
        authors: 'yangyating',
        description: 'ElectronApp'
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        name: 'MyElectronApp',
        authors: 'yangyating',
        description: 'ElectronApp'
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        name: 'MyElectronApp',
        authors: 'yangyating',
        description: 'ElectronApp'
      }
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
