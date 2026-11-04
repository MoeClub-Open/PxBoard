# 外观与颜色主题

登录页、初始化、首页、用户前台与管理后台共用外观设置。点击右上角“外观”即可调整；手机上显示衣服图标。

主题色提供蓝色、紫色、绿色、青色、橙色和玫红，默认使用蓝色。显示模式支持浅色、深色和自动；自动模式跟随系统的深浅色变化，默认开启。

选择后立即生效，并保存到当前浏览器。刷新、切换页面或打开同站点的其他标签页时，继续使用相同选择。主题偏好分别保存在 `px-theme` 与 `px-accent`，不需要登录账户。

导航、按钮、表格、表单、弹窗和首页插图共用当前主题色。状态提示继续使用成功、警告与错误各自的颜色；站点名称和自定义 Logo 来自品牌设置。

## 插件界面

通过标准资源页面与字段声明生成的插件界面，自动使用全站 Ant Design 配置。自定义 HTML 展示可使用下列公共 CSS 变量：

| 用途 | 变量 |
| --- | --- |
| 页面、内容、浮层背景 | `--px-bg`、`--px-surface`、`--px-elevated` |
| 次级填充、边框 | `--px-fill`、`--px-border`、`--px-border-soft` |
| 正文、次级正文、辅助文字 | `--px-text`、`--px-secondary`、`--px-muted` |
| 主色、悬停、浅底、边框、强调文字 | `--px-primary`、`--px-primary-hover`、`--px-primary-soft`、`--px-primary-border`、`--px-primary-text` |
| 成功与错误文字 | `--px-success`、`--px-error` |
| 字体、阴影 | `--px-font`、`--px-shadow`、`--px-shadow-sm` |

深色模式的强调文字使用独立的高对比颜色。链接和选中项应使用 `--px-primary-text`，实色按钮背景使用 `--px-primary`，避免把同一个色值同时用于深色背景上的文字与按钮填充。

根元素的 `data-theme` 表示实际显示模式（`light` 或 `dark`），`data-accent` 表示主题色标识（`blue`、`violet`、`green`、`cyan`、`amber`、`rose`）。这些属性和变量也适用于渲染到页面外层的弹窗。
