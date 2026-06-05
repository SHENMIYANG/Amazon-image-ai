# 电商图片生成工具 - 生产环境部署指南

## 📋 部署架构

### 开发环境 vs 生产环境

| 项目 | 开发环境 | 生产环境 |
|------|----------|----------|
| **启动方式** | 前后端分别启动 | 只启动后端 |
| **前端** | Vite 开发服务器 (5173) | 打包成静态文件 |
| **后端** | Express (3001) | Express (3001) + 托管前端 |
| **进程数** | 2 个 | 1 个 |
| **访问方式** | http://localhost:5173 | https://your-domain.com |

---

## 🚀 部署步骤

### 1. 构建前端

```bash
cd frontend
npm run build
```

构建产物：
```
frontend/dist/
├── index.html
├── assets/
│   ├── index-xxxx.js
│   ├── index-xxxx.css
│   └── ...
└── vite.svg
```

### 2. 上传到服务器

上传整个项目到服务器：

```bash
# 推荐目录
/var/www/ecommerce-image-gen/
# 或
/opt/ecommerce-image-gen/
```

### 3. 服务器安装依赖

```bash
cd /var/www/ecommerce-image-gen

# 安装前端依赖并构建
cd frontend
npm install
npm run build

# 安装后端依赖
cd ../backend
npm install --production
```

### 4. 配置环境变量

创建 `backend/.env`：

```bash
# OpenAI API Key
OPENAI_API_KEY=sk-proj-你的生产环境 Key

# 后端服务端口
BACKEND_PORT=3001

# 生产环境标志
NODE_ENV=production
```

### 5. 启动服务（方案选择）

---

## 方案 A：PM2 管理（推荐）

### 安装 PM2

```bash
npm install -g pm2
```

### 创建 PM2 配置文件

创建 `ecosystem.config.js` 在项目根目录：

```javascript
module.exports = {
  apps: [{
    name: 'ecommerce-image-gen',
    cwd: './backend',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      BACKEND_PORT: 3001
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

### 启动服务

```bash
cd /var/www/ecommerce-image-gen

# 创建日志目录
mkdir -p logs

# 启动
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs ecommerce-image-gen
```

### PM2 常用命令

```bash
pm2 status              # 查看状态
pm2 logs                # 查看日志
pm2 restart app_name    # 重启
pm2 stop app_name       # 停止
pm2 delete app_name     # 删除
pm2 monit               # 监控面板
```

---

## 方案 B：Nginx 反向代理

### 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 配置 Nginx

创建 `/etc/nginx/sites-available/ecommerce-image-gen`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/ecommerce-image-gen/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/ecommerce-image-gen /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 启动后端（PM2）

```bash
cd /var/www/ecommerce-image-gen/backend
pm2 start server.js --name ecommerce-image-gen
pm2 startup
pm2 save
```

---

## 方案 C：Docker 部署（最简洁）

### 创建 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装前端
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install && npm run build

# 安装后端
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# 复制代码
COPY frontend/dist ./backend/frontend/dist
COPY backend/ ./backend/

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
```

### 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: always
    volumes:
      - ./logs:/app/logs
```

### 构建并运行

```bash
# 构建
docker-compose build

# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

---

## HTTPS 配置（Let's Encrypt）

### 安装 Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

### 获取证书

```bash
sudo certbot --nginx -d your-domain.com
```

### 自动续期

```bash
# 测试续期
sudo certbot renew --dry-run

# 已自动添加到 crontab
sudo crontab -l
```

---

## 部署检查清单

- [ ] 前端构建成功 (`npm run build`)
- [ ] 后端依赖安装 (`npm install --production`)
- [ ] `.env` 配置正确（API Key、端口、NODE_ENV）
- [ ] PM2 服务运行正常
- [ ] Nginx 配置完成（如使用）
- [ ] HTTPS 证书配置
- [ ] 防火墙开放 80/443 端口
- [ ] 测试 API 健康检查
- [ ] 测试图片生成功能
- [ ] 配置日志轮转
- [ ] 设置监控告警（可选）

---

## 日志管理

### PM2 日志

```bash
pm2 logs ecommerce-image-gen
pm2 logs ecommerce-image-gen --lines 100
```

### Nginx 日志

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 日志轮转（/etc/logrotate.d/ecommerce-image-gen）

```
/var/www/ecommerce-image-gen/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    postrotate
        pm2 reload ecommerce-image-gen > /dev/null
    endscript
}
```

---

## 监控告警（可选）

### PM2 + Keymetrics

```bash
pm2 link secret_key public_key
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 健康检查脚本

```bash
#!/bin/bash
# health-check.sh

RESPONSE=$(curl -s http://localhost:3001/api/health)
if [[ "$RESPONSE" == *"ok"* ]]; then
    echo "✅ Health check passed"
    exit 0
else
    echo "❌ Health check failed"
    exit 1
fi
```

### 添加到 crontab

```bash
*/5 * * * * /var/www/ecommerce-image-gen/health-check.sh
```

---

## 常见问题

### Q: 前端构建后路径错误？

A: 在 `vite.config.js` 添加：

```javascript
export default defineConfig({
  plugins: [react()],
  base: '/',  // 确保根路径正确
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
```

### Q: 跨域问题？

A: 后端已配置 CORS，生产环境 Nginx 反向代理后不会跨域。

### Q: 如何更新代码？

```bash
cd /var/www/ecommerce-image-gen

# 拉取新代码
git pull

# 重新构建前端
cd frontend
npm install
npm run build

# 重启后端
cd ../backend
npm install --production
pm2 restart ecommerce-image-gen
```

---

## 成本估算

按每天生成 100 张图片计算：
- DALL-E 3：$0.040/张
- 每日：100 × $0.040 = $4.00
- 每月：$4.00 × 30 = **$120.00**

服务器成本（参考）：
- 2 核 4G：约 ¥100/月
- 域名：约 ¥60/年

---

**文档版本**: 1.0  
**最后更新**: 2026-06-05  
**维护者**: 神秘杨团队
