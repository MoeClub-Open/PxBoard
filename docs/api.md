# API

本文对应核心 `0.4.0`，插件接口版本 `1.0`。基础路径为 `/api/v1`，业务插件路径为 `/api/v1/extensions/{pluginId}`。JSON 字段使用 camelCase，时间使用 UTC RFC 3339，流量上报使用字节，商品与账本金额使用整数分。

JSON 成功响应为 `{"data":...}`，失败为 `{"error":{"code":"...","message":"..."}}`。HTTP 状态表达成功、认证、权限与处理失败，请勿以 HTTP 200 携带业务错误。订阅导出等下载接口返回对应文件格式。每个响应带 `X-Request-ID`，核心 OpenAPI 入口为 `/api/v1/openapi.json`。

浏览器使用 HttpOnly、SameSite 会话 Cookie。自动化使用 `Authorization: Bearer px_...`，在“我的账户”创建，支持只读或读写权限和有效期。密钥继承账户的角色与数据范围；只读密钥不能执行写请求。插件运行令牌是核心注入的独立临时令牌，不能当作普通用户 API 密钥使用。

## 核心接口

下表路径均相对 `/api/v1`。健康检查、初始化、登录、密码找回和 OpenAPI 文档可在未登录时调用；其余接口按当前身份校验。用户、系统设置、插件安装、插件源和后台任务管理需要管理员。

| 资源 | 主要请求 |
| --- | --- |
| 初始化 / 身份 | `GET/POST /setup`，`POST /auth/login`，`POST /auth/logout`，`GET /me` |
| 第三方登录完成 | `POST /auth/external/complete`，消费插件签发的一次性登录凭证，必要时验证动态验证码后设置核心会话 |
| 密码 | `POST /me/password`，`POST /auth/reset-request`，`POST /auth/reset` |
| API 密钥 | `GET/POST /tokens`，`DELETE /tokens/{id}` |
| 用户 | `GET/POST /users`，`PATCH /users/{id}` |
| 插件 | `GET /plugins`，`GET /plugins/catalog`，`POST /plugins/install`，`POST /plugins/{id}/{action}`，`DELETE /plugins/{id}` |
| 插件源 | `GET/POST /sources`，`PATCH/DELETE /sources/{id}` |
| 状态与运维 | `GET /health`，`GET /overview`，`GET/PATCH /settings`，`GET /activity`，`GET /jobs`，`POST /jobs/{id}/retry` |
| 使用方式 | `GET /mode` 查询安装状态，`POST /mode` 安装所选模式并切换 |

安装插件正文为 `{"id":"nodes","sourceId":"源记录ID"}`，插件动作支持 `enable/disable/restart`。添加源正文为 `{"name":"可选名称","url":"https://.../index.json","publicKey":"可选的Base64公钥"}`。

`GET/PATCH /settings` 管理工作空间标识 `name` 与公开地址 `publicUrl`，读取还返回当前 `mode`。这里的 `name` 作为品牌未配置时的后备名称保留，站点品牌统一通过 `branding` 配置；核心设置页不重复提供品牌入口。模式必须经 `/mode` 安装流程切换，不能通过修改设置跳过。

### 公开初始化状态

`GET /setup` 返回：

| 字段 | 含义 |
| --- | --- |
| `initialized` | 是否已经创建管理员 |
| `name` | 核心工作空间后备名称；品牌展示另读 `branding/public` |
| `mode`、`requestedMode` | 当前使用方式及待安装的目标方式 |
| `needsModeSetup` | 模式安装是否尚未完成 |
| `extensions` | 已启用且没有运行错误的插件 ID 数组，用于判断公开功能是否可用 |
| `registration` | 当前可用的公开注册表单数组，包含 `key/title/path/fields` 及可选 `modes/query/capability` |
| `passwordReset` | 当前是否有已启用的插件提供密码找回能力 |

`extensions` 表示插件可用，不等于其中每个子功能都开启。注册表单按声明中的 `modes` 与运行能力筛选；返回的 `key` 带插件前缀，`path` 已转换为完整 `/api/v1/extensions/{pluginId}/...` 路径。官方 `registration` 表单不按模式筛选，只由其全局注册开关决定是否返回。OAuth 服务列表单独使用 `/extensions/oauth/providers`。

### 插件页面与通用资源

`GET /plugins` 返回插件记录及其 `pages` 页面声明。普通用户的页面列表按角色与运行能力过滤，不返回管理员权限清单、产物地址和运行错误；管理员可读取完整声明。每个页面使用通用 `Page` 结构：

| 字段 | 含义 |
| --- | --- |
| `id`、`title`、`icon`、`group` | 页面标识、标题、图标与导航分组 |
| `roles` | 允许访问的角色，例如 `["admin","member"]` |
| `surface` | 可选：`admin` 放在后台，`portal` 放在用户前台，省略则两处均可展示 |
| `capability` | 可选的运行能力名，例如 `portal.status`，用于按插件设置开关页面 |

读取 `GET /extensions/{pluginId}/ui/{pageId}` 获得页面内容 `View`：`title`、可选 `notice/metrics` 和 `resources` 数组。页面展示位置由 `surface` 决定；核心仍按角色及能力检查页面访问，业务接口必须另行检查权限和开关。

每个资源提供 `key/title/endpoint/columns`，按需包含 `fields/createLabel/editable/deletable/actions/pollIntervalSeconds/empty`。普通资源采用列表 `GET <endpoint>`、创建 `POST <endpoint>`、编辑 `PATCH <endpoint>/{id}`、删除 `DELETE <endpoint>/{id}`、记录操作 `POST <endpoint>/{id}/{action}`；是否提供这些操作由资源声明与实际业务路由决定。`Action.endpoint` 可以指定独立操作路径，`bind` 映射记录字段，`when` 控制操作显示。

`singleton=true` 表示单例配置：读取仍返回一条记录的数组，编辑直接使用 `PATCH <endpoint>`，不附加记录 ID。品牌、注册、节点设置和推广设置都使用各插件自己的 `/settings`，没有统一的跨插件设置接口。

字段可用 `optionsEndpoint` 读取选择项，通过点路径表达嵌套对象，例如 `certConfig.mode`；`when` 声明条件字段。资源 `endpoint` 通常相对当前插件，完整 `/api/...` 地址可指向另一插件，目标仍独立校验权限。结构和示例见 [插件文档](plugins.md#声明式页面)。

能力由核心内部读取插件 `GET /_capabilities`，响应为 `{"data":{"能力名":true}}`。这些 `/_...` 路径禁止从公开扩展入口调用，不能当作访客查询接口。插件停用后，扩展入口返回不可用，已有业务数据保留。

## 官方业务接口

以下路径位于对应插件的基础路径下，不兼容其他面板。未特别说明的接口需要登录，写配置及管理操作需要管理员；同一资源并不自动支持全部增删改查方法。

| 插件 | 主要资源与操作 |
| --- | --- |
| `branding` | 公开 `GET /public`；管理员 `GET/PATCH /settings` |
| `registration` | 公开 `POST /register`；管理员 `GET/PATCH /settings` |
| `nodes` | `/nodes`、`/machines`；`POST /nodes/{id}/rotate`；`GET /status`；管理员 `GET/PATCH /settings`；节点代理 `POST /agent/sync` 使用 `X-Node-Token` |
| `access` | `GET/POST /accounts`、`PATCH /accounts/{id}`、`POST /accounts/{id}/reset`、`POST /accounts/{id}/suspend` |
| `subscriptions` | `GET/POST /links`、`POST /links/{id}/rotate`；公开订阅 `GET /s/{token}?format=clash\|sing-box\|uri` |
| `redeem` | 管理员 `/codes`、`/codes/{id}`；用户 `POST /redeem`、`GET /claims` |
| `commerce` | `/plans`、`/coupons`；`GET/POST /orders`、`POST /orders/{id}/{action}`；`GET/POST /ledger`；公开 `GET /public/plans` |
| `affiliate` | `GET /summary`、`GET /commissions`、`GET/POST /withdrawals`、`POST /withdrawals/{id}/{action}`；管理员 `/profiles`、`GET/PATCH /settings` |
| `payments` | `/channels`、`POST /checkout`、`GET /transactions`、`POST /transactions/{id}/resolve`；公开 `GET/POST /webhooks/{channelId}` |
| `audit` | `/rules`、`/logs` |
| `support` | `/tickets`、`POST /tickets/{id}/reply`、`POST /tickets/{id}/close`、`/announcements`、`/articles`、`/mail`、`/notifications` |
| `oauth` | 公开 `GET /providers`、`POST /authorize` 与授权回调；当前用户 `/bindings`；管理员 `/settings/providers`、`POST /bindings/import` |

交易和账本只开放对应业务操作，用户只读取自己的订单、账本、订阅、工单和兑换记录。已登录用户的套餐列表按购买或续费资格筛选，公开套餐只展示已上架内容。支付渠道对普通用户只展示名称、标识和提供方，服务端密钥不会返回。

当前配置与业务列表返回完整集合，界面进行分页与筛选；操作记录和后台任务各返回最近 200 条。高数据量外部集成应增加面向所需资源的服务端分页，不能把界面分页误解为数据库分页。

### 品牌、注册与兑换码

`GET /extensions/branding/public` 只返回 `name/logoUrl/faviconUrl`。管理员以 `PATCH /extensions/branding/settings` 修改这三个字段，图片支持 HTTPS 地址或本站绝对路径。品牌与商业、注册和推广配置分别保存。

`POST /extensions/registration/register` 接收 `email/password/name?/referral?`；成功返回新用户 `id` 与提示，不自动发放访问权益。`PATCH /extensions/registration/settings` 接收 `{"enabled":false}` 关闭全局注册，不随模式切换改变。停用注册插件同样关闭普通新账号；OAuth 新账号还需全局注册开放和对应提供方允许注册，已有绑定登录与账户绑定不受影响。

`POST /extensions/redeem/redeem` 需要登录，接收 `{"code":"兑换码","requestId":"本次提交编号"}`。完成返回 `status=redeemed`；已登记但暂未发放时返回 HTTP `202`、`status=pending`，重试保留原 `requestId`，不能更换编号当作新兑换。每账号限兑一次的码可以省略此编号，允许同账号多次兑换时必须提供。`GET /extensions/redeem/claims` 对普通用户仅返回本人记录，管理员使用 `?mine=1` 查看本人记录。

兑换码管理使用 `GET/POST /extensions/redeem/codes` 与 `PATCH/DELETE /extensions/redeem/codes/{id}`；已有用量的码不能删除，可停用。访问权益、流量及期限奖励不依赖商业插件，余额奖励需要商业钱包。旧 `sharing` 插件及商业插件内的注册、充值卡、推广和提现接口不再提供；旧数据通过一次性升级工具搬移，见 [升级说明](deployment.md#升级到-040)。

## 模式安装

管理员向 `POST /mode` 提交 `{"mode":"business","sourceUrl":"https://plugins.example.com/index.json"}`；已注册源也可用 `sourceId`，省略源时使用当前或默认源。返回 HTTP 202，后台解析组合、安装依赖并启用。`GET /mode` 返回 `mode`（当前生效）、`requestedMode`、`phase`、`plugins`、`sourceId`、`sourceUrl`、`error` 与 `updatedAt`。`phase` 为 `needs_install`、`installing`、`ready` 或 `failed`，插件状态为 `pending`、`installing`、`ready` 或 `failed`。失败可再次提交同一请求；功能全部就绪后才更新当前模式。

模式值为 `personal`、`sharing`、`business`，`sharing` 表示公益 / 分享组合，与已删除的旧同名插件不同。模式决定默认安装组合与使用入口，切换不自动卸载额外插件或清空数据。推广和 OAuth 均不随任何官方模式默认安装。各功能通过其插件启停或独立设置控制，默认组合见 [使用模式](modes.md)。

## 用户前台接口

公开套餐为 `GET /extensions/commerce/public/plans`，返回已上架套餐的展示字段，不返回原始迁移快照或内部限制。新套餐期限统一使用 `durationUnit`（`day`、`month`、`permanent`）与 `durationValue`，按月续费按日历月计算。`quotaGiB` 为周期额度，`unlimited` 明确决定是否不限流量；额度为零不会自动变成不限流量。

`POST /extensions/commerce/orders` 创建订单，`POST /extensions/commerce/orders/{id}/{action}` 支持 `pay/cancel/confirm/refund`，其中人工确认和退回余额需要管理员。创建订单和提现申请可携带 `requestId`，同一用户重试相同内容时返回原记录，用同一标识改动内容返回冲突。客户端在用户重新确认另一笔操作时生成新标识，网络失败重试保留原标识。支付跳转或回跳参数不代表到账，须查询服务端订单状态。

推广使用独立路径 `GET /extensions/affiliate/summary`，返回当前账户的推广链接、邀请人数、可用、冻结和累计佣金等信息。`POST /extensions/affiliate/withdrawals` 接收 `method=wallet` 时由本人直接转入余额，无需申请审批；`method=cash` 时创建现金提现申请。余额转入最低 1 分，现金提现最低 1 元。相同 `requestId` 重试保留原记录与入账标识。本人可使用 `POST /extensions/affiliate/withdrawals/{id}/transfer` 完成旧的待处理余额转入；`cancel` 可撤回本人尚未处理的现金申请或旧余额转入，新余额转入直接进入处理中，不可撤回。管理员使用同一资源的 `approve/reject/paid` 操作审批现金提现、拒绝未处理记录或登记现金打款。现金打款由管理员在外部完成，不会通过此接口自动转账。推广设置使用 `GET/PATCH /extensions/affiliate/settings`；个人规则使用 `GET/POST /extensions/affiliate/profiles`、`PATCH /extensions/affiliate/profiles/{userId}`。停用该插件不影响商业订单与钱包。

`GET /extensions/nodes/status` 对普通用户只返回其有权使用的节点；管理员可查看全部节点与真实上报的 CPU、内存、磁盘、在线人数和错误。管理员前台预览使用 `?scope=mine`。最近 120 秒心跳判为在线，缺少心跳判为未接入或离线；没有负载上报时相应字段省略，不以零值假定空闲。此接口不探测公网延迟或线路可达性。

管理员以 `PATCH /extensions/nodes/settings` 提交 `{"userStatusEnabled":false}`，关闭用户节点状态入口和用户状态接口；管理员监控、NodeRS 接入、流量上报及订阅继续运行。节点记录的 `enabled` 控制服务启用，`visible` 控制订阅及用户状态列表中的显示，两者独立。共用父节点的记录通过 `parentId` 保留关系，子节点可使用父节点服务与状态而不重复启动监听。

OAuth 授权、完成注册、绑定与人工搬入的准确请求结构见 [第三方登录文档](../../PxBoard-Plugins/docs/oauth.md#接口)。普通用户不能调用管理员的绑定导入或提供方配置接口，最终会话由核心 `/auth/external/complete` 建立。

## NodeRS 与迁移

NodeRS 原生机器接口以 `/extensions/nodes/machines/{machineId}` 为前缀，认证头为 `X-Machine-Key`。这里的 `machineId` 是数字机器编号，`nodeId` 是节点的数字 `wireId`，区别于管理员资源的字符串记录 ID。

| 方法与机器相对路径 | 用途 |
| --- | --- |
| `GET /handshake` | 接口版本、轮询方式与能力列表 |
| `GET /nodes` | 当前机器的节点清单及同步间隔 |
| `GET /nodes/{nodeId}/config` | 协议、监听、传输与证书配置 |
| `GET /nodes/{nodeId}/users` | 当前节点可用的账户与独立连接凭据 |
| `POST /nodes/{nodeId}/traffic` | 按 `batchId` 去重的流量批次，账户上传和下载值使用字节 |
| `POST /nodes/{nodeId}/alive` | 在线账户上报 |
| `POST /nodes/{nodeId}/status`、`POST /status` | 节点或主机状态上报 |
| `GET /configuration` | 读取待应用的面板配置，没有任务时 `data=null` |
| `POST /configuration/status` | 回报配置版本与 `applied/failed` 结果 |

管理员通过 `POST /extensions/nodes/machines/{id}/configuration` 下发目标面板配置，正文为 `{panelType,api,machineId,key}`；`panelType` 为 `pxboard` 或 `xboard`。通过 `GET /extensions/nodes/machine-configurations` 查询结果，通过 `POST /extensions/nodes/machine-configurations/{id}/retry` 重新下发失败任务。管理列表不返回目标密钥。下发成功表示任务已保存，实际切换等待 NodeRS 验证及确认。完整结构和回退规则见 [NodeRS 配置管理](../../PxBoard-Plugins/docs/noders-management.md) 与 NodeRS 的 `docs/zh/pxboard.md`。

导入插件为 `import-sspanel`、`import-v2board`、`import-xboard`，在各自前缀下通过 `GET/POST /jobs` 查看或创建任务，通过 `POST /jobs/{id}/preview`、`POST /jobs/{id}/apply`、`POST /jobs/{id}/report` 预览、提交或读取报告。默认转换用户、套餐、余额与订阅，可选节点和推广关系及佣金；源用户可用佣金非零但未选择推广导入时会阻断。核心导入运行接口要求显式 `import:*` 权限，暂存完整性、用户凭据、冲突检查和最终写入在提交事务中验证，原始数据保留在插件状态目录和归档集合。

源面板的原邀请码和兑换码只归档；第三方客户端与 OAuth 数据不经通用导入插件转换，OAuth 绑定使用独立人工搬入工具。使用流程、升级工具与字段范围见 [迁移文档](../../PxBoard-Plugins/docs/migration.md)。
