# 服务器一键部署速查

适用服务器：

- CentOS 9 x86_64
- 项目目录：`/opt/amazon-image-ai`
- 域名：`image.ubjhbdhsv.top`
- 运行方式：Nginx + PM2 + Node.js

## 第一次安装

如果服务器还没有项目，先执行：

```bash
cd /opt
git clone https://github.com/SHENMIYANG/Amazon-image-ai.git amazon-image-ai
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh install
```

如果脚本提示缺少 `backend/.env`，编辑这个文件：

```bash
vim /opt/amazon-image-ai/backend/.env
```

填好 API Key、PostgreSQL 和 MinIO 配置后，再执行：

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh update
```

## 以后更新项目

以后只需要执行：

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh update
```

这个命令会自动完成：

- 拉取 GitHub 最新代码
- 安装依赖
- 打包前端
- 更新后端依赖
- 生成 Prisma Client 并执行正式数据库迁移
- 重启 PM2
- 检查后端健康接口
- 刷新 Nginx 配置

`backend/.env` 必须包含：

```env
DATABASE_URL=postgresql://rrj:your_password@127.0.0.1:5432/amazon_image?schema=public
AUTH_ENABLED=true
BOOTSTRAP_ADMIN_LOGIN=admin
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-strong-password

STORAGE_S3_ENDPOINT=http://127.0.0.1:9000
STORAGE_S3_REGION=us-east-1
STORAGE_S3_BUCKET=amazon-image-assets
STORAGE_S3_ACCESS_KEY=your_minio_access_key
STORAGE_S3_SECRET_KEY=your_minio_secret_key
STORAGE_S3_FORCE_PATH_STYLE=true
```

PostgreSQL 和 MinIO 必须先启动。部署脚本不会创建、删除或覆盖它们的数据容器。

## 只刷新 Nginx

如果只改了证书或域名配置，执行：

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh nginx
```

## HTTPS 证书

如果 `/etc/nginx/ssl/image.ubjhbdhsv.top/fullchain.pem` 和 `/etc/nginx/ssl/image.ubjhbdhsv.top/key.pem` 已经存在，脚本会自动启用 HTTPS。

如果还没有证书，先用 acme.sh 申请证书：

```bash
mkdir -p /var/www/acme/.well-known/acme-challenge
curl https://get.acme.sh | sh -s email=admin@ubjhbdhsv.top
source ~/.bashrc
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
~/.acme.sh/acme.sh --issue -d image.ubjhbdhsv.top -w /var/www/acme
mkdir -p /etc/nginx/ssl/image.ubjhbdhsv.top
~/.acme.sh/acme.sh --install-cert -d image.ubjhbdhsv.top \
--key-file /etc/nginx/ssl/image.ubjhbdhsv.top/key.pem \
--fullchain-file /etc/nginx/ssl/image.ubjhbdhsv.top/fullchain.pem \
--reloadcmd "systemctl reload nginx"
```

证书装好后执行：

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh nginx
```

## 检查状态

```bash
pm2 status
curl http://127.0.0.1:3001/api/health
nginx -t
```

浏览器打开：

```text
https://image.ubjhbdhsv.top
```
