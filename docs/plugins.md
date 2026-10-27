# 插件开发与在线源

本文对应核心 `0.3.0`、插件接口版本 `1.0`。官方业务仓库通过公开的 `pkg/plugin` 与核心交互，不导入核心的内部实现。

## 最小插件

创建独立 Go 模块并引用 `github.com/MoeClub-Open/PxBoard/pkg/plugin`。同级源码开发可使用：

```go
replace github.com/MoeClub-Open/PxBoard => ../PxBoard
```

插件入口示例：

```go
package main

import (
    "log"
    "net/http"
    p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /hello", func(w http.ResponseWriter, r *http.Request) {
        if p.Subject(r).ID == "" {
            p.Fail(w, http.StatusUnauthorized, "请先登录")
            return
        }
        p.JSON(w, p.Record{"message": "Hello"})
    })
    if err := p.Serve(mux); err != nil {
        log.Fatal(err)
    }
}
```

标准输出专用于通信，日志写到标准错误。SDK 提供健康握手、HTTP 请求转换和处理器异常隔离。插件请求在进程中按顺序执行，单次调用有响应期限；导入等耗时工作应立即返回任务标识，再通过后台工作与状态查询完成。不要建立循环同步调用。

## 插件声明

```json
{
  "id": "example-plugin",
  "name": "示例插件",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "minCoreVersion": "0.3.0",
  "description": "示例资源管理",
  "category": "工具",
  "author": "Example",
  "dependencies": {},
  "permissions": ["storage:own"],
  "events": ["system.tick"],
  "pages": [
    {
      "id": "items",
      "title": "资源",
      "icon": "server",
      "group": "工具",
      "roles": ["admin"]
    }
  ]
}
```

| 字段           | 用途                                                   |
| -------------- | ------------------------------------------------------ |
| `id`           | 稳定插件标识，也是扩展接口和数据命名空间标识           |
| `version`      | 三段数字版本，例如 `1.2.0`                             |
| `apiVersion`   | 当前必须为 `1.0`                                       |
| `minCoreVersion` | 可选的最低核心三段数字版本，例如 `0.3.0`；安装和启用前检查 |
| `dependencies` | 插件 ID 到最低版本的映射，例如 `{"access": ">=1.2.0"}` |
| `permissions`  | 核心运行接口所需权限                                   |
| `events`       | 订阅的事件类型                                         |
| `pages`        | 管理或用户资源页面                                     |
| `publicPaths`  | 允许未登录请求进入的完整路径或路径段前缀               |
| `summary`      | 是否提供 `GET /summary` 指标数组                       |
| `auth`         | 注册等公开表单入口                                     |
| `capabilities` | 需要按运行配置查询的能力名称                           |

版本依赖只支持三段版本及 `>=` 最低版本形式。声明中有公开路径并不表示所有方法都应允许匿名调用；仍须在插件中限制 HTTP 方法、输入和业务权限。核心不会公开扩展内部的 `/_...` 路径。

`minCoreVersion` 使用版本号，不填写比较表达式。需要新核心能力的插件应声明该字段；核心版本不足时会要求先升级核心，不会替换已安装版本或启动不兼容插件。

## HTTP 与身份

插件路由通过 `/api/v1/extensions/{pluginId}/...` 对外提供。成功响应使用 `{"data": ...}`，错误使用 `{"error": {"code": "...", "message": "..."}}`。SDK 的 `JSON`、`Fail` 和 `FailCode` 可以生成对应响应。字段使用 camelCase。

`p.Subject(r)` 返回核心验证后的身份。`p.Admin(r)` 检查管理员，`p.Service(r, "other-plugin")` 检查是否由指定插件调用。普通用户只能操作自己拥有的记录；页面导航、角色声明和前端按钮只是展示条件，不能代替后端所有权检查。

公开接口只返回经过选择的公开字段。例如公开套餐可以返回名称、价格、额度和期限，不返回支付配置、原始迁移记录、内部限制或用户信息。

## 声明式页面

每个页面提供 `GET /ui/{pageId}`，返回 `p.View`。资源通过 `endpoint`、`columns`、`fields`、`createLabel`、`editable`、`deletable`、`actions` 和可选刷新间隔声明行为。

核心 `0.4.0` 支持页面声明 `capability`，例如节点用户页设置 `"capability": "portal.status"`。核心向插件内部 `GET /_capabilities` 查询该布尔值，并从普通用户的插件列表中移除关闭的页面，同时拒绝直接访问对应 `/ui/{pageId}`。管理员保留声明给管理员的管理与监控页面。插件还应在业务接口检查开关；导航展示不能代替接口权限。

页面的 `surface` 指定展示位置：`admin` 为管理后台，`portal` 为用户前台，省略则两边均可展示。后台插件页面位于 `/admin/p/{pluginId}/{pageId}`，前台扩展页面位于 `/user/extensions/{pluginId}/{pageId}`。导航和前端直接路由都遵循此声明；访问权限仍由 `roles`、`capability` 和插件业务接口共同检查。例如兑换码管理页使用 `surface: "admin"`，用户兑换页使用 `surface: "portal"`，管理员可在用户前台预览兑换功能，后台不重复展示兑换入口。

| 操作     | 默认请求                    |
| -------- | --------------------------- |
| 列表     | `GET /items`                |
| 新建     | `POST /items`               |
| 修改     | `PATCH /items/{id}`         |
| 删除     | `DELETE /items/{id}`        |
| 记录操作 | `POST /items/{id}/{action}` |

单例配置资源设置 `"singleton": true`，读取仍返回一条记录的数组，编辑直接请求 `PATCH <endpoint>`，不附加记录 ID。例如设置资源的读写路径都为 `/settings`。普通列表资源继续使用表中的记录路径。

`Action.endpoint` 可以覆盖默认操作路径。`bind: {"orderId": "id"}` 将当前记录字段映射到操作请求，`when: {"status": ["pending"]}` 控制操作展示。调用其他插件的页面动作使用完整的 `/api/v1/extensions/...` 路径，目标接口仍须检查权限。

字段支持 `text`、`email`、`password`、`number`、`money`、`gib`、`boolean`、`select`、`datetime`、`textarea` 和 `hidden`。展示另支持 `status`、`tag`、`longtext`、`copy`、`link`。`money` 的接口值为整数分，界面以元输入与显示；`link` 可以是同源相对地址。

下拉字段可以使用 `optionsEndpoint` 指向同源 API，例如 `/api/v1/extensions/payments/channels`，返回 `data: [{id, name}]`。浏览器以当前用户身份获取选项，避免页面提供方同步调用目标插件后又被目标插件反向调用。可用权限仍由目标接口判断。

字段可声明 `when`，例如 `{"key":"amount","type":"money","when":{"kind":["balance"]}}`。条件全部匹配时才显示、校验和提交该字段，值按字符串与选项匹配，适合兑换类型等互斥配置。隐藏的条件字段不会混入提交内容。

表单字段键支持点路径，例如 `certConfig.mode`。读取记录时解析嵌套对象，提交时恢复为 `{"certConfig":{"mode":"file"}}`；`when` 使用同一字段键。编辑已有记录时，不为缺少的嵌套字段补默认值，也不提交未填写的嵌套字段；新增记录仍使用字段默认值。插件处理嵌套配置更新时应合并已有对象，保留表单未展示的高级配置。

通用资源保存和插件启停后，前端会广播 `px:configuration-changed`，刷新页面声明及品牌等公开配置；同源的其他标签页在收到配置变更后也会刷新。停用插件保留数据，同时移除它的用户导航与入口。

长任务列表可设置 `pollIntervalSeconds`。操作结果可以返回：

| 返回字段                                 | 界面行为                 |
| ---------------------------------------- | ------------------------ |
| `message`                                | 显示操作结果提示         |
| `redirectUrl`                            | 提供收银台等外部操作链接 |
| `title`、`details`                       | 显示报告或详情           |
| `token`、`identifier`、`identifierLabel` | 显示接入凭据及对应编号   |

页面描述适合管理资源和第三方扩展。主项目另提供官方用户前台的连续购买、支付和订阅流程；当前不支持安装任意前端脚本包来替换整个界面。

## 注册与能力

注册表单由插件声明：

```json
{
  "publicPaths": ["/register"],
  "capabilities": ["auth.registration"],
  "auth": [
    {
      "key": "register",
      "title": "注册",
      "path": "/register",
      "modes": ["business"],
      "capability": "auth.registration",
      "fields": [
        { "key": "email", "label": "邮箱", "type": "email", "required": true },
        {
          "key": "password",
          "label": "密码",
          "type": "password",
          "required": true
        }
      ]
    }
  ]
}
```

`modes` 限制表单在自用、分享或商业模式中的展示，省略表示不按模式筛选。`query` 可以将 URL 参数映射到表单字段，用于邀请码或推荐关系。`capability` 把表单绑定到实际运行状态。

公开的 `GET /api/v1/setup` 同时返回 `extensions`，内容为已启用且正常运行的插件 ID 数组，不包含版本、权限或配置。前端依据可用模块决定入口，避免仅根据使用方式显示已停用的功能。插件和配置变更会通知当前及其他同源标签页刷新声明。

声明了 `capabilities` 的插件提供内部 `GET /_capabilities`，返回能力名称到布尔值的映射。`auth.password-reset` 表示已配置可用的密码找回投递服务。表单的模式和能力筛选不能代替业务端点限制；插件应在公开注册处理器中执行相同的开放条件。

核心在模式安装成功后发布 `workspace.configured`，数据包括 `mode`、触发管理员的 `userId` 和组合插件 ID。需要跟随模式改变公开能力或初始化工作空间的插件订阅此事件，验证来源为核心，再按稳定记录 ID 处理；不得覆盖用户已有权益。后台事件存在处理延迟，处理器应支持重复执行。

## 外部身份登录

OAuth 等身份插件负责验证外部身份、维护登录绑定和处理授权回调。核心不识别供应商接口，只向声明了 `auth:login` 权限的插件提供短期登录凭证。该权限允许插件为已有用户发起登录，应只授予可信的身份插件；普通业务插件不需要此权限。

浏览器开始授权前生成至少 32 字符的随机 `proof`，保存在当前标签页的 `sessionStorage` 中，并将它的 SHA-256 十六进制摘要作为 `proofDigest` 交给身份插件。插件把摘要和本次授权状态关联，在验证外部身份及绑定关系后调用：

```go
grant, err := client.CreateLoginGrant(userID, proofDigest, "/user")
```

SDK 对应 `POST /api/v1/runtime/auth/grants`，请求字段为 `userId`、`proofDigest` 和 `redirectPath`，返回 `ticket` 与 `expiresAt`。凭证三分钟内有效，只能成功使用一次。`redirectPath` 默认 `/user`，允许 `/user`、`/admin`、`/account` 及其子路径；核心拒绝外部地址和跳出这些路径的目录跳转。管理页面仍检查管理员身份，登录插件不能通过回跳地址提升权限。账户页面使用 `/user/account`。

插件把登录凭证返回当前浏览器后，由浏览器调用核心：

```http
POST /api/v1/auth/external/complete
Content-Type: application/json

{"ticket":"一次性登录凭证","proof":"浏览器保存的随机原文"}
```

核心在同一事务中检查凭证、浏览器证明、插件仍已启用且仍有 `auth:login` 权限，以及用户状态仍为 `active`。启用了动态验证码的用户还必须提交 `code`；缺少或错误时返回 `error.code=mfa_required`，可以在凭证有效期内用同一凭证补交。成功响应的 `data` 包含 `user` 和 `redirectPath`，核心设置 HttpOnly 会话 Cookie，再消费凭证。停用用户不能通过外部身份重新登录。

不要把浏览器随机证明原文发送给外部身份供应商，不要在日志中记录凭证、证明或供应商访问令牌。插件扩展响应不能直接设置登录 Cookie；必须通过核心完成会话创建。已有账号的绑定必须由已登录用户主动确认，或由管理员按确定的用户映射搬入；仅邮箱相同不能自动建立绑定。

解除最后一个外部登录绑定前，身份插件可以调用 `client.VerifyUserCredential(userID, password, code)`，确认用户仍掌握本地密码。该方法对应需要 `auth:login` 权限的 `POST /api/v1/runtime/auth/verify`，接收 `userId`、`password`、`code`，同样检查账户启用状态和动态验证码，成功返回 `{"verified":true}`。插件必须从当前登录身份确定 `userId`，不能允许用户代其他账号确认或解除绑定。

## 存储、调用与事件

`p.NewClient()` 使用运行器注入的环境变量：

| 变量                  | 用途                         |
| --------------------- | ---------------------------- |
| `PX_PLUGIN_ID`        | 当前插件 ID                  |
| `PX_CORE_URL`         | 核心内部访问地址             |
| `PX_PLUGIN_TOKEN`     | 当前进程临时运行令牌         |
| `PX_PLUGIN_STATE_DIR` | 跨版本保留的插件文件状态目录 |

SDK 提供 `List`、`Put`、`Delete`、`Increment`、`Call`、`Users`、`Emit` 及通用 `Request`。插件集合固定到自己的命名空间。`Put` 覆盖同一 ID 的记录，适合稳定 ID 的配置或重复执行安全操作。

核心 `0.3.0` 新增 `PutMany(collection, records)`，在同一个事务中写入当前插件同一集合的记录；失败整体回滚。它对应 `POST /api/v1/runtime/batch`，需要 `storage:own`，请求包含 `collection` 和 `records`。批量大小应适合接口请求上限，例如周期重置每批 200 条。声明 `minCoreVersion: "0.3.0"` 以便安装时检查。

`PutMany(collection, records)` 通过 `POST /api/v1/runtime/batch` 在一个事务中写入自己的集合，需要 `storage:own` 权限。任一记录无效时整批回滚，适合批量权益更新和经过人工核对的数据搬入。

注册时若必须同时建立首条插件记录，可使用 `CreateUserWithRecord(email, name, password, collection, record)`。它对应 `POST /api/v1/runtime/users` 的可选 `initialRecord: {collection, data}`，同时需要 `users:create` 和 `storage:own`。核心创建普通用户，并在同一事务内向调用插件的集合插入记录、将记录 `userId` 强制设为新用户 ID。记录必须有确定的 `id`；遇到已有记录时回滚，不覆盖原记录，避免注册中断留下无法登录的孤立账号。成功提交后才发出 `user.created` 事件。

`Increment(collection, id, field, amount, operationId)` 在事务中累计并去重，适合流量计数。同一业务操作重试时保持 `operationId` 不变，不能每次重新生成标识。普通记录集合用于配置与业务文档，避免按每个网络连接写入高频记录。

需要分页读取自己的集合时，可调用 `POST /api/v1/runtime/query`，传入 `collection`、等值 `filters`、`offset`、`limit`，返回 `items` 与 `total`。命名空间仍由运行身份确定，不能在请求中切换到其他插件。

事件投递到内部 `POST /_events`。接收者应验证 `p.Service(r, "core")` 和 `Event.Source`，并按业务标识去重。跨插件操作使用 `Client.Call`，避免同步调用环。

| 权限                 | 用途                             |
| -------------------- | -------------------------------- |
| `storage:own`        | 读写当前插件自己的记录集合       |
| `users:read`         | 读取核心用户的公开基本信息       |
| `users:create`       | 创建普通用户                     |
| `auth:login`         | 为已有用户签发外部认证登录凭证   |
| `call:<id>`          | 调用目标插件                     |
| `challenge:verify`   | 复用已启用的订阅人机验证服务     |
| `emit:<event>`       | 发布指定事件类型                 |
| `import:users`       | 暂存并导入核心用户及原密码元数据 |
| `import:<namespace>` | 导入指定插件的业务数据           |

运行接口权限不是操作系统沙箱。插件可以访问面板服务系统用户有权访问的资源，因此安装前必须确认来源和权限用途。

## 迁移扩展

迁移属于显式授权能力，不通过普通 `Put` 绕过其他插件的命名空间。核心提供 `POST /api/v1/runtime/import/{runId}/{operation}`，操作为 `begin`、`stage`、`check` 和 `commit`。

`begin` 的元数据包含预计记录数 `expectedRows`；`stage` 分批提交 `ImportRow`；`check` 返回 `ImportReport`；`commit` 再次检查并在一个事务中写入。报告可能以成功 HTTP 响应返回 `blocked` 状态，调用方必须检查 `status` 与 `errors`，不能仅按 HTTP 状态判断已经导入。

源读取、字段映射、冻结快照和任务恢复由迁移插件负责。原密码算法、金额单位和流量重置语义必须明确，不能用不确定的默认值继续转换。导入不得触发历史订单开通或重放支付。官方实现及用户操作说明见 [迁移文档](../../PxBoard-Plugins/docs/migration.md)。

## 在线插件源

```json
{
  "schemaVersion": "1.0",
  "name": "示例插件源",
  "plugins": [
    {
      "id": "example-plugin",
      "name": "示例插件",
      "version": "1.0.0",
      "apiVersion": "1.0",
      "dependencies": {},
      "permissions": ["storage:own"],
      "pages": [],
      "artifacts": {
        "linux-amd64": "packages/example-plugin-1.0.0-linux-amd64"
      },
      "signatures": { "linux-amd64": "Base64 Ed25519 签名" }
    }
  ],
  "bundles": [
    {
      "id": "personal",
      "name": "自用",
      "description": "自用功能组合",
      "plugins": ["example-plugin"]
    }
  ]
}
```

安装包直接是对应平台的可执行文件，地址相对索引解析。平台键使用 `GOOS-GOARCH`，例如 `windows-amd64`、`linux-amd64`、`linux-arm64`。源必须提供安装服务器实际需要的平台。

普通下载要求 HTTPS，回环地址允许 HTTP。为来源固定 Ed25519 公钥后，平台产物必须提供匹配签名。签名针对程序内容，不能替代对来源、作者和声明权限的信任；索引与网络传输仍应通过可信 HTTPS 服务提供。

### 模式组合

核心模式安装查找选定源中 `id` 为 `personal`、`sharing` 或 `business` 的组合。源可以维护组合里的插件列表，核心按同一来源解析依赖、安装并启用。缺少组合、缺少依赖版本或没有当前平台产物时报告失败，不能把部分安装当作完成。

组合安装不会自动卸载组合之外的已有插件。模式和业务如何响应配置变更见 [模式说明](modes.md)。

### 发布

官方源仓库提供发布工具：

```sh
go run ./cmd/publish -platform linux-amd64
go run ./cmd/publish -platform linux-arm64
```

发布工具读取官方插件仓库的声明，构建平台产物并生成 `index.json`。同版本再次发布其他平台会保留已有平台记录。修改插件代码后提升插件版本再发布，避免同版本产物不能区分更新。

需要签名时：

```sh
go run ./cmd/publish -generate-key release.key
go run ./cmd/publish -platform linux-amd64 -key-file release.key
```

生成命令显示公钥，填入面板来源配置或 `PX_PLUGIN_PUBLIC_KEY`。私钥单独保管，不放入静态服务目录，不提交到仓库。

### 本地安装

插件启停和升级会等待正在处理的调用完成；下载、写入或启动失败时恢复原版本。停用前需先停用依赖它的插件，卸载前需先卸载依赖它的插件；业务数据保留。

开发或离线恢复可以直接安装声明与程序：

```sh
pxboard -data data \
  -install-local ../PxBoard-Plugins/plugins/nodes/manifest.json \
  -binary /path/to/nodes
```

停止面板后执行，随后重新启动并在插件中心启用。该方式不会替代依赖管理，相关依赖仍需安装和启用。状态文件使用 `PX_PLUGIN_STATE_DIR`，不要保存在某个版本的可执行文件目录中。

## 人机验证插件

核心 0.4.5 支持声明 `security.challenge` 的可选插件，最多启用一个。核心向插件内部 `GET /_challenge` 请求公开配置，通过 `POST /_challenge/verify` 传递 `action`（`login`、`register`、`reset`、`oauth`）及 `token`。插件应仅接受核心服务身份，按配置决定哪些场景需要验证，向服务商完成服务端核验；未通过返回 400，服务不可用返回 503。核心不将服务端密钥和验证凭证写入日志。插件进程不可用时受保护入口拒绝请求。

核心对自身密码登录和密码找回、插件 `auth` 声明的注册表单，以及声明 `auth:login` 权限的插件的公开 `POST /authorize` 执行验证。身份插件应使用该入口发起授权并通过 `purpose=bind` 区分已登录的绑定操作；普通登录和第三方注册发送 `purpose=login`。授权前端通过 `challengeToken` 传递凭证。此机制不会代替插件自身的权限校验。停用验证插件不改动已有账户或注册设置。

核心 `0.4.7` 允许具有 `challenge:verify` 权限的插件复用订阅人机验证。`GET /api/v1/runtime/challenge` 返回公开验证配置；`POST /api/v1/runtime/challenge/verify` 接收 `action: "subscription"` 和一次性 `token`，成功返回 `data: true`。这两个接口要求当前验证服务已启用并声明 `security.challenge.subscription` 能力；服务缺失、停用或异常时返回 503，验证未通过时返回 400。调用插件必须自行检查当前用户的权限，不能将服务端密钥或验证凭证保存到客户端订阅地址。
