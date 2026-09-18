# Amazon Image Studio 服务器部署交接报告

更新日期：2026-08-18

本报告来自项目文件、Git 本地状态和历史服务器记录。没有读取服务器当前配置或进程，因此每项均标注证据状态：

- 已确认：可由当前项目文件确认。
- 历史记录：此前服务器终端或日志曾出现，当前未再次核实。
- 未核实：需要登录服务器后确认，不能当作当前线上事实。

## 1. 服务器与访问地址

| 项目 | 信息 | 状态 |
| --- | --- | --- |
| 服务器主机名 | `active-bounty-1` | 历史记录 |
| 系统 | CentOS 9 x86_64，RPM/DNF 系 | 部署文档和脚本确认；具体版本未核实 |
| 项目目录 | `/opt/amazon-image-ai` | 已确认 |
| 应用域名 | `image.ubjhbdhsv.top` | 已确认 |
| 正常访问地址 | `https://image.ubjhbdhsv.top` | 已确认配置；当前可访问性未核实 |
| 后端健康检查 | `http://127.0.0.1:3001/api/health` | 已确认 |

同一服务器还运行过 3x-ui/VLESS 等其他服务。它们不属于本项目，但会与 Nginx 的 80/443 端口和证书管理共存，改证书或端口前需先核对现网监听状态。

## 2. Git 仓库与代码版本

| 项目 | 信息 | 状态 |
| --- | --- | --- |
| Git 仓库 | `https://github.com/SHENMIYANG/Amazon-image-ai.git` | 已确认 |
| 本地分支 | `master` | 已确认 |
| 本地 HEAD | `32bcdb0 Add workbench persistence foundation` | 已确认 |
| 远端 `origin/master` | 需要在服务器执行 `git log -1 --oneline origin/master` 确认 | 未核实 |
| 当前线上 commit | 需要在 `/opt/amazon-image-ai` 执行 `git log -1 --oneline` 确认 | 未核实 |

当前本地工作区仍有未提交改动，包括数据库、登录、权限、活动记录、对象存储和前端页面改动。因此这些内容不能假定已部署到服务器。

部署脚本使用：

```bash
git pull --ff-only origin master
```

服务器工作区若有本地改动，或远端仓库没有最新 commit，更新会失败或不会包含本地未推送内容。

## 3. Nginx 与 HTTPS

部署脚本会生成和覆盖：

```text
/etc/nginx/conf.d/image.ubjhbdhsv.top.conf
```

反向代理目标为 `http://127.0.0.1:3001`。已确认的代理参数：

```nginx
client_max_body_size 30M;
proxy_connect_timeout 60s;
proxy_send_timeout 360s;
proxy_read_timeout 360s;
```

HTTP-01 验证目录：

```text
/var/www/acme/.well-known/acme-challenge/
```

HTTPS 证书路径：

```text
/etc/nginx/ssl/image.ubjhbdhsv.top/fullchain.pem
/etc/nginx/ssl/image.ubjhbdhsv.top/key.pem
```

证书文件存在时，脚本会监听 `443 ssl http2`，并将 80 端口重定向到 HTTPS。证书不存在时，脚本只写 HTTP 配置。

历史记录中出现过两类问题：

- 后端未监听 3001 时，Nginx 返回 `502 Bad Gateway`。
- 曾出现浏览器 Basic Auth 登录框，原因是服务器旧 Nginx 配置残留 `auth_basic`。该项不在当前部署脚本中，当前是否已清除未核实。

## 4. 后端运行方式

正式部署脚本使用 PM2，不使用 Docker 启动应用：

| 项目 | 配置 |
| --- | --- |
| 应用名 | `ecommerce-image-gen` |
| 工作目录 | `/opt/amazon-image-ai/backend` |
| 入口 | `server.js` |
| 环境 | `NODE_ENV=production` |
| 端口 | `3001` |
| 实例数 | 1 |
| 自动重启 | 开启 |
| 内存重启阈值 | 500M |

PM2 日志配置：

```text
/opt/amazon-image-ai/backend/logs/error.log
/opt/amazon-image-ai/backend/logs/out.log
/opt/amazon-image-ai/backend/logs/combined.log
```

历史记录里还出现过 `error-0.log`，可能来自旧 PM2 配置或旧实例。当前应以 `pm2 describe ecommerce-image-gen` 为准。

Docker 文件和 Compose 文件存在，但属于备用部署路径。当前不能据此认定线上应用由 Docker 运行。

## 5. 前端构建与实际访问目录

前端构建：

```bash
cd /opt/amazon-image-ai/frontend
npm ci
npm run build
```

构建输出目录：

```text
/opt/amazon-image-ai/frontend/dist
```

生产环境由 Express 提供该目录并处理单页应用回退。Nginx 不单独提供前端静态目录，而是将整个域名代理给 `127.0.0.1:3001`。

## 6. PostgreSQL

项目提供 PostgreSQL Compose 覆盖文件：

```text
docker-compose.db.yml
```

设计中的运行方式：

| 项目 | 配置 |
| --- | --- |
| 镜像 | `postgres:16-alpine` |
| 容器内端口 | `5432` |
| 宿主机映射 | `127.0.0.1:5432:5432` |
| 默认数据库名 | `amazon_image` |
| 默认账号 | `amazon_image` |
| 数据卷 | `postgres_data` |
| 密码 | [已隐藏] |

本地已验证过 Docker PostgreSQL 和 Prisma 迁移。服务器是否已安装 Docker、已启动 PostgreSQL、已执行迁移、已配置 `DATABASE_URL`，均未核实。

生产迁移命令：

```bash
cd /opt/amazon-image-ai/backend
npm run db:generate
npm run db:migrate:deploy
```

不要在服务器使用 `db:migrate:dev`。

## 7. MinIO 或 S3 对象存储

项目已支持 S3 兼容对象存储环境变量，并可使用 MinIO。项目 Compose 文件没有定义 MinIO 服务，因此没有证据表明服务器当前运行了项目管理的 MinIO。

| 项目 | 当前结论 |
| --- | --- |
| 运行方式 | 可接 S3 或 MinIO；服务器实际运行方式未核实 |
| Endpoint | [未核实] |
| Bucket | [未核实] |
| 端口 | [未核实] |
| Access Key / Secret Key | [已隐藏] |

若未设置 `STORAGE_S3_BUCKET`，代码会退回本地文件存储。生产环境当前到底用对象存储还是本地上传目录，需要在服务器 `backend/.env` 和运行日志中确认。

## 8. backend/.env 环境变量清单

生产环境文件路径：

```text
/opt/amazon-image-ai/backend/.env
```

| 类别 | 变量 |
| --- | --- |
| 图片生成 | `IMAGE_GEN_API_KEY`、`IMAGE_GEN_BASE_URL`、`IMAGE_GENERATION_MODEL`、`IMAGE_GEN_QUALITY`、`IMAGE_GEN_TIMEOUT_MS`、`IMAGE_PROMPT_MAX_CHARS`、`IMAGE_MAX_REFERENCE_IMAGES`、`IMAGE_DOWNLOAD_TIMEOUT_MS` |
| 策略模型 | `AGENT_API_KEY`、`AGENT_BASE_URL`、`AGENT_MODEL`、`AGENT_TIMEOUT_MS`、`STRATEGY_TRANSLATION_TIMEOUT_MS` |
| 产品分析 Chat | `WORKSPACE_CHAT_API_KEY`、`WORKSPACE_CHAT_BASE_URL`、`WORKSPACE_CHAT_MODEL`、`WORKSPACE_CHAT_TIMEOUT_MS` |
| 图片反馈 Chat | `IMAGE_FEEDBACK_MODEL` |
| 应用与请求 | `NODE_ENV`、`BACKEND_PORT`、`CORS_ORIGIN`、`JSON_BODY_LIMIT`、`UPLOAD_RETENTION_HOURS` |
| 数据库 | `DATABASE_URL`、`DATABASE_DEFAULT_ORGANIZATION_SLUG`、`DATABASE_DEFAULT_ORGANIZATION_NAME` |
| 登录与首个管理员 | `AUTH_ENABLED`、`AUTH_SESSION_DAYS`、`BOOTSTRAP_ADMIN_LOGIN`、`BOOTSTRAP_ADMIN_PASSWORD`、`BOOTSTRAP_ADMIN_NAME`、`BOOTSTRAP_ADMIN_EMAIL`、`BOOTSTRAP_ORGANIZATION_NAME` |
| S3 / MinIO | `STORAGE_S3_ENDPOINT`、`STORAGE_S3_REGION`、`STORAGE_S3_BUCKET`、`STORAGE_S3_ACCESS_KEY`、`STORAGE_S3_SECRET_KEY`、`STORAGE_S3_FORCE_PATH_STYLE` |

所有实际 Key、密码、会话信息和私钥均为 [已隐藏]。

## 9. 已有部署、更新、重启与回滚命令

### 首次安装

```bash
cd /opt
git clone https://github.com/SHENMIYANG/Amazon-image-ai.git amazon-image-ai
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh install
```

### 日常更新

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh update
```

该脚本会拉取 `origin/master`、安装依赖、构建前端、重启 PM2、写入 Nginx 配置并 reload Nginx。

### 只刷新 Nginx

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh nginx
```

### 常用状态与重启命令

```bash
pm2 status
pm2 restart ecommerce-image-gen --update-env
pm2 logs ecommerce-image-gen --lines 100
curl -fsS http://127.0.0.1:3001/api/health
nginx -t
systemctl reload nginx
```

### 回滚

项目没有已确认的自动回滚脚本或发布标签流程。部署脚本会在写入 Nginx 前备份原文件为：

```text
/etc/nginx/conf.d/image.ubjhbdhsv.top.conf.bak.YYYYMMDDHHMMSS
```

代码回滚前应先确认目标 commit 和服务器工作区状态，再显式切换到已验证 commit 后重新构建、重启 PM2。不要在未确认当前状态时执行破坏性 Git 命令。

## 10. 当前已知问题、未完成事项与验证

### 已知问题

1. 策略模型请求曾出现上游 401、上游临时错误、500 和超时。历史日志显示过错误，但当前 API Key、上游状态和超时配置未核实。
2. 后端停止时，Nginx 会返回 502。应先检查 `pm2 status` 和健康检查，不要先改 Nginx。
3. 证书续期时，base domain `ubjhbdhsv.top` 曾因 Nginx 占用 80 端口而在 standalone 模式失败。Amazon Image Studio 使用子域名 `image.ubjhbdhsv.top`，其正确 ACME webroot 是 `/var/www/acme`。3x-ui 的证书流程需与应用证书分开处理。
4. `docs/DEPLOYMENT.md` 中仍有旧应用名 `amazon-image-studio` 的示例；正式脚本和 PM2 应用名为 `ecommerce-image-gen`。
5. README 和部分数据库文档可能仍引用已移除的 `VIEWER` 角色。以当前 Prisma schema 和认证代码为准。

### 未完成或未部署确认

1. PostgreSQL、登录、RBAC、活动记录、对象存储相关代码仍有本地未提交改动，不能认为线上已经启用。
2. 服务器是否已执行 Prisma 迁移、是否存在数据库备份、是否启用 S3/MinIO，均未核实。
3. 服务器现网 commit、PM2 进程、Nginx 配置、HTTPS 证书有效期和端口监听状态均需重新检查。

### 最近一次历史验证

历史终端记录曾显示：

- `pm2 status` 中应用在线。
- `curl http://127.0.0.1:3001/api/health` 返回 `status: ok`。
- `nginx -t` 通过。

这不是 2026-08-18 的实时验证结果。

## 11. 建议的只读核对命令

登录服务器后，按以下顺序核对，不会修改服务：

```bash
hostnamectl
cd /opt/amazon-image-ai
git branch --show-current
git log -1 --oneline
git status --short
pm2 status
pm2 describe ecommerce-image-gen
curl -fsS http://127.0.0.1:3001/api/health
nginx -t
systemctl is-active nginx
ss -lntp | grep -E ':(80|443|3001|5432|9000)\\b'
```

若服务器已安装 Docker，并且计划使用 Compose PostgreSQL，再执行：

```bash
cd /opt/amazon-image-ai
docker compose -f docker-compose.yml -f docker-compose.db.yml ps
```

核对完成后，再决定是否更新代码、迁移数据库、接入对象存储或处理证书。

