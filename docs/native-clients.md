# 原生客户端接入

客户端直接使用 PxBoard 接口，不需要 Xboard 兼容层。认证由核心提供；访问权益、节点配置和商业页面继续属于各自插件。

## 浏览器授权登录

此方式复用站点现有的密码、第三方登录、人机验证和动态验证码。客户端不接触用户密码或第三方提供方密钥。

1. 客户端生成至少 32 字节随机校验串 `proof`，计算其 UTF-8 字节的 SHA-256 小写十六进制 `challenge`。
2. `POST /api/v1/auth/native`，提交 `{"name":"客户端名称","challenge":"..."}`。响应包含 `id`、`authorizationUrl`、`expiresAt` 和 `intervalSeconds`。
3. 使用系统浏览器打开 `authorizationUrl`。用户在站点登录后，明确点击允许客户端登录。网址中的申请编号不是会话凭据。
4. 按响应间隔调用 `POST /api/v1/auth/native/{id}/token`，提交 `{"proof":"..."}`。未批准时 `status=pending`；批准后返回 `status=approved`、`token`、`user` 和有效期。
5. 后续请求携带 `Authorization: Bearer <token>`。授权申请只能兑换一次；错误校验串不能领取会话。申请 10 分钟过期，登录会话 7 天过期。

取消或过期后重新发起申请，不将校验串或会话凭据写入网址。客户端切换站点或面板类型时须清除旧会话及节点缓存，保留设备设置。

`GET /api/v1/auth/native/{id}` 为浏览器提供客户端名称和批准状态，不返回账号或会话。`POST /api/v1/auth/native/{id}/approve` 必须使用已登录的站点会话。

## 账号、流量与节点

- `GET /api/v1/me`：当前身份。
- `GET /api/v1/plugins`：按已启用插件显示可用功能。
- `GET /api/v1/extensions/access/accounts?mine=1`：当前用户的权益、流量、期限和有效状态。管理员客户端也须带 `mine=1`。
- `GET /api/v1/extensions/subscriptions/configuration?format=clash`：当前账号的完整 Mihomo 配置；客户端从同一份配置读取节点和分流规则，无需重复请求专用节点格式。

配置接口始终要求身份认证，只返回当前账号有权使用的节点，同时检查父节点权限、期限、配额和暂停状态。此接口不依赖公开订阅令牌，不更改用户已有的订阅链接、验证状态或客户端绑定。公开订阅链接继续遵守原有的人机验证、浏览器隐藏和绑定设置。

## 打开用户前台

客户端可复用站点的套餐、订单、支付、兑换码、工单和账户设置：

`POST /api/v1/auth/browser-link`，使用客户端会话认证，提交 `{"redirectPath":"/user/plans"}`。返回的 `url` 只指向本站用户前台；在系统浏览器打开即可。

链接有效期为 1 分钟，只能使用一次。临时凭据放在片段中，浏览器页面立即移除片段后，通过 `POST /api/v1/auth/browser-link/complete` 兑换浏览器会话；不允许跳转后台或外部网站。不要记录或分享返回的链接。

`POST /api/v1/auth/logout` 同时支持 Cookie 会话和 Bearer 会话。退出登录后当前会话立即失效。
