# API

基础路径 `/api/v1`，业务插件路径 `/api/v1/extensions/{plugin}`。JSON 字段使用 camelCase，时间使用 UTC RFC 3339，流量上报使用字节，商品与账本金额使用整数分。

成功：`{"data": ...}`；失败：`{"error":{"code":"...","message":"..."}}`。HTTP 状态表达成功、认证、权限与处理失败，请勿以 HTTP 200 携带业务错误。每个响应带 `X-Request-ID`。核心 OpenAPI 入口为 `/api/v1/openapi.json`。

浏览器使用 HttpOnly、SameSite 会话 Cookie。自动化使用 `Authorization: Bearer px_...`，在“我的账户”创建，支持只读或读写权限和有效期。密钥继承账户的角色与数据范围；只读密钥不能执行写请求。插件运行令牌是核心注入的独立临时令牌，不能当作普通用户 API 密钥使用。

| 资源 | 主要请求 |
| --- | --- |
| 初始化 / 身份 | `GET/POST /setup`，`POST /auth/login`，`POST /auth/logout`，`GET /me` |
| 密码 | `POST /me/password`，`POST /auth/reset-request`，`POST /auth/reset` |
| API 密钥 | `GET/POST /tokens`，`DELETE /tokens/{id}` |
| 用户 | `GET/POST /users`，`PATCH /users/{id}` |
| 插件 | `GET /plugins`，`GET /plugins/catalog`，`POST /plugins/install`，`POST /plugins/{id}/enable|disable|restart`，`DELETE /plugins/{id}` |
| 插件源 | `GET/POST /sources`，`PATCH/DELETE /sources/{id}` |
| 状态与运维 | `GET /health`，`GET /overview`，`GET/PATCH /settings`，`GET /activity`，`GET /jobs`，`POST /jobs/{id}/retry` |
| 使用方式 | `GET /mode` 查询安装状态，`POST /mode` 安装所选模式并切换 |

安装插件正文为 `{"id":"nodes","sourceId":"源记录ID"}`。添加源正文为 `{"name":"可选名称","url":"https://.../index.json","publicKey":"可选的Base64公钥"}`。

## 官方业务接口

以下路径位于对应插件的基础路径下，不兼容其他面板：

| 插件 | 主要资源与操作 |
| --- | --- |
| nodes | `/nodes`，`/nodes/{id}/rotate`，公开接入 `/agent/sync`，节点令牌在 `X-Node-Token` |
| access | `/accounts`，`/accounts/{id}/reset`，`/accounts/{id}/suspend` |
| subscriptions | `/links`，`/links/{id}/rotate`，公开订阅 `/s/{token}?format=clash|sing-box|uri` |
| sharing | `/invites`，公开注册兑换 `/redeem` |
| commerce | `/plans`，`/orders`，`/orders/{id}/pay|cancel|confirm|refund`，`/ledger`，`/coupons`，`/gifts`，`/gifts/redeem`，`/referrals`，`/withdrawals`，`/withdrawals/{id}/approve|reject|paid`，`/settings`，公开注册 `/register` |
| payments | `/channels`，`POST /checkout`，`/transactions`，公开回调 `/webhooks/{channelId}` |
| audit | `/rules`，`/logs` |
| support | `/tickets`，`/tickets/{id}/reply|close`，`/announcements`，`/articles`，`/mail`，`/notifications` |

配置资源一般提供列表、新建、修改与删除，交易和账本只开放对应业务操作。用户只读取自己的订单、账本、订阅和工单。商品列表对普通用户只展示上架套餐；支付渠道对普通用户只展示名称、标识和提供方，服务端密钥不会返回。

当前配置与业务列表返回完整集合，界面进行分页与筛选；操作记录和后台任务各返回最近 200 条。高数据量外部集成应增加面向所需资源的服务端分页，不能把界面分页误解为数据库分页。

## 模式安装

管理员向 `POST /mode` 提交 `{"mode":"business","sourceUrl":"https://plugins.example.com/index.json"}`；已注册源也可用 `sourceId`，省略源时使用当前或默认源。返回 HTTP 202，后台解析组合、安装依赖并启用。`GET /mode` 返回 `mode`（当前生效）、`requestedMode`、`phase`、`plugins`、`sourceId`、`sourceUrl`、`error` 与 `updatedAt`。`phase` 为 `needs_install`、`installing`、`ready` 或 `failed`，插件状态为 `pending`、`installing`、`ready` 或 `failed`。失败可再次提交同一请求；功能全部就绪后才更新当前模式。

模式值为 `personal`、`sharing`、`business`。普通 `PATCH /settings` 只修改站点名称与公开地址，不能跳过安装流程切换模式。初始化 `GET /setup` 额外返回 `mode`、`requestedMode`、`needsModeSetup`，公开注册表单只包含适用当前模式且已启用的提供方。

## 用户前台接口

公开套餐为 `GET /extensions/commerce/public/plans`，返回已上架套餐的展示字段，不返回原始迁移快照或内部限制。新套餐期限统一使用 `durationUnit`（`day`、`month`、`permanent`）与 `durationValue`，按月续费按日历月计算。`quotaGiB` 为周期额度，`unlimited` 明确决定是否不限流量；额度为零不会自动变成不限流量。

创建订单和提现申请可携带 `requestId`。同一用户重试相同内容时返回原记录；用同一标识改动内容返回冲突。客户端在用户重新确认另一笔操作时生成新标识，网络失败重试保留原标识。支付跳转或回跳参数不代表到账，须查询服务端订单状态。

`GET /extensions/commerce/affiliate/summary` 返回当前账户的推广链接、邀请人数、可用/冻结/累计佣金与适用规则。`POST /withdrawals` 申请转入余额或现金提现，`POST /withdrawals/{id}/cancel` 撤回自己的待审核申请。转入余额仍需审核；现金打款由管理员在外部完成后登记，不会通过此接口自动转账。

`GET /extensions/nodes/status` 对普通用户只返回其有权使用的节点；管理员可查看全部节点与真实上报的 CPU、内存、磁盘、在线人数和错误。管理员前台预览使用 `?scope=mine`。最近 120 秒心跳判为在线，缺少心跳判为未接入或离线；没有负载上报时相应字段省略，不以零值假定空闲。此接口不探测公网延迟或线路可达性。

## NodeRS 与迁移

NodeRS 原生机器接口位于 `/extensions/nodes/machines/{machineId}`，认证头为 `X-Machine-Key`。机器/节点清单、配置、用户和流量批次分别使用独立资源；流量批次通过 `batchId` 去重。完整结构见官方插件文档与 NodeRS 的 `docs/zh/pxboard.md`。

导入插件为 `import-sspanel`、`import-v2board`、`import-xboard`，均通过 `/jobs` 创建任务，`/jobs/{id}/preview|apply|report` 预览、提交和读取报告。默认转换用户、套餐、余额与订阅，可选择节点。核心导入运行接口要求显式 `import:*` 权限，暂存完整性、用户凭据、冲突检查和最终写入在提交事务中验证；原始数据保留在插件状态目录和归档集合。使用流程与字段范围见官方插件的 `docs/migration.md`。
