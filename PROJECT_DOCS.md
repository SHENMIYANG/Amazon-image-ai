# 电商图片生成工具 - 完整项目文档

## 📑 目录

1. [架构设计](#1-架构设计)
2. [API 设置说明](#2-api-设置说明)
3. [生成规则说明](#3-生成规则说明)
4. [程序运行逻辑](#4-程序运行逻辑)
5. [本地部署测试](#5-本地部署测试)
6. [生产环境发布](#6-生产环境发布)

---

## 1. 架构设计

### 1.1 技术架构图

```
┌─────────────────────────────────────────────────────────┐
│                      用户浏览器                          │
│                   http://localhost:5173                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              前端 (React + Vite)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  UI 组件层                                        │   │
│  │  - ProductForm (产品信息表单)                     │   │
│  │  - ImagePlanCard (7 张图片方案卡片)                │   │
│  │  - TaskGrid (任务列表)                            │   │
│  │  - GenerateButton (生成按钮)                      │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  状态管理层                                       │   │
│  │  - product: 产品信息 state                        │   │
│  │  - imagePlans: 7 张图片方案 state                  │   │
│  │  - tasks: 生成任务历史 state                       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Prompt 组装层                                    │   │
│  │  产品信息 + ImagePlan 1-7 → 完整 Prompt            │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ POST /api/generate
                     ▼
┌─────────────────────────────────────────────────────────┐
│         后端代理 (Node.js + Express)                     │
│              http://localhost:3001                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  API 路由层                                       │   │
│  │  - POST /api/generate                            │   │
│  │  - GET /api/health                               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  安全层                                           │   │
│  │  - CORS 配置                                      │   │
│  │  - API Key 保护 (不暴露给前端)                      │   │
│  │  - 请求验证                                       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  OpenAI API 转发层                                 │   │
│  │  - 调用 DALL-E 3 API                               │   │
│  │  - 错误处理                                       │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              OpenAI DALL-E 3 API                         │
│           https://api.openai.com/v1                      │
└─────────────────────────────────────────────────────────┘
```

### 1.2 核心设计决策

| 设计点 | 方案 | 理由 |
|--------|------|------|
| **前后端分离** | React 前端 + Express 后端 | 职责清晰，便于独立部署和扩展 |
| **API Key 保护** | 后端代理模式 | 避免 Key 暴露在前端代码中 |
| **7 张 ImagePlan** | 结构化表单 | 运营手动填写，跳过 AI 策划，适合团队协作 |
| **Prompt 组装** | 前端自动拼装 | 减少后端计算压力，前端更懂业务逻辑 |
| **开发环境** | Vite HMR + Express watch | 快速热更新，提升开发效率 |

### 1.3 数据流

```
用户填写表单 → State 更新 → 点击生成 → 
Prompt 组装 → POST /api/generate → 
后端验证 → 调用 OpenAI API → 
返回图片 URL → 更新任务列表 → 展示结果
```

---

## 2. API 设置说明

### 2.1 OpenAI API Key 获取

1. 访问 https://platform.openai.com/api-keys
2. 登录/注册 OpenAI 账号
3. 点击 "Create new secret key"
4. 复制 Key（格式：`sk-proj-xxxxxxxx` 或 `sk-xxxxxxxx`）
5. **重要**: Key 只显示一次，立即保存到安全位置

### 2.2 本地开发配置

编辑 `backend/.env` 文件：

```bash
# OpenAI API Key
OPENAI_API_KEY=sk-proj-你的真实 API Key

# 后端服务端口
BACKEND_PORT=3001

# 前端开发服务器端口
FRONTEND_PORT=5173
```

### 2.3 API 接口文档

#### POST /api/generate

**请求格式:**
```json
{
  "product": {
    "name": "智能保温杯",
    "sellingPoints": "24 小时保温，智能测温，轻便携带",
    "targetAudience": "25-35 岁上班族，注重健康生活的年轻人"
  },
  "imagePlans": [
    {
      "id": 1,
      "scene": "办公室桌面",
      "composition": "中心构图",
      "colorTone": "暖色调",
      "elements": "产品主体，笔记本电脑，咖啡杯，绿植"
    },
    // ... 共 7 张
  ]
}
```

**响应格式 (成功):**
```json
{
  "success": true,
  "imageUrl": "https://oaidalleapiprodscus.blob.core.windows.net/...",
  "prompt": "Professional e-commerce product photography for 智能保温杯...",
  "timestamp": "2026-06-05T07:49:00.000Z"
}
```

**响应格式 (失败):**
```json
{
  "error": "OpenAI API error",
  "message": "Invalid API key provided"
}
```

#### GET /api/health

**健康检查接口**

响应:
```json
{
  "status": "ok",
  "timestamp": "2026-06-05T07:49:00.000Z"
}
```

### 2.4 API 调用限制

| 项目 | 限制 |
|------|------|
| **DALL-E 3 调用频率** | 标准账户：每分钟 60 次 |
| **单张图片生成时间** | 约 10-30 秒 |
| **图片分辨率** | 1024x1024 (标准), 1792x1024 (宽屏), 1024x1792 (竖屏) |
| **费用** | 约 $0.040/张 (标准质量) |

---

## 3. 生成规则说明

### 3.1 Prompt 组装规则

前端根据用户输入自动拼装 Prompt，规则如下：

```javascript
function buildPrompt(product, imagePlans) {
  // 1. 基础产品描述
  let prompt = `Professional e-commerce product photography for ${product.name}`
  
  // 2. 添加卖点 (如果有)
  if (product.sellingPoints) {
    prompt += `. Key features: ${product.sellingPoints}`
  }
  
  // 3. 添加目标人群 (如果有)
  if (product.targetAudience) {
    prompt += `. Target audience: ${product.targetAudience}`
  }
  
  // 4. 添加 7 张图片的详细要求
  const activePlans = imagePlans.filter(plan => 
    plan.scene || plan.composition || plan.colorTone || plan.elements
  )
  
  if (activePlans.length > 0) {
    prompt += '. Visual requirements:'
    activePlans.forEach(plan => {
      const parts = []
      if (plan.scene) parts.push(`Scene: ${plan.scene}`)
      if (plan.composition) parts.push(`Composition: ${plan.composition}`)
      if (plan.colorTone) parts.push(`Color tone: ${plan.colorTone}`)
      if (plan.elements) parts.push(`Elements: ${plan.elements}`)
      
      if (parts.length > 0) {
        prompt += ` [Image ${plan.id}] ${parts.join(', ')}.`
      }
    })
  }
  
  // 5. 添加通用质量要求
  prompt += '. High quality, professional lighting, commercial photography style, ultra detailed, 8k resolution.'
  
  return prompt
}
```

### 3.2 Prompt 示例

**输入:**
- 产品名称：智能保温杯
- 卖点：24 小时保温，智能测温，轻便携带
- 目标人群：25-35 岁上班族
- ImagePlan 1: 办公室桌面，中心构图，暖色调，产品主体 + 笔记本电脑 + 咖啡杯

**生成的 Prompt:**
```
Professional e-commerce product photography for 智能保温杯. Key features: 24 小时保温，智能测温，轻便携带。Target audience: 25-35 岁上班族。Visual requirements: [Image 1] Scene: 办公室桌面，Composition: 中心构图，Color tone: 暖色调，Elements: 产品主体，笔记本电脑，咖啡杯. High quality, professional lighting, commercial photography style, ultra detailed, 8k resolution.
```

### 3.3 图片生成参数

```javascript
{
  model: 'dall-e-3',        // DALL-E 第三代
  n: 1,                      // 每次生成 1 张
  size: '1024x1024',        // 标准正方形
  quality: 'standard'       // 标准质量 (可选：standard, hd)
}
```

---

## 4. 程序运行逻辑

### 4.1 前端运行逻辑

```
┌─────────────────────────────────────────┐
│  1. 应用初始化                            │
│     - 加载 React 组件树                   │
│     - 初始化 state (product, imagePlans) │
│     - 渲染 UI                            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  2. 用户填写表单                          │
│     - 输入产品信息 → 更新 product state  │
│     - 填写 7 张 ImagePlan → 更新 imagePlans│
│     - 实时响应式更新 UI                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  3. 点击"开始生成图片"                    │
│     - 验证必填字段                        │
│     - 设置 generating = true             │
│     - 禁用按钮防止重复点击                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  4. 组装 Prompt                          │
│     - 读取 product state                 │
│     - 读取 imagePlans state              │
│     - 调用 buildPrompt() 函数             │
│     - 生成完整 Prompt 字符串               │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  5. 发送 API 请求                          │
│     - fetch('/api/generate', POST)      │
│     - Body: { product, imagePlans }     │
│     - 等待后端响应 (10-30 秒)             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  6. 处理响应                             │
│     - 成功：添加任务到 tasks state        │
│     - 失败：显示错误提示                  │
│     - 设置 generating = false            │
│     - 启用按钮                           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  7. 展示结果                             │
│     - TaskGrid 组件渲染任务列表           │
│     - 显示生成的图片                      │
│     - 显示 Prompt 内容                     │
└─────────────────────────────────────────┘
```

### 4.2 后端运行逻辑

```
┌─────────────────────────────────────────┐
│  1. 服务器启动                            │
│     - 加载 .env 环境变量                 │
│     - 初始化 Express 应用                 │
│     - 配置 CORS 中间件                     │
│     - 注册路由                           │
│     - 监听端口 3001                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  2. 接收请求                             │
│     - POST /api/generate                │
│     - 解析 JSON Body                     │
│     - 验证 product 和 imagePlans 存在      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  3. 调用 OpenAI API                       │
│     - 构建 DALL-E 3 请求体                 │
│     - 添加 Authorization Header          │
│     - 发送 HTTPS POST 请求                │
│     - 等待响应 (10-30 秒)                  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  4. 处理响应                             │
│     - 成功：提取 imageUrl                │
│     - 失败：捕获错误并格式化              │
│     - 记录日志                           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  5. 返回结果                             │
│     - 成功：返回 { success, imageUrl }   │
│     - 失败：返回 { error, message }      │
│     - 设置 appropriate HTTP 状态码         │
└─────────────────────────────────────────┘
```

### 4.3 状态管理

```javascript
// 前端 state 结构
const [product, setProduct] = useState({
  name: '',              // 产品名称
  sellingPoints: '',     // 卖点 (逗号分隔)
  targetAudience: ''     // 目标人群
})

const [imagePlans, setImagePlans] = useState([
  { id: 1, scene: '', composition: '', colorTone: '', elements: '' },
  { id: 2, scene: '', composition: '', colorTone: '', elements: '' },
  // ... 共 7 张
])

const [tasks, setTasks] = useState([])  // 生成历史
// [{ id, status, imageUrl, prompt, createdAt }]

const [generating, setGenerating] = useState(false)  // 生成中状态
```

---

## 5. 本地部署测试

### 5.1 环境要求

| 组件 | 版本要求 | 检查命令 |
|------|----------|----------|
| Node.js | >= 18.0.0 | `node -v` |
| npm | >= 9.0.0 | `npm -v` |
| 浏览器 | Chrome/Firefox/Edge 最新版 | - |

### 5.2 安装步骤

```bash
# 1. 克隆/复制项目到本地
cd C:\Users\20250307\.todeskai\ecommerce-image-gen

# 2. 安装前端依赖
cd frontend
npm install

# 3. 安装后端依赖
cd ..\backend
npm install

# 4. 配置环境变量
# 编辑 backend\.env 文件，填入 OpenAI API Key
```

### 5.3 启动服务

**方式一：手动启动 (推荐开发使用)**

```bash
# 终端 1 - 启动后端
cd C:\Users\20250307\.todeskai\ecommerce-image-gen\backend
npm run dev
# 输出：🚀 Backend server running on port 3001

# 终端 2 - 启动前端
cd C:\Users\20250307\.todeskai\ecommerce-image-gen\frontend
npm run dev
# 输出：VITE ready in xxx ms
#       Local: http://localhost:5173/
```

**方式二：一键启动脚本 (可选)**

创建 `start.bat` (Windows):
```batch
@echo off
start "Backend" cmd /k "cd backend && npm run dev"
start "Frontend" cmd /k "cd frontend && npm run dev"
echo 服务启动中...
```

### 5.4 测试验证

1. **访问应用**: 打开浏览器 http://localhost:5173
2. **检查后端**: 访问 http://localhost:3001/api/health
   - 预期返回：`{"status":"ok","timestamp":"..."}`
3. **测试生成**:
   - 填写产品信息
   - 填写至少 1 张 ImagePlan
   - 点击"开始生成图片"
   - 等待 10-30 秒
   - 查看生成的图片

### 5.5 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 前端无法访问后端 | 后端未启动 | 检查后端终端是否运行 |
| API Key 错误 | Key 无效或过期 | 重新生成 API Key |
| CORS 错误 | 端口不匹配 | 确保前端 5173，后端 3001 |
| 生成超时 | 网络问题 | 检查网络连接，重试 |

---

## 6. 生产环境发布

### 6.1 部署架构

```
┌─────────────────────────────────────────────────────┐
│                  生产环境架构                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐     ┌─────────────┐               │
│  │   Nginx     │     │   Node.js   │               │
│  │  反向代理   │────▶│  后端服务   │               │
│  │  :80/:443   │     │  :3001      │               │
│  └─────────────┘     └──────┬──────┘               │
│         ▲                   │                       │
│         │                   ▼                       │
│         │            ┌─────────────┐               │
│         │            │   OpenAI    │               │
│         │            │    API      │               │
│         │            └─────────────┘               │
│         │                                          │
│         │    ┌─────────────┐                       │
│         └────│  前端静态   │                       │
│              │  文件服务   │                       │
│              └─────────────┘                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.2 前端构建

```bash
cd frontend

# 1. 构建生产版本
npm run build
# 输出：dist/ 目录 (包含打包后的静态文件)

# 2. 验证构建
npm run preview
# 本地预览生产构建
```

构建产物:
```
dist/
├── index.html          # 入口 HTML
├── assets/
│   ├── index-xxxx.js   # 打包后的 JS
│   ├── index-xxxx.css  # 打包后的 CSS
│   └── ...             # 其他资源
└── vite.svg
```

### 6.3 后端部署

#### 方案 A: PM2 进程管理 (推荐)

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 进入后端目录
cd backend

# 3. 启动服务
pm2 start server.js --name ecommerce-image-gen

# 4. 设置开机自启
pm2 startup
pm2 save

# 5. 查看状态
pm2 status
pm2 logs ecommerce-image-gen
```

#### 方案 B: Systemd 服务 (Linux)

创建 `/etc/systemd/system/ecommerce-image-gen.service`:

```ini
[Unit]
Description=Ecommerce Image Gen Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ecommerce-image-gen
sudo systemctl start ecommerce-image-gen
sudo systemctl status ecommerce-image-gen
```

### 6.4 Nginx 配置

创建 `/etc/nginx/sites-available/ecommerce-image-gen`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
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
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置:
```bash
sudo ln -s /etc/nginx/sites-available/ecommerce-image-gen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.5 HTTPS 配置 (Let's Encrypt)

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期 (已自动添加到 crontab)
sudo certbot renew --dry-run
```

### 6.6 环境变量管理

**生产环境 `.env` 配置:**

```bash
# OpenAI API Key (使用环境变量或密钥管理服务)
OPENAI_API_KEY=sk-proj-生产环境 Key

# 后端服务端口
BACKEND_PORT=3001

# 生产环境标志
NODE_ENV=production

# 可选：日志级别
LOG_LEVEL=info
```

**安全建议:**
- 不要将 `.env` 提交到 Git
- 使用密钥管理服务 (AWS Secrets Manager, Azure Key Vault)
- 定期轮换 API Key

### 6.7 部署检查清单

- [ ] 前端构建成功 (`npm run build`)
- [ ] 后端依赖安装 (`npm install --production`)
- [ ] 环境变量配置正确
- [ ] Nginx 配置完成
- [ ] HTTPS 证书配置
- [ ] PM2/Systemd 服务运行正常
- [ ] 防火墙开放 80/443 端口
- [ ] 测试 API 健康检查
- [ ] 测试图片生成功能
- [ ] 配置日志轮转
- [ ] 设置监控告警

### 6.8 监控与日志

**PM2 日志:**
```bash
pm2 logs ecommerce-image-gen
pm2 logs ecommerce-image-gen --lines 100
```

**Nginx 日志:**
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

**应用监控 (可选):**
- 使用 Sentry 错误追踪
- 使用 Prometheus + Grafana 监控
- 使用 New Relic APM

---

## 附录

### A. 项目文件清单

```
ecommerce-image-gen/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ProductForm.jsx
│   │   │   ├── ProductForm.css
│   │   │   ├── ImagePlanCard.jsx
│   │   │   ├── ImagePlanCard.css
│   │   │   ├── TaskGrid.jsx
│   │   │   ├── TaskGrid.css
│   │   │   ├── GenerateButton.jsx
│   │   │   └── GenerateButton.css
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env (开发环境)
├── backend/
│   ├── routes/
│   │   └── generate.js
│   ├── server.js
│   ├── package.json
│   └── .env (环境变量)
├── .env.example
├── IMAGE_GEN_DESIGN.md
├── README.md
└── PROJECT_DOCS.md (本文档)
```

### B. 常用命令速查

```bash
# 开发环境
cd frontend && npm run dev     # 启动前端开发服务器
cd backend && npm run dev      # 启动后端开发服务器

# 生产构建
cd frontend && npm run build   # 构建生产版本

# 依赖管理
npm install                    # 安装依赖
npm audit fix                  # 修复安全漏洞

# PM2 管理
pm2 start server.js --name ecommerce-image-gen
pm2 stop ecommerce-image-gen
pm2 restart ecommerce-image-gen
pm2 logs ecommerce-image-gen
```

### C. 成本估算

按每天生成 100 张图片计算:
- 单张成本：$0.040 (DALL-E 3 标准质量)
- 每日成本：100 × $0.040 = $4.00
- 每月成本：$4.00 × 30 = $120.00

**优化建议:**
- 使用标准质量而非 HD
- 批量生成减少 API 调用次数
- 缓存已生成的图片
- 设置每日预算上限

---

**文档版本**: 1.0  
**最后更新**: 2026-06-05  
**维护者**: 神秘杨团队
