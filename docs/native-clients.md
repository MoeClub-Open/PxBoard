# 原生客户端接入

原生客户端（桌面端与移动端 XBClient）与网页前端共用同一套 `/rpc/v1` 接口契约，不再通过抓取 YAML 订阅文件或专用兼容接口拼装数据。独立多端订阅客户端 Neto 通过通用订阅地址识别为 `aerion` 格式（`User-Agent` 含 `Neto` / `Aerion` / `XBClient` 或 `?format=neto`）。所有面板请求使用 `POST /rpc/v1/{service}/{method}` 或 `POST /rpc/v1/$batch`，携带 `Authorization: Bearer <token>`。

## 登录与认证

客户端同时支持应用内直接登录与系统浏览器授权登录：

### 直接邮箱密码登录

1. 调用 `POST /rpc/v1/core/auth.challenge` 检查当前站点是否要求登录人机验证。
2. 未要求验证时，客户端直接调用 `POST /rpc/v1/core/auth.login`，输入 `{"email":"...","password":"...","code":"可选动态验证码"}`；若账号启用了动态验证码且尚未填写，返回 `error.code = "mfa_required"`，提示输入 6 位验证码后重提。
3. 登录成功返回 `{id, email, name, role, token, expiresAt}`，后续请求携带 `Authorization: Bearer <token>`。
4. 若站点开启了登录人机验证或用户选择第三方账号登录，自动切换至下方系统浏览器授权流程。
5. 应用内注册根据 `core/setup.get` 返回的 `registration` 表单动态呈现，标准账户注册调用 `POST /rpc/v1/registration/register`，输入 `{"email":"...","password":"...","referral":"可选推广标识"}`（无需邮箱验证码）。

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

- `core/account.me`：当前用户身份、`mfaEnabled` 状态与站点模式。
- `core/plugins.list`：当前可用插件与前台页面能力。
- `subscriptions/client.profile`（支持传入 `{"knownRevision":"..."}`）：返回 `{unchanged, revision, account, blockReason, nodes, routing, links, settings}`。
  - `account` 始终返回账户流量、总额度、`unlimited`、到期时间与状态；即使到期、超额或暂停（`blockReason` 非空），接口仍以 HTTP 200 返回完整账户信息与空节点列表，确保客户端正常展示账户状态与续费入口。
  - 当用户已开通有效访问账户且名下尚无任何订阅链接时，`client.profile` 会自动初始化一条默认订阅链接并返回在 `links` 中，客户端内注册购卡的用户无需再赴网页端创建链接。
  - `nodes` 为 Aerion 原生结构化 JSON 节点数组（含 Flux、AnyTLS、Mieru、Sudoku、VLESS、VMess、Trojan、Shadowsocks、Hysteria2、TUIC 等），无需解析 Clash YAML。
  - `routing` 为已剔除二进制 `.mrs` 规则提供器的分流规则与规则集结构，可直接传给 Aerion 内核。
- `commerce/wallet.get` 与 `support/announcements.list`（按已启用插件按需合并）。

客户端内的套餐选购、订单结算、余额明细、兑换码、工单、推广返佣、修改密码与两步验证管理直接调用与网页端完全一致的 `commerce/*`、`payments/*`、`redeem/*`、`support/*`、`affiliate/*`、`core/account.changePassword` 与 `core/account.mfaSetup` / `mfaEnable` / `mfaDisable` 过程。

## 原生第三方账号绑定与解绑

客户端无需依赖浏览器会话 Cookie 即可完成第三方账号绑定与解绑：

1. 读取当前绑定列表：`POST /rpc/v1/oauth/bindings.list`。
2. 发起原生绑定：生成至少 32 字符随机 `proof`，携带 Bearer 会话调用 `POST /rpc/v1/oauth/authorize`，提交 `{"providerId":"...","purpose":"bind","proof":"...","client":"native"}`，获得 `{id, authorizationUrl, expiresAt, intervalSeconds}`。
3. 在系统浏览器打开 `authorizationUrl`；用户完成第三方授权后，浏览器提示返回客户端。
4. 客户端轮询 `POST /rpc/v1/oauth/bindExchange`，提交 `{"id":"...","proof":"..."}`：进行中返回 `status = "pending"`，完成后写入绑定并返回 `status = "bound"`。
5. 解除绑定：调用 `POST /rpc/v1/oauth/bindings.delete`，当 `requiresPassword = true`（最后一个可用外部登录绑定）时一并传入 `password` 与可选 `code`。

## 移动端 AdMob 激励广告（SSV）

客户端广告单元 ID 与开关固化在构建参数中；当面板启用 `admob` 插件时，Android 客户端通过以下过程完成 Google AdMob 服务端验证（SSV）发奖：

1. 展示前准备：调用 `POST /rpc/v1/admob/reward.prepare`（输入 `{"scene":"plan"|"points"}`），获取带 HMAC 签名的 `customData` 与 `userId` 并传入 AdMob SDK `ServerSideVerificationOptions`。
2. 观看完成登记：客户端收到 `onUserEarnedReward` 后调用 `POST /rpc/v1/admob/reward.pending`（输入 `{"customData":"..."}`）；若 Google SSV 回调已先行到达并发奖，直接返回 `credited = true` 与奖励摘要，否则记入 `pending`。
3. Google 异步回调：AdMob 服务器请求公开回调地址 `GET /api/v1/extensions/admob/ssv`，插件拉取 Google 官方公钥校验 ECDSA-SHA256 签名与 `custom_data` 签名，按 `transaction_id` 幂等调用 `access`（赠送套餐时长与流量）或 `commerce`（增加账户余额）。
4. 奖励记录查询：调用 `POST /rpc/v1/admob/reward.history` 获取最近发奖状态与奖励内容。

## 打开用户前台

当需要跳转到外部收银台或网页端时：

`POST /rpc/v1/core/auth.browserLink`，提交 `{"redirectPath":"/user/orders"}`，返回的 `url` 在系统浏览器打开后通过 `core/auth.browserExchange` 自动兑换浏览器会话。

`POST /rpc/v1/core/auth.logout` 同时支持 Cookie 会话和 Bearer 会话，退出登录后当前会话立即失效。
