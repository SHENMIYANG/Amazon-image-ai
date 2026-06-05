# 部署指南

## 部署方案对比

| 方案 | 适用场景 | 难度 | 耗时 |
|------|---------|------|------|
| 本地开发 | 个人使用/测试 | ⭐ | 5 分钟 |
| PM2 生产环境 | 团队共享/长期使用 | ⭐⭐ | 15 分钟 |
| Docker | 服务器/云部署 | ⭐⭐⭐ | 20 分钟 |
| 云平台 | 公开服务 | ⭐⭐⭐ | 30 分钟 |

---

## 方案一：本地开发环境（推荐个人使用）

### 步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/SHENMIYANG/Amazon-image-ai.git
   cd Amazon-image-ai
   ```

2. **安装依赖**
   ```bash
   npm run install:all
   ```

3. **启动服务**
   - Windows: 双击 `start-amazon-image-studio.bat`
   - macOS/Linux: `./start-amazon-image-studio.sh`

4. **访问应用**
   - 浏览器打开：http://localhost:5173

### 优点
- 最简单快速
- 无需配置
- 适合测试和学习

### 缺点
- 需要手动启动
- 关闭终端服务停止

---

## 方案二：PM2 生产环境（推荐团队使用）

### 前提条件

- Node.js 20+
- npm 9+
- PM2 (`npm install -g pm2`)

### 步骤

1. **构建前端**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **安装后端依赖**
   ```bash
   cd ../backend
   npm install --production
   ```

3. **配置环境变量**
   
   创建 `backend/.env` 文件：
   ```env
   NODE_ENV=production
   BACKEND_PORT=3001
   OPENAI_API_KEY=sk-proj-your-api-key-here
   ```

4. **启动服务**
   ```bash
   cd ..
   pm2 start ecosystem.config.js --name amazon-image-studio
   pm2 startup
   pm2 save
   ```

5. **设置开机自启**
   ```bash
   pm2 startup
   # 按提示执行生成的命令
   ```

6. **访问应用**
   - http://localhost:3001

### 管理命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs amazon-image-studio

# 重启服务
pm2 restart amazon-image-studio

# 停止服务
pm2 stop amazon-image-studio

# 删除服务
pm2 delete amazon-image-studio
```

### 优点
- 后台运行
- 开机自启
- 自动重启
- 日志管理

### 缺点
- 需要配置 PM2
- 仅单服务器

---

## 方案三：Docker 部署（推荐服务器）

### 前提条件

- Docker Desktop (本地)
- Docker + Docker Compose (服务器)

### 步骤

1. **构建镜像**
   ```bash
   docker-compose build
   ```

2. **启动服务**
   ```bash
   # 方式一：使用环境变量
   OPENAI_API_KEY=sk-proj-xxx docker-compose up -d
   
   # 方式二：编辑 .env 文件
   docker-compose up -d
   ```

3. **查看日志**
   ```bash
   docker-compose logs -f
   ```

4. **访问应用**
   - http://localhost:3001

### Docker Compose 配置

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
      - BACKEND_PORT=3001
    restart: always
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/backend/uploads
```

### 优点
- 环境隔离
- 一次构建到处运行
- 易于扩展和维护

### 缺点
- 需要学习 Docker
- 镜像较大（约 500MB）

---

## 方案四：云平台部署

### Vercel 部署（前端 + Serverless）

1. **安装 Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **部署**
   ```bash
   cd frontend
   vercel
   ```

3. **配置环境变量**
   - 在 Vercel 控制台添加 `OPENAI_API_KEY`

### Railway 部署（一键部署）

1. **连接 GitHub 仓库**
   - 访问 https://railway.app
   - 连接 GitHub 账号
   - 选择 `Amazon-image-ai` 仓库

2. **配置环境变量**
   - 添加 `OPENAI_API_KEY`
   - 添加 `NODE_ENV=production`

3. **自动部署**
   - Railway 自动构建和部署

### Render 部署

1. **创建 Web Service**
   - 连接 GitHub 仓库
   - 选择根目录

2. **配置**
   - Build Command: `npm run install:all && npm run build`
   - Start Command: `npm start`

3. **环境变量**
   - 添加 `OPENAI_API_KEY`

### 优点
- 无需维护服务器
- 自动扩展
- 全球 CDN

### 缺点
- 可能有费用
- 配置相对复杂

---

## 常见问题

### 1. 端口被占用

**问题**: 启动时提示端口 3001 或 5173 已被占用

**解决**:
```bash
# Windows - 查找占用进程
netstat -ano | findstr :3001
taskkill /F /PID <进程 ID>

# macOS/Linux
lsof -i :3001
kill -9 <进程 ID>

# 或修改端口
# 编辑 backend/.env 添加 BACKEND_PORT=3002
```

### 2. 依赖安装失败

**问题**: `npm install` 失败

**解决**:
```bash
# 清除缓存
npm cache clean --force

# 使用淘宝镜像
npm config set registry https://registry.npmmirror.com

# 重新安装
npm ci
```

### 3. 跨域问题

**问题**: 前端无法访问后端 API

**解决**:
- 检查后端 CORS 配置
- 确保前后端端口正确
- 生产环境使用同域名

### 4. API Key 无效

**问题**: 测试连接失败

**解决**:
- 确认 Key 格式正确（`sk-proj-` 或 `sk-` 开头）
- 检查账户余额
- 确认 API Endpoint 正确

---

## 生产环境检查清单

部署前确认：

- [ ] Node.js 版本 >= 20
- [ ] 所有依赖已安装
- [ ] 前端已构建 (`npm run build`)
- [ ] 环境变量已配置
- [ ] API Key 已设置且有效
- [ ] 防火墙端口已开放
- [ ] 日志目录可写
- [ ] 服务已启动并运行正常
- [ ] 能够正常访问应用
- [ ] 图片生成功能测试通过

---

## 性能优化建议

1. **使用 CDN**: 静态资源使用 CDN 加速
2. **图片压缩**: 生成的图片自动压缩
3. **缓存策略**: 设置合理的缓存头
4. **并发限制**: 控制同时生成的图片数量
5. **日志轮转**: 定期清理日志文件

---

## 安全建议

1. **API Key 保护**: 不要提交到 Git
2. **HTTPS**: 生产环境使用 HTTPS
3. **访问控制**: 添加登录验证
4. **速率限制**: 防止 API 滥用
5. **定期更新**: 保持依赖最新
