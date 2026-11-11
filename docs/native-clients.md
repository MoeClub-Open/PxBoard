# 原生客户端接入

原生客户端（桌面端与移动端 XBClient）与网页前端共用同一套 `/rpc/v1` 接口契约，不再通过抓取 YAML 订阅文件或专用兼容接口拼装数据。所有请求使用 `POST /rpc/v1/{service}/{method}` 或 `POST /rpc/v1/$batch`，携带 `Authorization: Bearer <token>`。

## 登录与认证

客户端同时支持应用内直接登录与系统浏览器授权登录：

### 直接邮箱密码登录

1. 调用 `POST /rpc/v1/core/auth.challenge` 检查当前站点是否要求登录人机验证。
2. 未要求验证时，客户端直接调用 `POST /rpc/v1/core/auth.login`，输入 `{"email":"...","password":"...","code":"可选动态验证码"}`；若账号启用了动态验证码且尚未填写，返回 `error.code = "mfa_required"`，提示输入 6 位验证码后重提。
3. 登录成功返回 `{id, email, name, role, token, expiresAt}`，后续请求携带 `Authorization: Bearer <token>`。
4. 若站点开启了登录人机验证或用户选择第三方账号登录，自动切换至下方系统浏览器授权流程。

### 系统浏览器授权登录

此方式复用站点现有的密码、第三方登录、人机验证和动态验证码，客户端不接触第三方提供方密钥：

1. 客户端生成至少 32 字节随机校验串 `proof`，计算其 UTF-8 字节的 SHA-256 小写十六进制 `challenge`。
2. 调用 `POST /rpc/v1/core/auth.authorizeCreate`，提交 `{"name":"客户端名称","challenge":"..."}`。响应包含 `id`、`authorizationUrl`、`expiresAt` 和 `intervalSeconds`。
3. 使用系统浏览器打开 `authorizationUrl`。用户在站点登录后，明确点击允许客户端登录。网址中的申请编号不是会话凭据。
4. 按响应间隔调用 `POST /rpc/v1/core/auth.authorizeExchange`，提交 `{"id":"...","proof":"..."}`。未批准时 `status=pending`；批准后返回 `status=approved`、`token`、`user` 和有效期。
5. 后续请求携带 `Authorization: Bearer <token>`。授权申请只能兑换一次；错误校验串不能领取会话。申请 10 分钟过期，登录会话 7 天过期。

客户端可先通过 `POST /rpc/v1/$batch` 一次读取 `core/setup.get` 与 `oauth/providers.list`；用户点击特定第三方服务时，在 `authorizationUrl` 查询参数追加 `provider=<服务配置ID>`。

`core/auth.authorizeStatus` 为浏览器确认页提供客户端名称和批准状态，`core/auth.authorizeApprove` 由已登录的浏览器会话完成批准。

## 客户端配置与业务聚合

客户端启动或刷新时，使用 `POST /rpc/v1/$batch` 一次合并读取：

- `core/account.me`：当前用户身份与站点模式。
- `core/plugins.list`：当前可用插件与前台页面能力。
- `subscriptions/client.profile`（支持传入 `{"knownRevision":"..."}`）：返回 `{unchanged, revision, account, blockReason, nodes, routing, links, settings}`。
  - `account` 始终返回账户流量、总额度、`unlimited`、到期时间与状态；即使到期、超额或暂停（`blockReason` 非空），接口仍以 HTTP 200 返回完整账户信息与空节点列表，确保客户端正常展示账户状态与续费入口。
  - `nodes` 为 Aerion 原生结构化 JSON 节点数组（含 Flux、AnyTLS、Mieru、Sudoku、VLESS、VMess、Trojan、Shadowsocks、Hysteria2、TUIC 等），无需解析 Clash YAML。
  - `routing` 为已剔除二进制 `.mrs` 规则提供器的分流规则与规则集结构，可直接传给 Aerion 内核。
- `commerce/wallet.get` 与 `support/announcements.list`（按已启用插件按需合并）。

客户端内的套餐选购、订单结算、余额明细、兑换码、工单、推广返佣与修改密码直接调用与网页端完全一致的 `commerce/*`、`payments/*`、`redeem/*`、`support/*`、`affiliate/*` 与 `core/account.changePassword` 过程。

## 打开用户前台

当需要跳转到外部收银台或网页端时：

`POST /rpc/v1/core/auth.browserLink`，提交 `{"redirectPath":"/user/orders"}`，返回的 `url` 在系统浏览器打开后通过 `core/auth.browserExchange` 自动兑换浏览器会话。

`POST /rpc/v1/core/auth.logout` 同时支持 Cookie 会话和 Bearer 会话，退出登录后当前会话立即失效。
