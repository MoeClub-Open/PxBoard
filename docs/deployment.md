# 开发与部署

## 目录与依赖

本地构建需要 Go 1.26+、Node.js 24+ 和 pnpm。主项目、官方插件与插件源分别维护，按以下结构放置：

```text
workspace/
  PxBoard/
  PxBoard-Plugins/
  PxBoard-Registry/
```

官方插件通过 Go `replace` 引用同级主项目的公开 SDK。NodeRS 是可选的独立节点项目，不需要放进主仓库。

## 本地启动

先在 `PxBoard-Registry` 中构建本机平台的官方插件并运行源服务：

```sh
go run ./cmd/publish
go run ./cmd/registry
```

保持源服务运行，另开终端在 `PxBoard` 中执行：

```sh
pnpm --dir web install
pnpm --dir web build
go run ./cmd/pxboard -plugin-source http://127.0.0.1:8091/index.json
```

访问 `http://127.0.0.1:8080`。首次选择自用或商业运营模式并创建管理员后，面板自动安装相应插件及依赖，显示进度和结果。以上开发命令显式使用本机源；发布程序默认使用官方在线源，无需另启源服务，也无需逐个安装基础功能。安装失败可以在模式配置页调整来源并重试，管理员账号会保留。

商业模式的访客入口为 `/`，所有已登录账号默认进入 `/user`。管理员可从默认的 `/admin` 或前台“管理后台”进入管理页面，并在“系统设置”中修改后台入口路径。安装商业插件后，在后台创建套餐、接入节点、配置收款渠道和用户服务。详细流程见 [使用模式](modes.md)。

### 后台入口路径

商业模式可在系统设置中填写单级路径，例如 `/manage-2026`。路径可包含字母、数字、连字符和下划线，长度为 3 至 64 个字符，不能使用登录、用户或接口等现有路径。保存后会进入新地址，原 `/admin` 不再提供后台页面；请保存新地址。自用模式使用 `/admin`，切回商业模式时恢复之前设置的地址。

反向代理需要将新入口及其子路径转发到面板。该设置只改变页面入口，不能替代管理员认证、人机验证和其他访问控制。忘记入口时，可在服务器上使用面板程序和现有数据目录恢复默认地址：

```sh
/opt/pxboard/current/pxboard -data /var/lib/pxboard -reset-admin-path
```

恢复只修改后台入口，不改变用户、插件和其他数据。若程序或数据目录不同，请替换为实际路径。

### 站点功能配置

核心 `0.4.0` 将站点品牌、注册、兑换码和推广分别交给独立插件。官方模式组合均包含 `branding`；商业组合包含 `registration`，自用站点可按需安装注册与兑换码。`affiliate` 和 `oauth` 均为可选，任何模式都不默认安装。

首次安装后按需要配置：

| 位置 | 配置内容 |
| --- | --- |
| 品牌设置 | 站名、Logo、网站图标；统一作用于登录页、公开首页、用户前台和后台 |
| 账户注册 | 全局“开放注册”；注册本身不发放流量，切换模式不改变此开关 |
| 兑换码 | 需要时创建访问权益、流量、期限或余额兑换码；余额奖励需要商业钱包，其他奖励无需商业插件 |
| 节点设置 | 是否向用户展示节点状态；管理员监控与 NodeRS 接入不受此开关影响 |
| 推广返佣 | 另行安装 `affiliate` 后设置佣金与提现；公益站点可保持不安装 |
| 第三方登录 | 另行安装 `oauth` 并配置提供方；新账号还需要全局注册开放与该提供方允许注册 |

切换模式不会自动卸载额外插件，停用对应插件才会关闭该功能及接口。停用或卸载保留数据；关闭注册不影响已有账号登录与已有 OAuth 绑定。详细规则见 [使用模式](modes.md#独立功能与开关)。

### 界面开发

需要前端热更新时，分别运行后端和 Vite：

```sh
go run ./cmd/pxboard -public-url http://127.0.0.1:5173 -plugin-source http://127.0.0.1:8091/index.json
pnpm --dir web dev
```

浏览器访问 `http://127.0.0.1:5173`。Vite 将 `/api` 请求转发给后端。`-public-url` 应与浏览器实际使用的地址一致。

## 插件源配置

### 网络代理

插件源索引和安装包通过 HTTPS 下载。面板进程支持标准 `HTTPS_PROXY`、`HTTP_PROXY` 和 `NO_PROXY` 环境变量。若直连 GitHub 不可用，可在启动面板前配置已经可用的代理；Windows 的系统代理开关不会自动转换成 Go 服务进程的环境变量。

```powershell
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
$env:HTTP_PROXY = $env:HTTPS_PROXY
$env:NO_PROXY = '127.0.0.1,localhost,::1'
.\pxboard.exe
```

示例端口需要替换为实际代理端口。Linux 服务可以在服务管理器中设置同名环境变量。保留本机地址的直连，供核心和本机插件相互调用。安装页会显示源连接错误，修复网络后可重试同一模式，已有账号和数据会保留。

启动参数和环境变量用于指定模式安装时使用的默认插件源：

| 参数                 | 环境变量               | 默认值或用途                       |
| -------------------- | ---------------------- | ---------------------------------- |
| `-plugin-source`     | `PX_PLUGIN_SOURCE`     | `https://raw.githubusercontent.com/MoeClub-Open/PxBoard-Registry/main/index.json` |
| `-plugin-public-key` | `PX_PLUGIN_PUBLIC_KEY` | 可选的 Base64 Ed25519 发布公钥     |

Linux 示例：

```sh
export PX_PLUGIN_SOURCE='https://plugins.example.com/index.json'
export PX_PLUGIN_PUBLIC_KEY='发布方提供的公钥'
./bin/pxboard -public-url https://panel.example.com
```

PowerShell 示例：

```powershell
$env:PX_PLUGIN_SOURCE = 'https://plugins.example.com/index.json'
$env:PX_PLUGIN_PUBLIC_KEY = '发布方提供的公钥'
.\bin\pxboard.exe -public-url https://panel.example.com
```

命令行参数优先于环境变量。没有配置公钥时不执行发布签名验证；配置后，源中的平台产物必须提供对应签名。只配置自己信任的插件源。

模式配置页可以选择已经注册的源，或填写源地址。普通在线源使用 HTTPS，只有回环地址允许 HTTP。切换来源不会自动把已安装插件替换为其他同名版本；升级和安装结果以插件中心显示为准。

### 自建或离线源

在插件源仓库构建目标服务器需要的平台：

```sh
go run ./cmd/publish -platform linux-amd64
go run ./cmd/publish -platform linux-arm64
```

将生成的 `index.json` 和 `packages/` 一起发布到 HTTPS 静态服务。内网部署也可以把它们放在面板所在服务器，由 `cmd/registry` 在回环地址提供服务。生成产物与源码仓库分开保存。

源的模式组合定义在 `PxBoard-Registry/bundles.json`。更新组合或插件声明后重新发布索引。签名发布与源格式见 [插件文档](plugins.md)。

## 生产构建与运行

在主仓库执行：

```sh
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
go build -trimpath -o bin/pxboard ./cmd/pxboard
```

Windows 构建将输出名改成 `bin/pxboard.exe`。主程序运行参数如下：

| 参数                 | 默认值           | 用途                               |
| -------------------- | ---------------- | ---------------------------------- |
| `-listen`            | `127.0.0.1:8080` | HTTP 监听地址                      |
| `-data`              | `data`           | 数据库、插件安装和持久状态目录     |
| `-web`               | `web/dist`       | 已构建的界面目录                   |
| `-public-url`        | 空               | 浏览器使用的公开地址及来源检查依据 |
| `-plugin-source`     | 官方在线插件源   | 模式安装的默认来源                 |
| `-plugin-public-key` | 空               | 默认源的可选发布公钥               |

Linux 示例：

```sh
./bin/pxboard \
  -listen 127.0.0.1:8080 \
  -data /var/lib/pxboard \
  -web /opt/pxboard/web/dist \
  -public-url https://panel.example.com \
  -plugin-source https://plugins.example.com/index.json
```

在前面使用 Caddy 或 Nginx 提供 HTTPS。例如 Caddy：

```caddyfile
panel.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

保留 `/api/v1/...` 和 `/user/...` 的原始路径，由 PxBoard 提供接口和前端路由。HTTPS 公开地址会使登录 Cookie 使用安全标志。登录、注册与密码找回接口可以在反向代理设置适合实际业务的请求速率限制。

插件以面板服务的系统用户权限运行。生产环境使用专用系统用户，并限制其数据目录访问权限。插件安装源只需要向面板服务器提供访问，不需要暴露为用户前台的一部分。

### 持续运行

使用服务管理器维护面板进程。例如 systemd 服务可配置：

```ini
[Unit]
Description=PxBoard
After=network-online.target
Wants=network-online.target

[Service]
User=pxboard
Group=pxboard
WorkingDirectory=/opt/pxboard
Environment=PX_PLUGIN_SOURCE=https://plugins.example.com/index.json
ExecStart=/opt/pxboard/bin/pxboard -data /var/lib/pxboard -web /opt/pxboard/web/dist -public-url https://panel.example.com
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

先创建相应系统用户和目录，并让该用户可以写入数据目录、读取程序与界面文件。需要固定发布公钥时，通过服务的环境文件或启动参数提供。

## Docker Compose

```sh
docker compose up -d --build
```

需要支持 `additional_contexts` 的 Docker Compose / BuildKit，并保持三个仓库的同级目录结构。构建分别生成面板镜像和插件源镜像。插件源容器共享面板的网络空间，在 `127.0.0.1:8091` 提供索引；这个地址指容器网络中的本机，不是浏览器所在电脑。

面板数据放在 `panel-data` 卷中，HTTP 默认映射到宿主机 `127.0.0.1:8080`。对外访问时添加 HTTPS 反向代理，并通过 Compose 的命令参数或环境配置正确的公开地址。使用自建远程源时，修改 `PX_PLUGIN_SOURCE`，可同时设置 `PX_PLUGIN_PUBLIC_KEY`。

## 数据、备份与恢复

`-data` 目录包含：

| 路径                             | 内容                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `pxboard.db` 及运行中的 WAL 文件 | 用户、会话、业务记录、安装状态、事件、任务和操作记录 |
| `plugins/<id>/<version>/`        | 对应版本插件可执行文件；版本序列非零时目录名包含序列号 |
| `plugins/<id>/state/`            | 跨插件升级保留的文件状态，例如冻结的迁移快照         |

备份时停止面板，并完整复制数据目录，包括插件状态目录（工单上传的图片存放于其中）。恢复时停止服务并还原同一目录，再以匹配版本启动。不要只复制运行中的 SQLite 主文件而遗漏 WAL。容器部署需要备份命名卷中的完整内容。

停用和卸载插件保留业务数据，切换使用模式也保留数据。卸载不等于清空记录；重新安装同一插件可以继续读取原有数据。数据库、迁移快照、邮件配置和支付配置都应按敏感数据保存。

升级前按需备份数据，先更新主程序及界面，再按插件中心的版本和依赖要求升级相关插件。主项目和官方开发插件统一为 `0.0.1`；已有旧版本需要先升级主项目到新序列的 `0.0.1` 才能正常识别插件更新，同版本新发布批次仍会显示为可更新。模式安装中断后可以在模式配置页重试；已完成安装的文件和业务数据不会因重试被清空。

### 升级到 0.4.0

从旧版升级需要同时更新核心、界面与官方插件。`branding`、`registration`、`redeem`、`affiliate` 为独立插件，商业插件升级到 `1.4.0` 后不再提供注册、兑换码、推广或提现的旧接口；不提供旧接口兼容层。插件接口版本仍为 `1.0`。

先进入维护状态，停止新增注册、兑换、交易和余额变更，备份完整数据目录。存在旧推广、佣金、提现或兑换数据时，先按下面的专门说明搬移，不要仅卸载旧插件或重复执行外部面板导入。

| 旧数据 | 升级入口 | 执行方式 |
| --- | --- | --- |
| `commerce` 中的推广关系、个人返佣、佣金与提现 | [推广数据拆分](../../PxBoard-Plugins/docs/affiliate.md#从旧商业插件拆出数据) | 停止目标面板，使用官方插件仓库的 `tools/migrate-commerce-affiliate.ts`；默认只检查，明确 `--apply` 才写入 |
| `sharing` 的旧码和兑换记录、商业插件的余额兑换卡 | [兑换码数据升级](../../PxBoard-Plugins/docs/redeem-migration.md) | 使用停止写入后的完整旧数据库备份，在已启用新兑换码插件的目标执行 `tools/redeem-migrate/migrate.ts`；默认只检查，按批提交并可中断重跑 |

推广工具在写入前另建数据库备份，核对金额、目标冲突与已存在的余额账本。兑换码工具保留已完成和待处理记录的原发放标识，不重新开通或重复增加余额。两工具的运行条件不同，按各自文档操作；发现财务或记录冲突时停止，不覆盖现有数据。旧原始资料继续保留供核对。

完成后核对用户、套餐、当前权益、钱包、佣金和兑换记录，再启用需要的业务插件并恢复写入。普通注册政策重新在 `registration` 设置，品牌在 `branding` 设置；不需要推广时可在核对和保留历史财务数据后保持 `affiliate` 停用。源面板原兑换码仍只归档，不经这两个升级工具自动启用。

## 节点接入

### NodeRS

在后台的“机器”创建机器并取得机器编号、接入密钥，再创建 `NodeRS` 节点并指定机器。使用包含 PxBoard 支持的 NodeRS 安装包，在解压目录执行：

```sh
bash install.sh --panel-type pxboard \
  --api https://panel.example.com \
  --key 机器接入密钥 \
  --machine-id 1
```

OpenRC 系统使用 `install-openrc.sh`。`--panel-type` 省略时默认 `xboard`。`--api` 使用面板根地址，不附加 `/api/v1`。程序可以通过 `./noders --supported-panels` 显示支持的类型；安装器会在替换程序前检查支持能力。

NodeRS 本地配置示例：

```toml
[panel]
type = "pxboard"
api = "https://panel.example.com"
key = "replace-with-machine-key"
machine_id = 1
```

机器密钥通过 `X-Machine-Key` 请求头传递。流量批次持久保存在 NodeRS 工作目录，网络失败后用同一批次重试；迁移或移动节点时一并保留该目录。完整的 NodeRS 安装、证书、协议和维护说明见所使用 NodeRS 仓库的 `docs/zh/pxboard.md`。

需要由面板认证下发本地配置、迁移到另一面板时，使用 NodeRS `v0.1.49-pxboard.2` 或更新版本；该能力要求节点插件至少 `1.3.0`，核心 `0.4.0` 对应当前节点插件 `1.4.0`。管理员入口、源 Xboard 桥接与回退操作见 [NodeRS 配置管理](../../PxBoard-Plugins/docs/noders-management.md)。

### 官方 Xray / sing-box 代理

在官方插件仓库构建代理：

```sh
go build -o bin/px-agent ./cmd/agent
```

先安装所选内核。在面板添加节点，填写地址、端口、协议、分组和证书路径，再通过“接入令牌”取得节点 ID 和令牌。在节点服务器运行：

```sh
export PX_NODE_TOKEN='复制的节点令牌'
./px-agent \
  --panel https://panel.example.com \
  --node 节点ID \
  --engine /usr/local/bin/xray \
  --stats-cli /usr/local/bin/xray \
  --data /var/lib/pxboard-agent \
  --access-log /var/log/xray/access.log
```

使用 sing-box 时替换 `--engine`；流量查询仍需要指定支持相应 API 的查询工具。`--access-log` 用于 Xray 审计采集，其父目录需要提前存在且可写。统计接口只监听本机 `127.0.0.1:10085`。代理的实际配置能力见 [功能范围](features.md)，与 NodeRS 的能力分开。

### 状态数据

节点状态页在最后心跳 120 秒内显示在线。NodeRS 还可以上报 CPU、内存、磁盘和在线账户；未收到上报时显示为空。在线状态不代表从任意用户网络都能连通，也不是延迟或测速结果。

管理员可在“节点设置”关闭“向用户展示节点状态”；此设置同时关闭用户入口和用户状态接口，不停止管理员监控、节点监听、流量上报或订阅。节点记录中的“启用”和“订阅显示”分别配置，隐藏订阅入口不会自动停止节点。

## 支付、邮件与迁移

Stripe 渠道填写服务端密钥、Webhook 签名密钥及面板 HTTPS 地址，订阅 `checkout.session.completed` 与 `checkout.session.async_payment_succeeded`。易支付填写商户号、密钥和 HTTPS 网关。回调地址在后台渠道列表显示；支付返回用户订单页，以服务端实际状态确认结果。

用户服务插件的邮件页配置 SMTP。587 使用 STARTTLS，465 使用直接 TLS。未配置或未启用邮件服务时不发送邮件；密码找回依赖有效的投递配置。

迁移插件使用源数据库只读连接或服务器上的迁移快照文件。默认迁移用户、套餐、余额和订阅，节点及推广关系和佣金为可选；源可用佣金非零时必须选择推广导入，不能只归档金额。原邀请码与兑换码仅归档，OAuth 和自建客户端扩展单独接入。在提交前核对报告。源数据库停写、最终导出、密码算法和时区等操作见 [迁移文档](../../PxBoard-Plugins/docs/migration.md)。
