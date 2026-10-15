# vendor/ —— 本地化的第三方 UI 框架

这个目录存放**第三方前端框架的发行版文件**，直接以静态资源形式被 `index.html` 引用。

## 为什么不走 CDN？

`index.html` 里的 CSP 是：

```
default-src 'self'; script-src 'self'; img-src 'self' data:
```

`'self'` 只允许加载本应用自己的文件，外部 CDN 会被浏览器直接拦掉。
而这个工程**没有打包器**（没有 Vite / Webpack），所以从 npm 包里把 `dist`
目录复制过来、用相对路径引用，是最省事又安全的做法：

- 离线可用，不依赖网络；
- 版本锁定在仓库里，换机器行为一致；
- 满足 CSP，不需要放开 `'unsafe-inline'` 或外部域名。

## 包含内容

| 目录 | 包 | 版本 | 文件 |
| --- | --- | --- | --- |
| `bootstrap/` | [bootstrap](https://www.npmjs.com/package/bootstrap) | 5.3.8 | `bootstrap.min.css`、`bootstrap.bundle.min.js`（含 Popper） |
| `bootstrap-icons/` | [bootstrap-icons](https://www.npmjs.com/package/bootstrap-icons) | 1.13.2 | `bootstrap-icons.min.css` + `fonts/` |

两份都是 MIT 许可。

## 为什么需要 `img-src 'self' data:`

Bootstrap 把复选框的勾选标记、下拉箭头、折叠面板箭头、滑块等图形内联成
`data:image/svg+xml` 写在 CSS 的 `background-image` 里。CSP 的 `img-src`
同样约束 CSS 背景图，所以不放行 `data:` 的话这些图标会“凭空消失”。

`data:` 只是内联图片数据，不能执行脚本，放行它是常见且低风险的做法。

## 更新方式

```bash
# 用 npm 拉包（本机 npm 可用）
npm pack bootstrap@5.3.8 bootstrap-icons@1.13.2

# 解包后把 dist 文件复制过来
tar -xzf bootstrap-5.3.8.tgz
cp package/dist/css/bootstrap.min.css       vendor/bootstrap/
cp package/dist/js/bootstrap.bundle.min.js vendor/bootstrap/

tar -xzf bootstrap-icons-1.13.2.tgz
cp package/font/bootstrap-icons.min.css    vendor/bootstrap-icons/
cp -r package/font/fonts                   vendor/bootstrap-icons/
```

复制后建议删掉 CSS / JS 末尾的 `sourceMappingURL` 注释——开发工具默认打开时
会去拉 sourcemap，文件不存在会在控制台刷一堆 404 噪音。
