# 使用服务器 IP 访问

地址：`http://67.230.180.146`。HTTP 不加密登录密码、会话和上传内容。

先确认包含本次改动的代码已推送，再在服务器执行下面的命令。
这些步骤不改变数据库结构，不删除原域名的 Nginx 配置。

```bash
cd /opt/amazon-image-ai
git pull --ff-only origin master
cp backend/.env "backend/.env.bak.$(date +%Y%m%d%H%M%S)"
if [ -f .deploy.env ]; then
  cp .deploy.env ".deploy.env.bak.$(date +%Y%m%d%H%M%S)"
fi
touch .deploy.env
sed -i '/^DOMAIN=/d' .deploy.env
printf '\nDOMAIN=67.230.180.146\n' >> .deploy.env
chmod 600 .deploy.env
sed -i '/^AUTH_COOKIE_SECURE=/d' backend/.env
printf '\nAUTH_COOKIE_SECURE=false\n' >> backend/.env
bash scripts/server-deploy.sh update
```

保留 `NODE_ENV=production`、`AUTH_ENABLED=true` 和现有数据库、MinIO 配置。
不需要开放 3001、5432 或 9000 端口；外部访问使用 Nginx 的 80 端口。

## 验证

```bash
nginx -t
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS -H 'Host: 67.230.180.146' http://127.0.0.1/api/health
pm2 status
git log -1 --oneline
```

从浏览器打开 `http://67.230.180.146`，重新登录，检查模板预览和已有图片。
旧域名的登录 Cookie 和浏览器本地任务不会自动迁到 IP；数据库记录仍保留。
如果本机健康检查正常，但外部打不开，检查云安全组和系统防火墙的 80 端口。

## 后续更新

```bash
cd /opt/amazon-image-ai
bash scripts/server-deploy.sh update
```

脚本会继续读取 `.deploy.env` 中的 IP。该文件不会提交到 Git。

## 恢复域名和 HTTPS

把 `.deploy.env` 的 `DOMAIN` 改回有可用证书的域名，把 `backend/.env` 的
`AUTH_COOKIE_SECURE` 改为 `true`，再执行更新脚本。确认 HTTPS 登录正常后，
备份并停用 `/etc/nginx/conf.d/67.230.180.146.conf`，运行 `nginx -t` 后再重载 Nginx。
