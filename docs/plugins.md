# 插件开发与在线源

本文对应核心 `0.2.0`、插件接口版本 `1.0`。官方业务仓库通过公开的 `pkg/plugin` 与核心交互，不导入核心的内部实现。

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
| `dependencies` | 插件 ID 到最低版本的映射，例如 `{"access": ">=1.2.0"}` |
| `permissions`  | 核心运行接口所需权限                                   |
| `events`       | 订阅的事件类型                                         |
| `pages`        | 管理或用户资源页面                                     |
| `publicPaths`  | 允许未登录请求进入的完整路径或路径段前缀               |
| `summary`      | 是否提供 `GET /summary` 指标数组                       |
| `auth`         | 注册等公开表单入口                                     |
| `capabilities` | 需要按运行配置查询的能力名称                           |

版本依赖只支持三段版本及 `>=` 最低版本形式。声明中有公开路径并不表示所有方法都应允许匿名调用；仍须在插件中限制 HTTP 方法、输入和业务权限。核心不会公开扩展内部的 `/_...` 路径。

## HTTP 与身份

插件路由通过 `/api/v1/extensions/{pluginId}/...` 对外提供。成功响应使用 `{"data": ...}`，错误使用 `{"error": {"code": "...", "message": "..."}}`。SDK 的 `JSON`、`Fail` 和 `FailCode` 可以生成对应响应。字段使用 camelCase。

`p.Subject(r)` 返回核心验证后的身份。`p.Admin(r)` 检查管理员，`p.Service(r, "other-plugin")` 检查是否由指定插件调用。普通用户只能操作自己拥有的记录；页面导航、角色声明和前端按钮只是展示条件，不能代替后端所有权检查。

公开接口只返回经过选择的公开字段。例如公开套餐可以返回名称、价格、额度和期限，不返回支付配置、原始迁移记录、内部限制或用户信息。

## 声明式页面

每个页面提供 `GET /ui/{pageId}`，返回 `p.View`。资源通过 `endpoint`、`columns`、`fields`、`createLabel`、`editable`、`deletable`、`actions` 和可选刷新间隔声明行为。

| 操作     | 默认请求                    |
| -------- | --------------------------- |
| 列表     | `GET /items`                |
| 新建     | `POST /items`               |
| 修改     | `PATCH /items/{id}`         |
| 删除     | `DELETE /items/{id}`        |
| 记录操作 | `POST /items/{id}/{action}` |

`Action.endpoint` 可以覆盖默认操作路径。`bind: {"orderId": "id"}` 将当前记录字段映射到操作请求，`when: {"status": ["pending"]}` 控制操作展示。调用其他插件的页面动作使用完整的 `/api/v1/extensions/...` 路径，目标接口仍须检查权限。

字段支持 `text`、`email`、`password`、`number`、`money`、`gib`、`boolean`、`select`、`datetime`、`textarea` 和 `hidden`。展示另支持 `status`、`tag`、`longtext`、`copy`、`link`。`money` 的接口值为整数分，界面以元输入与显示；`link` 可以是同源相对地址。

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

声明了 `capabilities` 的插件提供内部 `GET /_capabilities`，返回能力名称到布尔值的映射。`auth.password-reset` 表示已配置可用的密码找回投递服务。表单的模式和能力筛选不能代替业务端点限制；插件应在公开注册处理器中执行相同的开放条件。

核心在模式安装成功后发布 `workspace.configured`，数据包括 `mode`、触发管理员的 `userId` 和组合插件 ID。需要跟随模式改变公开能力或初始化工作空间的插件订阅此事件，验证来源为核心，再按稳定记录 ID 处理；不得覆盖用户已有权益。后台事件存在处理延迟，处理器应支持重复执行。

## 存储、调用与事件

`p.NewClient()` 使用运行器注入的环境变量：

| 变量                  | 用途                         |
| --------------------- | ---------------------------- |
| `PX_PLUGIN_ID`        | 当前插件 ID                  |
| `PX_CORE_URL`         | 核心内部访问地址             |
| `PX_PLUGIN_TOKEN`     | 当前进程临时运行令牌         |
| `PX_PLUGIN_STATE_DIR` | 跨版本保留的插件文件状态目录 |

SDK 提供 `List`、`Put`、`Delete`、`Increment`、`Call`、`Users`、`Emit` 及通用 `Request`。插件集合固定到自己的命名空间。`Put` 覆盖同一 ID 的记录，适合稳定 ID 的配置或重复执行安全操作。

`Increment(collection, id, field, amount, operationId)` 在事务中累计并去重，适合流量计数。同一业务操作重试时保持 `operationId` 不变，不能每次重新生成标识。普通记录集合用于配置与业务文档，避免按每个网络连接写入高频记录。

需要分页读取自己的集合时，可调用 `POST /api/v1/runtime/query`，传入 `collection`、等值 `filters`、`offset`、`limit`，返回 `items` 与 `total`。命名空间仍由运行身份确定，不能在请求中切换到其他插件。

事件投递到内部 `POST /_events`。接收者应验证 `p.Service(r, "core")` 和 `Event.Source`，并按业务标识去重。跨插件操作使用 `Client.Call`，避免同步调用环。

| 权限                 | 用途                             |
| -------------------- | -------------------------------- |
| `storage:own`        | 读写当前插件自己的记录集合       |
| `users:read`         | 读取核心用户的公开基本信息       |
| `users:create`       | 创建普通用户                     |
| `call:<id>`          | 调用目标插件                     |
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

开发或离线恢复可以直接安装声明与程序：

```sh
pxboard -data data \
  -install-local ../PxBoard-Plugins/plugins/nodes/manifest.json \
  -binary /path/to/nodes
```

停止面板后执行，随后重新启动并在插件中心启用。该方式不会替代依赖管理，相关依赖仍需安装和启用。状态文件使用 `PX_PLUGIN_STATE_DIR`，不要保存在某个版本的可执行文件目录中。
