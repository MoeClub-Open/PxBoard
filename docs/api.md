# API

本文对应当前 `0.0.1` 开发构建，插件接口版本 `1.0`，统一接口版本 `rpcVersion: 1.0`。管理后台、用户前台、原生客户端（XBClient）与节点服务（NodeRS）共用同一套 HTTP JSON-RPC 契约：

- 单次调用：`POST /rpc/v1/{service}/{method}`，请求体为 JSON 对象（无参数时可发 `{}`）。
- 批量调用：`POST /rpc/v1/$batch`，请求体为 `{"calls":[{"key":"...","service":"...","method":"...","input":{}}]}`（单批 1–32 项，只读过程并发执行，写过程顺序执行），返回 `{"data":{"<key>":{"status":200,"data":...}}}`。
- 接口清单：`GET /rpc/v1/schema.json`。

JSON 字段使用 camelCase，时间使用 UTC RFC 3339，流量上报使用字节，商品与账本金额使用百分之一单位的整数。单次调用成功响应为 `{"data":...}`，失败为 `{"error":{"code":"...","message":"..."}}`，HTTP 状态表达成功、认证、权限与处理失败，每个响应带 `X-Request-ID`。

除 `/rpc/v1/*` 外，对外仅保留第三方标准协议与二进制文件下载入口：

- 通用订阅下载：`GET /s/{token}`（或自定义公开路由）与 `GET /api/v1/extensions/subscriptions/s/{token}`。
- 第三方登录回调：`GET /api/v1/extensions/oauth/callback/{provider}`。
- 支付网关异步通知：`GET|POST /api/v1/extensions/payments/webhooks/{channelId}`。
- 登录态内联文件读取：`GET /files/{plugin}/{path...}`（例如工单图片 `/files/support/attachments/{id}`）。
- 核心与本地插件进程间的内部运行总线：`/api/v1/runtime/...`（仅限本机 `service` 运行令牌）。

浏览器使用 HttpOnly、SameSite 会话 Cookie（非携带 `Authorization` 头的浏览器写操作校验同源 `Origin`）。原生客户端与自动化使用 `Authorization: Bearer <token>`（登录令牌、客户端授权令牌或 `px_...` API 密钥）；服务器节点同步使用 `Authorization: Bearer <machineKey>`（仅限 `nodes/server.*`）。

## 核心接口

订阅插件提供完整模板管理和预览接口，见[订阅模板](../../PxBoard-Plugins/docs/subscription-templates.md)。模板管理需要管理员；用户导出仍使用原订阅地址，按客户端或显式格式选择配置，并执行相同的验证、浏览器隐藏和客户端绑定检查。

下表过程均位于 `core` 服务（`POST /rpc/v1/core/{method}`）。健康检查、初始化、公开站点信息、登录、密码找回与客户端授权创建/轮询可在未登录时调用；其余过程按当前身份校验。用户、系统设置、插件安装、插件源和后台任务管理需要管理员。

| 领域 | 过程名（`service = core`） |
| --- | --- |
| 初始化 / 公开信息 | `setup.get`，`setup.init`，`site.get`，`onboarding.complete` |
| 登录与会话 | `auth.challenge`，`auth.login`，`auth.logout`，`auth.externalComplete`，`account.me` |
| 客户端与浏览器衔接 | `auth.authorizeCreate`，`auth.authorizeStatus`，`auth.authorizeApprove`，`auth.authorizeExchange`，`auth.browserLink`，`auth.browserExchange` |
| 密码 | `account.changePassword`，`auth.resetRequest`，`auth.resetPassword` |
| API 密钥 | `tokens.list`，`tokens.create`，`tokens.revoke` |
| 用户 | `users.list`，`users.options`，`users.create`，`users.update` |
| 插件 | `plugins.list`，`plugins.catalog`，`plugins.install`，`plugins.action`，`plugins.remove` |
| 插件源 | `sources.list`，`sources.create`，`sources.update`，`sources.remove` |
| 状态与运维 | `health`，`overview.get`，`settings.get`，`settings.update`，`activity.list`，`jobs.list`，`jobs.retry` |
| 使用方式 | `mode.get` 查询安装状态，`mode.apply` 安装所选模式并切换 |

安装插件输入为 `{"id":"nodes","sourceId":"源记录ID"}`，`plugins.action` 支持 `action: "enable"|"disable"|"restart"|"remove"`。`auth.login` 成功时除为同源浏览器写入会话 Cookie 外，同时在响应体返回 `{id,email,name,role,token,expiresAt}` 供原生客户端直接使用 Bearer 会话。

`settings.get` / `settings.update` 管理工作空间标识 `name` 与公开地址 `publicUrl`，读取还返回当前 `mode`。这里的 `name` 作为品牌未配置时的后备名称保留，站点品牌统一通过 `branding` 配置；核心设置页不重复提供品牌入口。模式必须经 `mode.apply` 安装流程切换，不能通过修改设置跳过。

### 公开初始化状态

`core/setup.get` 返回：

| 字段 | 含义 |
| --- | --- |
| `initialized` | 是否已经创建管理员 |
| `name` | 核心工作空间后备名称；品牌展示另读 `branding/public.get` |
| `mode`、`requestedMode` | 当前使用方式及待安装的目标方式 |
| `needsModeSetup` | 模式安装是否尚未完成 |
| `extensions` | 已启用且没有运行错误的插件 ID 数组，用于判断公开功能是否可用 |
| `registration` | 当前可用的公开注册表单数组，包含 `key/title/procedure/fields` 及可选 `modes/query/capability` |
| `passwordReset` | 当前是否有已启用的插件提供密码找回能力 |

`extensions` 表示插件可用，不等于其中每个子功能都开启。注册表单按声明中的 `modes` 与运行能力筛选；返回的 `key` 带插件前缀，`procedure` 为完整 `<pluginId>/<method>` RPC 目标（如 `registration/register`）。OAuth 服务列表单独调用 `oauth/providers.list`。

### 插件页面与通用资源

`core/plugins.list` 返回插件记录及其 `pages` 页面声明。普通用户的页面列表按角色与运行能力过滤，不返回管理员权限清单、产物地址和运行错误；管理员可读取完整声明。每个页面使用通用 `Page` 结构：

| 字段 | 含义 |
| --- | --- |
| `id`、`title`、`icon`、`group` | 页面标识、标题、图标与导航分组 |
| `roles` | 允许访问的角色，例如 `["admin","member"]` |
| `surface` | 可选：`admin` 放在后台，`portal` 放在用户前台，省略则两处均可展示 |
| `capability` | 可选的运行能力名，例如 `portal.status`，用于按插件设置开关页面 |

调用 `{pluginId}/ui.get`（输入 `{"pageId":"..."}`）获得页面内容 `View`：`title`、可选 `notice/metrics` 和 `resources` 数组。页面展示位置由 `surface` 决定；核心仍按角色及能力检查页面访问，业务接口必须另行检查权限和开关。

每个资源提供 `key/title/endpoint/columns`，按需包含 `fields/createLabel/editable/deletable/actions/pollIntervalSeconds/empty`。普通资源映射为 `{pluginId}/{resource}.list`、`{resource}.create`、`{resource}.update`（含 `id`）、`{resource}.delete`（含 `id`）与记录操作 `{resource}.{action}`（含 `id`）；是否提供这些操作由资源声明与实际插件处理器决定。`Action.endpoint` 与 `Field.optionsEndpoint` 可直接指定跨服务 RPC 目标（如 `payments/checkout`、`nodes/groups.options`、`core/users.options`）。

`singleton=true` 表示单例配置：读取仍返回一条记录的数组，编辑直接调用 `{resource}.update`，不附加记录 ID。品牌、注册、节点设置和推广设置都使用各插件自己的 `settings` 资源。

资源可声明 `filters`，字段值转成同名查询参数，时间范围 `daterange` 转成 `<key>From` / `<key>To`。分页、搜索和筛选由插件接口统一处理。`settings: {title,endpoint,fields}` 在列表工具栏提供配置弹窗，使用 `GET` 读取配置对象、`PATCH` 保存；不增加设置选项卡。


字段可用 `optionsEndpoint` 读取选择项，通过点路径表达嵌套对象，例如 `certConfig.mode`；`when` 声明条件字段。资源 `endpoint` 通常相对当前插件，跨服务目标直接写 `<pluginId>/<method>`，目标仍独立校验权限。结构和示例见 [插件文档](plugins.md#声明式页面)。

能力由核心内部读取插件 `GET /_capabilities`，响应为 `{"data":{"能力名":true}}`。这些 `/_...` 路径禁止从公开扩展入口调用，不能当作访客查询接口。插件停用后，扩展入口返回不可用，已有业务数据保留。

## 官方业务接口

以下过程位于 `POST /rpc/v1/{pluginId}/{method}`。未特别说明的过程需要登录，写配置及管理操作需要管理员；公开过程在插件 `manifest.json` 的 `publicProcedures` 中显式声明。

| 插件 | 主要 RPC 过程 |
| --- | --- |
| `branding` | 公开 `public.get`；管理员 `settings.list`、`settings.update` |
| `registration` | 公开 `register`；管理员 `settings.list`、`settings.update` |
| `nodes` | `nodes.*`、`machines.*`、`groups.*`、`status.list`、`status.display`、`settings.*`；NodeRS 机器同步 `server.bootstrap`、`server.pull`、`server.traffic`、`server.telemetry`、`server.ackConfig`；节点代理 `agent.sync` |
| `access` | `accounts.list`、`accounts.create`、`accounts.update`、`accounts.reset`、`accounts.suspend`、`preferences.get`、`preferences.update` |
| `subscriptions` | `client.profile`（原生客户端结构化配置与权益快照）、`links.*`、`templates.*`、`settings.public`；外部订阅下载 `GET /s/{token}` |
| `redeem` | 管理员 `codes.*`；用户 `redeem.create`、`claims.list` |
| `commerce` | 公开 `public.currency`；`plans.*`、`coupons.*`、`orders.list`、`orders.quote`、`orders.create`、`orders.pay`、`orders.cancel`、`wallet.get`、`ledger.*` |
| `affiliate` | `summary.get`、`commissions.list`、`withdrawals.list`、`withdrawals.create`、`withdrawals.transfer`、`withdrawals.cancel`；管理员 `profiles.*`、`settings.*` |
| `payments` | `channels.*`、`checkout`、`transactions.*`；外部网关回调 `GET|POST /api/v1/extensions/payments/webhooks/{channelId}` |
| `audit` | `rules.*`、`logs.list` |
| `support` | `tickets.list`、`tickets.create`、`tickets.reply`、`tickets.close`、`attachments.create`、`attachments.get`、`announcements.*`、`articles.*` |
| `notifications` | `mail.*`、`templates.*`、`campaigns.*`、`notifications.*` |
| `oauth` | 公开 `providers.list`、`authorize`、`registration`、`completeRegistration`；用户 `bindings.list`、`bindings.delete`、`completeBinding`；外部回调 `GET /api/v1/extensions/oauth/callback/{provider}` |

用户前台与原生客户端读取本人记录时传入 `{"mine":true}`（或 `{"scope":"mine"}`），管理员也只获取自己的记录；省略该参数时管理员可在后台管理全部记录。金额显示设置由 `commerce/public.currency` 与 `commerce/currency.*` 提供；它只改变显示，不进行汇率换算或更改支付渠道结算币种。`commerce/wallet.get` 直接返回当前账户可用余额与币种符号。

当前配置与业务列表返回完整集合，界面进行分页与筛选；操作记录和后台任务各返回最近 200 条。高数据量外部集成应增加面向所需资源的服务端分页，不能把界面分页误解为数据库分页。

### 品牌、注册与兑换码

`branding/public.get` 只返回 `name/logoUrl/faviconUrl`。管理员以 `branding/settings.update` 修改这三个字段，图片支持 HTTPS 地址或本站绝对路径。品牌与商业、注册和推广配置分别保存。

`registration/register` 接收 `email/password/name?/referral?`；成功返回新用户 `id` 与提示，不自动发放访问权益。`registration/settings.update` 接收 `{"enabled":false}` 关闭全局注册，不随模式切换改变。停用注册插件同样关闭普通新账号；OAuth 新账号还需全局注册开放和对应提供方允许注册，已有绑定登录与账户绑定不受影响。

`redeem/redeem.create` 需要登录，接收 `{"code":"兑换码","requestId":"本次提交编号"}`。完成返回 `status=redeemed`；已登记但暂未发放时返回 HTTP `202`、`status=pending`，重试保留原 `requestId`，不能更换编号当作新兑换。每账号限兑一次的码可以省略此编号，允许同账号多次兑换时必须提供。`redeem/claims.list` 对普通用户仅返回本人记录，管理员传入 `{"mine":true}` 查看本人记录。

兑换码管理使用 `redeem/codes.list`、`redeem/codes.create`、`redeem/codes.update` 与 `redeem/codes.delete`；已有用量的码不能删除，可停用。访问权益、流量及期限奖励不依赖商业插件，余额奖励需要商业钱包。旧 `sharing` 插件及商业插件内的注册、充值卡、推广和提现接口不再提供；旧数据通过一次性升级工具搬移，见 [升级说明](deployment.md#拆分旧插件数据)。

## 模式安装

商业模式的管理员可通过 `core/settings.get` 与 `core/settings.update` 读取或设置 `adminPath`，默认值为 `/admin`。修改后前端应跳转到新路径；自用模式固定使用默认入口。普通用户的 `core/account.me` 响应不包含此字段，管理员响应包含当前生效的 `adminPath`。公开 `core/setup.get` 不返回后台路径；可用 `entry` 参数检查当前请求路径是否为后台入口，结果在 `adminEntry` 字段中。

管理员向 `core/mode.apply` 提交 `{"mode":"business","sourceUrl":"https://plugins.example.com/index.json"}`；已注册源也可用 `sourceId`，省略源时使用当前或默认源。返回 HTTP 202，后台解析组合、安装依赖并启用。`core/mode.get` 返回 `mode`（当前生效）、`requestedMode`、`phase`、`plugins`、`sourceId`、`sourceUrl`、`error` 与 `updatedAt`。`phase` 为 `needs_install`、`installing`、`ready` 或 `failed`，插件状态为 `pending`、`installing`、`ready` 或 `failed`。失败可再次提交同一请求；功能全部就绪后才更新当前模式。

模式值为 `personal` 和 `business`。旧公益 / 分享模式在升级时自动归入自用，保留已安装插件和数据。模式决定默认安装组合与使用入口，切换不自动卸载额外插件或清空数据。推广和 OAuth 均不随任何官方模式默认安装。各功能通过其插件启停或独立设置控制，默认组合见 [使用模式](modes.md)。

## 用户前台接口

套餐使用需登录的 `commerce/plans.list`（传入 `{"scope":"mine"}`），按当前用户的购买与续费资格返回，匿名目录接口已移除。每个 `periods` 项包含标识、价格、类型和期限；期限单位 `durationUnit` 为 `day`、`month` 或 `permanent`，按月续费按日历月计算。`quotaGiB` 为周期额度，`unlimited` 明确决定是否不限流量；额度为零不会自动变成不限流量。

`commerce/orders.create` 创建订单，购买套餐时通过 `planId` 和 `periodId` 指定套餐与周期；订单保存选中周期的价格及权益快照。`commerce/orders.{pay,cancel,confirm,refund}` 传入 `id` 操作订单，其中人工确认和退回余额需要管理员。创建订单和提现申请可携带 `requestId`，同一用户重试相同内容时返回原记录，用同一标识改动内容返回冲突。客户端在用户重新确认另一笔操作时生成新标识，网络失败重试保留原标识。支付跳转或回跳参数不代表到账，须查询服务端订单状态。

推广使用 `affiliate/summary.get`，返回当前账户的推广链接、邀请人数、可用、冻结和累计佣金等信息。`affiliate/withdrawals.create` 接收 `method=wallet` 时由本人直接转入余额，无需申请审批；`method=cash` 时创建现金提现申请。余额转入最低 1 分，现金提现最低 1 元。相同 `requestId` 重试保留原记录与入账标识。本人可使用 `affiliate/withdrawals.transfer` 完成旧的待处理余额转入；`affiliate/withdrawals.cancel` 可撤回本人尚未处理的现金申请或旧余额转入，新余额转入直接进入处理中，不可撤回。管理员使用 `affiliate/withdrawals.{approve,reject,paid}` 审批现金提现、拒绝未处理记录或登记现金打款。现金打款由管理员在外部完成，不会通过此接口自动转账。推广设置使用 `affiliate/settings.list` 与 `affiliate/settings.update`；个人规则使用 `affiliate/profiles.{list,create,update}`。停用该插件不影响商业订单与钱包。

`nodes/status.list` 以服务器为单位返回状态：对普通用户只返回包含其有权使用节点的启用服务器；管理员可查看全部服务器与真实上报的 CPU、内存、磁盘、交换空间和去重在线账户数。管理员前台预览传入 `{"scope":"mine"}`。最近 120 秒心跳判为在线，缺少心跳判为未接入或离线；离线或缺少负载上报时相应字段省略，不以零值假定空闲。此接口不探测公网延迟或线路可达性。

管理员以 `nodes/settings.update` 提交 `{"userStatusEnabled":false}`，关闭用户服务器状态入口和用户状态接口；管理员监控、NodeRS 接入、流量上报及订阅继续运行。节点记录的 `enabled` 控制服务启用，`visible` 控制订阅及用户服务器可见性判断，两者独立。共用父节点的记录通过 `parentId` 保留关系，子节点可使用父节点服务而不重复启动监听。

管理员可同时设置 `userStatusFields` 字符串数组，选择用户状态页的展示项；用户通过 `nodes/status.display` 读取所选字段，未选择的数据不会出现在用户状态接口中。订阅浏览器伪装由管理员通过 `subscriptions/settings.list` 与 `subscriptions/settings.update` 配置 `hideFromBrowsers` 和按行分隔的 `browserAgents`，根据 User-Agent 匹配；该标识可以伪造。

OAuth 授权、完成注册、绑定与人工搬入的准确请求结构见 [第三方登录文档](../../PxBoard-Plugins/docs/oauth.md#接口)。普通用户不能调用管理员的绑定导入或提供方配置接口，最终会话由核心 `core/auth.externalComplete` 建立。

## NodeRS 与迁移

NodeRS 使用统一的 `POST /rpc/v1/nodes/server.*` 过程，认证头为 `Authorization: Bearer <machineKey>`（兼容裸机器密钥或 `pxm_<machineId>.<key>` 格式，核心将其严格限制在 `nodes/server.*` 范围内）：

| 过程（`service = nodes`） | 用途 |
| --- | --- |
| `server.bootstrap` | 校验服务器凭据，返回 `machineId`、同步周期与能力列表 |
| `server.pull` | 单次原子拉取该机器全部节点配置、授权用户列表、待应用的面板迁移任务及 `revision` 摘要；传入 `knownRevision` 命中时返回 `{"unchanged":true,"revision":"..."}` |
| `server.traffic` | 按 `batchId` 去重提交单节点或多节点流量批次（字节） |
| `server.telemetry` | 合并上报机器主机指标（CPU/内存/磁盘/Swap）与各节点在线账户 IP |
| `server.ackConfig` | 回报面板迁移配置版本与 `applied/failed` 结果 |

管理员通过 `nodes/machines.configuration` 下发目标面板配置，正文为 `{id,panelType,api,machineId,key}`；`panelType` 为 `pxboard` 或 `xboard`。通过 `nodes/machine-configurations.list` 查询结果，通过 `nodes/machine-configurations.retry` 重新下发失败任务。管理列表不返回目标密钥。完整结构和回退规则见 [NodeRS 配置管理](../../PxBoard-Plugins/docs/noders-management.md) 与 NodeRS 的 `docs/zh/pxboard.md`。

导入插件为 `import-sspanel`、`import-v2board`、`import-xboard`，在各自服务下通过 `jobs.list`、`jobs.create` 查看或创建任务，通过 `jobs.preview`、`jobs.apply`、`jobs.report`（均含 `id`）预览、提交或读取报告。默认转换用户、套餐、余额与订阅，可选节点和推广关系及佣金；源用户可用佣金非零但未选择推广导入时会阻断。核心导入运行接口要求显式 `import:*` 权限，暂存完整性、用户凭据、冲突检查和最终写入在提交事务中验证，原始数据保留在插件状态目录和归档集合。

源面板的原邀请码和兑换码只归档；第三方客户端与 OAuth 数据不经通用导入插件转换，OAuth 绑定使用独立人工搬入工具。使用流程、升级工具与字段范围见 [迁移文档](../../PxBoard-Plugins/docs/migration.md)。

## 人机验证

`core/auth.challenge` 返回公开服务类型、站点密钥和受保护场景；没有启用验证插件时返回 `enabled=false`。受保护的 `core/auth.login`、`core/auth.resetRequest`、插件声明的注册表单以及声明 `auth:login` 的插件的 `authorize` 过程接受 `challengeToken`。验证失败返回 `challenge_required`；服务故障返回 `challenge_unavailable`。第三方登录在密码登录或账户注册任一项受保护时验证；账号绑定不验证。每次提交需要使用新的服务商凭证，动态验证码补交也需重新验证。验证插件停用后，这些接口恢复原行为。

订阅验证由订阅插件独立控制，默认关闭。启用时先配置人机验证插件；用户使用 `subscriptions/links.verify` 提交 `id` 与 `challengeToken`，验证成功后该链接可供客户端持续拉取。重置链接或重新开启验证需要再次验证。管理员通过 `subscriptions/verification.settings.list` 与 `subscriptions/verification.settings.update` 管理开关。

## 工单附件

工单支持 Markdown 文本；用户通过 `support/attachments.create` 上传单张 PNG、JPEG、GIF 或 WebP 图片，JSON 的 `data` 字段是图片内容的 Base64，大小上限 2 MiB。响应包含受权限保护的内联地址 `/files/support/attachments/{id}`（也可调用 `support/attachments.get` 获取），可插入工单内容。访问图片需要登录，只有上传者、工单发起人或管理员可读取。站内图片引用在提交工单或回复时校验权限。已有旧文本对话保留，新消息按条存储。插件状态目录与数据库须一起备份。

插件运行时 `POST /api/v1/runtime/users/search` 需要 `users:read`，接收 `search/status/role/offset/limit`，返回标准 `items/total` 分页结构；每页最多 1000 人，按用户 ID 固定排序，只返回用户公开管理信息，不返回密码或登录凭据。原按 ID/邮箱查询接口继续用于明确用户查找。

### 公开站点与初始化完成

`core/site.get` 返回公开展示快照；`GET /robots.txt` 与 `GET /sitemap.xml` 在站点根路径提供爬虫配置。字段和插件接口见[公开首页与 SEO](public-site.md)。

首次 `core/setup.init` 额外接收 `siteName`、`publicUrl`。管理员与基础设置在同一事务创建。`core/account.me` 对管理员返回 `needsOnboarding`，供登录后继续 `/setup`；公开初始化接口不返回管理地址。

`core/onboarding.complete` 需要管理员，接收 `name/publicUrl/adminPath`，所选模式必须已经安装完成，后台路径必须有效且不与公开路由冲突。完成标记、公开地址和管理入口同时保存。新站未完成时阻止普通用户注册，既有站点默认完成，不因升级要求重跑初始化。
