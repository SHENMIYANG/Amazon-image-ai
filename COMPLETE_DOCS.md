# 亚马逊图片生成工作台 - 完整项目文档

**版本**: v1.0.0  
**更新日期**: 2026-06-05  
**技术栈**: React + Vite + Node.js + Express + GPT-Image-2

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [架构设计](#2-架构设计)
3. [API 配置说明](#3-api-配置说明)
4. [生成规则说明](#4-生成规则说明)
5. [程序运行逻辑](#5-程序运行逻辑)
6. [部署方法](#6-部署方法)
7. [故障排查](#7-故障排查)

---

## 1. 项目概述

### 1.1 核心定位

**把 GPT 网页端一张张生成亚马逊图片的手动流程，重构为批量生成的专业工作台**

### 1.2 核心功能

| 功能模块 | 说明 |
|---------|------|
| 产品图上传 | 必需，至少 1 张，支持多图 + 预览 |
| Listing 表单 | 10 个字段完整描述产品 |
| 风格选择 | 8 种预设风格一键选择 |
| 分辨率选择 | 2K/4K 可选，成本透明 |
| 7 张图策划 | 每张图独立规划场景/构图/色调/元素 |
| 合规检查 | 自动检查亚马逊图片规则 |
| 批量生成 | 一次提交生成 7 张图 |
| 单张重绘 | 某张不满意，单独重新生成 |
| API 配置 | 支持 OpenAI 及兼容接口 |

### 1.3 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React + Vite)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  产品上传   │  │  Listing    │  │  风格选择   │      │
│  │  组件       │  │  表单组件   │  │  组件       │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  分辨率     │  │  7 张图策划  │  │  合规检查   │      │
│  │  选择器     │  │  卡片组件   │  │  面板       │      │
│  ─────────────┘  └─────────────┘  └─────────────┘      │
│  ┌─────────────  ┌─────────────┐  ┌─────────────┐      │
│  │  生成按钮   │  │  任务网格   │  │  API 设置    │      │
│  │  组件       │  │  组件       │  │  弹窗       │      │
│  ─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP (JSON)
┌─────────────────────────────────────────────────────────┐
│                   后端 (Node.js + Express)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  /api/upload│  │  /api/      │  │  /api/      │      │
│  │  图片上传   │  │  generate   │  │  test-api-  │      │
│  │  (Multer)   │  │  图片生成   │  │  key        │      │
│  │             │  │  (GPT-2)    │  │  Key 测试   │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │  uploads/   │  │  .env       │                       │
│  │  图片存储   │  │  API Key    │                       │
│  ─────────────┘  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTPS
┌─────────────────────────────────────────────────────────┐
│              OpenAI GPT-Image-2 API                      │
│  POST /v1/images/generations                             │
│  - model: gpt-image-2                                    │
│  - prompt: 专业亚马逊图片 Prompt                         │
│  - image: Base64 产品参考图                              │
│  - size: 2048x2048 / 4096x4096                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 架构设计

### 2.1 项目结构

```
ecommerce-image-gen/
├── frontend/                     # 前端项目
│   ├── src/
│   │   ├── components/           # React 组件
│   │   │   ├── AmazonListingForm.jsx
│   │   │   ├── ComplianceCheckPanel.jsx
│   │   │   ├── GenerateButton.jsx
│   │   │   ├── ImagePlanCard.jsx
│   │   │   ├── ProductForm.jsx
│   │   │   ├── ProductImageUploader.jsx
│   │   │   ├── ResolutionSelector.jsx
│   │   │   ├── SettingsButton.jsx
│   │   │   ├── SettingsModal.jsx
│   │   │   ├── StyleSelector.jsx
│   │   │   └── TaskGrid.jsx
│   │   ├── utils/
│   │   │   ├── amazonCompliance.js   # 合规检查规则
│   │   │   └── apiConfig.js          # API 配置存储
│   │   ├── App.jsx                   # 主应用
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # 后端项目
│   ├── routes/
│   │   ├── generate.js           # 图片生成接口
│   │   ├── upload.js             # 图片上传接口
│   │   └── testApiKey.js         # API Key 测试接口
│   ├── uploads/                  # 上传存储目录
│   ├── .env                      # 环境变量（API Key）
│   ├── package.json
│   └── server.js                 # Express 服务器
│
├── .env.example                  # 环境变量模板
├── package.json                  # 根项目配置
├── ecosystem.config.js           # PM2 配置
├── Dockerfile                    # Docker 配置
├── docker-compose.yml            # Docker Compose
└── scripts/
    └── start-dev.js              # 开发启动脚本
```

### 2.2 数据流

```
用户操作 → 前端组件 → 状态管理 → API 请求 → 后端路由 → GPT API → 返回结果 → UI 更新

详细流程:
1. 用户上传产品图 → ProductImageUploader → FormData → POST /api/upload → 保存文件 → 返回 URL
2. 用户填写 Listing → AmazonListingForm → useState → 本地状态
3. 用户点击生成 → GenerateButton → 读取所有状态 → POST /api/generate
4. 后端接收请求 → 读取产品图 → 转 Base64 → 调用 GPT-Image-2 → 返回生成图 URL
5. 前端接收结果 → TaskGrid 组件 → 渲染图片卡片
```

### 2.3 状态管理

使用 React `useState` 管理核心状态：

```javascript
// App.jsx 核心状态
const [listing, setListing] = useState({...})           // Listing 信息
const [productImages, setProductImages] = useState([])  // 产品图
const [imagePlans, setImagePlans] = useState([...])     // 7 张图方案
const [selectedStyle, setSelectedStyle] = useState('')  // 风格
const [selectedResolution, setSelectedResolution] = useState('2k') // 分辨率
const [tasks, setTasks] = useState([])                  // 生成历史
const [apiConfig, setApiConfig] = useState({...})       // API 配置
```

---

## 3. API 配置说明

### 3.1 配置入口

1. 打开页面 **http://localhost:5175/**
2. 点击右上角 **⚙️** 设置按钮
3. 填写 API 配置信息

### 3.2 配置参数详解

| 参数 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| **API Base URL** | OpenAI 或兼容接口的基础 URL | `https://api.openai.com/v1` | ✅ |
| **API Endpoint** | Images API 端点 | `/images/generations` | ✅ |
| **API Key** | 认证密钥 | - | ✅ |
| **模型名称** | 使用的 AI 模型 | `gpt-image-2` | ✅ |
| **默认尺寸** | 输出图片尺寸 | `2048x2048` | ❌ |
| **默认质量** | 图片质量 | `high` | ❌ |

### 3.3 支持的 API 服务商

#### OpenAI 官方
```
Base URL: https://api.openai.com/v1
Endpoint: /images/generations
Model: gpt-image-2
```

#### OpenAI 兼容接口（如本地部署、第三方代理）
```
Base URL: https://your-api-proxy.com/v1
Endpoint: /images/generations
Model: gpt-image-2 或其他兼容模型
```

### 3.4 API Key 测试

点击 **"🧪 测试连接"** 按钮：

1. 前端发送配置到后端 `/api/test-api-key`
2. 后端代理调用 OpenAI API（避免 CORS 问题）
3. 返回测试结果（成功/失败 + 错误信息）

**成功响应**:
```json
{ "success": true, "message": "API Key 有效" }
```

**失败响应**:
```json
{ "success": false, "message": "Invalid API key" }
```

### 3.5 配置存储

- **存储位置**: 浏览器 localStorage
- **存储键**: `amazon-image-gen-config`
- **持久化**: 页面刷新不丢失
- **安全性**: 仅保存在本地，不上传服务器

### 3.6 获取 OpenAI API Key

1. 访问 https://platform.openai.com/api-keys
2. 登录 OpenAI 账号
3. 点击 "Create new secret key"
4. 复制 Key（格式：`sk-proj-xxxxxxxxxx`）
5. 粘贴到设置中

**注意**: API Key 只在本地存储，不会发送到任何第三方服务器（除了 OpenAI 官方 API）

---

## 4. 生成规则说明

### 4.1 GPT-Image-2 调用规则

#### 请求格式
```javascript
POST https://api.openai.com/v1/images/generations

Headers:
  Authorization: Bearer sk-proj-xxx
  Content-Type: application/json

Body:
{
  "model": "gpt-image-2",
  "prompt": "Professional Amazon product photography for...",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "n": 1,
  "size": "2048x2048",
  "quality": "high",
  "response_format": "url"
}
```

#### 响应格式
```javascript
{
  "data": [
    {
      "url": "https://oaidalle.com/..."
    }
  ]
}
```

### 4.2 Prompt 构建规则

#### 基础结构
```
Professional Amazon product photography for [产品名称]
. Category: [类目]
. Target audience: [目标受众]
. Key features: [卖点 1, 卖点 2, 卖点 3]
. Dimensions: [尺寸]
. Material: [材质]
. Scene: [场景描述]
. Composition: [构图要求]
. Color tone: [色调要求]
. Elements: [元素要求]
. Style: [风格关键词]
. US market style, American lifestyle  (根据市场)
. Ultra high quality, professional commercial photography, 8k resolution, photorealistic, detailed product showcase
```

#### 风格关键词映射

| 风格 | 关键词 |
|------|--------|
| minimalist | minimalist, clean, modern, simple, professional lighting |
| lifestyle | lifestyle, natural lighting, realistic, warm tone |
| premium | premium, luxury, elegant, sophisticated, dramatic lighting |
| vibrant | vibrant, colorful, energetic, eye-catching, bright |
| natural | natural, eco-friendly, organic, earth tone, sustainable |
| tech | futuristic, tech, digital, innovation, blue tone, neon |
| cozy | cozy, warm, comfortable, homey, soft lighting |
| professional | professional, business, corporate, clean, trustworthy |

### 4.3 市场特定规则

| 市场 | Prompt 修饰 |
|------|------------|
| US | US market style, American lifestyle |
| EU | European market style, minimalist design |
| JP | Japanese market style, clean and detailed |

### 4.4 图片参考规则

- **必需性**: 必须上传至少 1 张产品图
- **格式**: JPEG/PNG/GIF/WEBP
- **大小**: 单张不超过 10MB
- **数量**: 最多 10 张
- **用途**: GPT-Image-2 基于产品图生成，确保产品一致性

### 4.5 分辨率规则

| 分辨率 | 尺寸 | 主图价格 | 辅图价格 | 适用场景 |
|--------|------|----------|----------|----------|
| 2K | 2048x2048 | $0.08 | $0.06 | 亚马逊主图（推荐） |
| 4K | 4096x4096 | $0.16 | $0.12 | 高精度需求、放大展示 |

**成本计算**:
```
7 张图（1 主图 + 6 辅图）:
- 2K: 1×$0.08 + 6×$0.06 = $0.44
- 4K: 1×$0.16 + 6×$0.12 = $0.88
```

---

## 5. 程序运行逻辑

### 5.1 开发环境启动流程

```bash
# 1. 执行 npm run dev
npm run dev

# 2. concurrently 启动两个子进程
├── npm run dev:backend → cd backend && node --watch server.js
│   └── Express 服务器启动在 3001 端口
│
└── npm run dev:frontend → cd frontend && vite
    └── Vite 开发服务器启动在 5173 端口（占用则自动切换）

# 3. 热更新监听
├── 后端：node --watch 监听 .js 文件变化 → 自动重启
└── 前端：Vite HMR 监听 .jsx/.css 变化 → 局部刷新
```

### 5.2 图片生成完整流程

```
┌─────────────────────────────────────────────────────────┐
│ 第 1 步：用户上传产品图                                   │
│ - 选择文件 → ProductImageUploader                       │
│ - FormData 打包 → POST /api/upload                      │
│ - Multer 接收 → 保存到 backend/uploads/                 │
│ - 返回 URL: /uploads/xxx.jpg                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 第 2 步：用户填写完整信息                                 │
│ - Listing 表单（10 个字段）                              │
│ - 7 张图策划方案                                         │
│ - 选择风格、分辨率                                       │
│ - 所有状态保存在 App.jsx useState                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 第 3 步：用户点击"开始生成"                               │
│ - handleGenerate() 被调用                               │
│ - 读取所有状态（listing, imagePlans, apiConfig 等）      │
│ - 再次上传图片（确保最新）                              │
│ - POST /api/generate 发送完整数据                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 第 4 步：后端处理生成请求                                 │
│ - 验证输入（listing, imagePlans, referenceImages）      │
│ - 验证 API Key（apiConfig.apiKey 或 process.env）       │
│ - 循环处理每张图（7 次）：                              │
│   1. buildAmazonPrompt() 构建 Prompt                    │
│   2. 读取产品图 → Base64                                │
│   3. callGPTImage2() 调用 API                           │
│   4. 收集返回的 imageUrl                                │
│ - 返回 { success: true, images: [...] }                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 第 5 步：前端更新 UI                                     │
│ - 接收响应数据                                          │
│ - setTasks() 添加到任务列表                             │
│ - TaskGrid 组件渲染新任务卡片                           │
│ - 显示 7 张生成图 + Prompt                               │
└─────────────────────────────────────────────────────────┘
```

### 5.3 单张重新生成流程

```
用户点击某张图的"🔄 重新生成"按钮
  ↓
handleRegenerate(imageId)
  ↓
找到对应 imagePlan（仅 1 张）
  ↓
POST /api/generate（imagePlans 数组只有 1 个元素）
  ↓
后端生成 1 张图
  ↓
alert("图 X 重新生成成功！")
  ↓
（未来版本：自动更新 TaskGrid 中的对应图片）
```

### 5.4 API Key 测试流程

```
用户点击"🧪 测试连接"
  ↓
handleTest()
  ↓
POST /api/test-api-key（发送 baseUrl, apiKey, model）
  ↓
后端 axios.post(`${baseUrl}/images/generations`, ...)
  ↓
OpenAI API 响应
  ↓
成功 → { success: true }
失败 → { success: false, message: "错误原因" }
  ↓
前端显示 ✅ 或 ❌
```

---

## 6. 部署方法

### 6.1 开发环境部署

#### 前置要求
- Node.js 18+ 
- npm 或 yarn
- 有效的 OpenAI API Key

#### 安装步骤
```bash
# 1. 克隆/进入项目
cd C:\Users\20250307\.todeskai\ecommerce-image-gen

# 2. 安装所有依赖
npm run install:all

# 3. 配置 API Key
cd backend
echo OPENAI_API_KEY=sk-proj-xxx > .env

# 4. 启动开发服务
cd ..
npm run dev
```

#### 访问地址
- 前端：http://localhost:5173/
- 后端 API：http://localhost:3001/api/
- 健康检查：http://localhost:3001/api/health

### 6.2 生产环境部署（Linux）

#### 方案 A: PM2 部署（推荐）

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 构建前端
cd frontend
npm run build

# 3. 设置环境变量
export NODE_ENV=production
export OPENAI_API_KEY=sk-proj-xxx
export BACKEND_PORT=3001

# 4. 启动服务
cd ..
pm2 start ecosystem.config.js

# 5. 查看状态
pm2 status
pm2 logs
```

#### 方案 B: Docker 部署

```bash
# 1. 构建镜像
docker-compose build

# 2. 启动容器
docker-compose up -d

# 3. 查看日志
docker-compose logs -f
```

#### 方案 C: 传统部署

```bash
# 1. 上传代码到服务器
scp -r ecommerce-image-gen/ user@server:/var/www/

# 2. SSH 登录服务器
ssh user@server

# 3. 安装依赖
cd /var/www/ecommerce-image-gen
npm run install:all

# 4. 构建前端
cd frontend
npm run build

# 5. 配置环境变量
cd ../backend
echo "OPENAI_API_KEY=sk-proj-xxx" > .env
echo "NODE_ENV=production" >> .env

# 6. 启动服务
cd ..
npm start

# 或使用 systemd 服务
sudo systemctl start ecommerce-image-gen
```

### 6.3 生产环境配置

#### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### HTTPS 配置（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 6.4 图片存储方案

#### 开发环境
- 本地存储：`backend/uploads/`
- 访问：`http://localhost:3001/uploads/xxx.jpg`

#### 生产环境（推荐对象存储）

**AWS S3**:
```javascript
// 修改 backend/routes/upload.js
import AWS from 'aws-sdk'
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: 'us-east-1'
})
// 上传到 S3，返回 CDN URL
```

**阿里云 OSS**:
```javascript
import OSS from 'ali-oss'
const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY,
  accessKeySecret: process.env.OSS_SECRET,
  bucket: 'your-bucket'
})
```

**七牛云**:
```javascript
import qiniu from 'qiniu'
// 配置七牛云上传
```

---

## 7. 故障排查

### 7.1 常见问题

#### 问题 1: 端口被占用
```
Error: listen EADDRINUSE: address already in use :::3001
```
**解决**:
```bash
# Windows
netstat -ano | findstr :3001
taskkill /F /PID [进程 ID]

# Linux
lsof -i :3001
kill -9 [PID]
```

#### 问题 2: API Key 无效
```
 失败：Invalid API key
```
**解决**:
1. 检查 API Key 是否正确复制（包含 `sk-proj-` 前缀）
2. 检查 OpenAI 账号余额
3. 确认 API Key 未过期

#### 问题 3: 图片上传失败
```
图片上传失败
```
**解决**:
1. 检查文件格式（只支持 JPG/PNG/GIF/WEBP）
2. 检查文件大小（不超过 10MB）
3. 检查 `backend/uploads/` 目录权限

#### 问题 4: 生成超时
```
请求超时，请检查网络或 API 地址
```
**解决**:
1. 检查网络连接
2. 确认 API Base URL 可访问
3. 增加超时时间（generate.js 中 timeout: 60000）

#### 问题 5: CORS 错误
```
Access to fetch at '...' has been blocked by CORS policy
```
**解决**:
- 前端不要直接调用 OpenAI API
- 必须通过后端代理（已实现）

### 7.2 日志查看

#### 开发环境
- 前端日志：浏览器控制台（F12）
- 后端日志：终端输出

#### 生产环境（PM2）
```bash
pm2 logs ecommerce-image-gen
pm2 logs --lines 100
```

#### Docker
```bash
docker-compose logs -f
docker-compose logs backend
docker-compose logs frontend
```

### 7.3 性能优化

#### 前端优化
- 启用 Vite 构建压缩
- 图片懒加载
- 组件按需加载

#### 后端优化
- 启用 Gzip 压缩
- 图片 CDN 加速
- API 响应缓存

#### 数据库（未来版本）
- 任务历史存储
- 用户配置管理
- 图片元数据

---

##  技术支持

如有问题，请检查：
1. 本文档的故障排查章节
2. 后端日志（错误信息最准确）
3. 浏览器控制台（前端错误）

**文档版本**: v1.0.0  
**最后更新**: 2026-06-05
