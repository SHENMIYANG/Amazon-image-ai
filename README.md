# Amazon Image AI 🚀

亚马逊电商图片 AI 生成工具 - 基于 GPT-Image-2 和营销策略库自动生成高质量商品主图

![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)
![React](https://img.shields.io/badge/React-18-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ 核心功能

- 📝 **智能 Listing 表单** - 3 步填写产品信息（产品→卖点→策略）
- 🎨 **7 种营销策略** - 通用基础/卖点聚焦/信息图/生活方式/科技感/高端奢华/时尚
-  **3 级复杂度控制** - L1 极速版/L2 标准版/L3 精品版，灵活控制成本
- 🤖 **AI 智能分析** - 一键生成 7 张图片的详细视觉策略
- 🔍 **合规检查** - 自动检测图片是否符合亚马逊平台规范
-  **拖拽上传** - 支持拖拽上传产品图，自动压缩优化
- ️ **API 配置** - 支持 OpenAI 及兼容接口，灵活配置

## 📸 效果预览

![产品界面](./docs/screenshot.png)

## 🚀 快速开始

### 方式一：AI 编程工具一键安装（推荐）

如果你使用 **Codex / Claude Code / OpenClaw** 等 AI 编程工具，直接复制以下指令：

```
请把这个 GitHub 项目安装到我的本地电脑并启动：
https://github.com/SHENMIYANG/Amazon-image-ai

要求：
1. 先确认本机已经安装 Node.js 20 LTS 或更新版本和 npm
2. 如果本地还没有项目，就 clone 仓库；如果已经下载 ZIP 或源码文件夹，直接进入现有项目目录
3. 在项目目录运行 npm ci 安装依赖
4. 如果我是 Windows 用户，优先检查仓库里的 start-amazon-image-studio.bat，能用的话帮我用它启动项目
5. 如果不使用 bat 脚本，就运行 npm run dev 启动项目
6. 告诉我浏览器应该打开哪个本地地址
```

### 方式二：手动安装（通用）

#### 1. 环境要求

- **Node.js**: 20 LTS 或更高版本
- **npm**: 9.0+（随 Node.js 一起安装）
- **操作系统**: Windows 10/11, macOS 10.15+, Linux

检查 Node.js 版本：
```bash
node --version  # 应该显示 v20.x.x 或更高
npm --version   # 应该显示 9.x.x 或更高
```

#### 2. 下载项目

**选项 A - Git Clone（推荐）**
```bash
git clone https://github.com/SHENMIYANG/Amazon-image-ai.git
cd Amazon-image-ai
```

**选项 B - 下载 ZIP**
- 点击仓库页面的 **Code** → **Download ZIP**
- 解压到任意目录
- 打开终端进入项目目录

#### 3. 安装依赖

```bash
# 安装依赖（首次运行）
npm ci
```

#### 4. 配置 API Key

项目启动后，在浏览器页面右上角点击 **⚙️ 设置图标**，填写你的 API 配置：

- **API Endpoint**: `https://api.openai.com/v1`（或兼容接口）
- **API Key**: `sk-proj-xxxxxxxxxxxxx`
- **Model**: `gpt-image-2`

> ⚠️ **重要提示**: 不要将你的 API Key 分享给他人！每个使用者需要配置自己的 Key。

#### 5. 启动项目

**Windows 用户**：
```bash
# 双击运行（自动检查环境 + 安装依赖 + 启动）
start-amazon-image-studio.bat
```

**macOS / Linux 用户**：
```bash
chmod +x start-amazon-image-studio.sh
./start-amazon-image-studio.sh
```

**通用方式**：
```bash
npm run dev
```

>  **提示**：
> - `start-amazon-image-studio.bat` / `start-amazon-image-studio.sh` - 完整启动（自动检查环境 + 安装依赖）
> - `stop-amazon-image-studio.bat` - 停止服务（关闭所有 Node 进程）

#### 6. 访问应用

浏览器打开：**http://localhost:5173**

---

## 📖 使用说明

### 第一步：上传产品图（必需）

- 点击或拖拽上传产品图片
- 支持多张（不同角度）
- 自动压缩优化到 1920x1920 以内

### 第二步：填写产品信息

**1. 产品信息**
- 产品名称（必需）
- 所属类目（可选）
- 售卖国家/市场（可选）
- 尺寸规格（可选）
- 材质/工艺（可选）

**2. 核心卖点**
- 目标受众（可选）
- 核心卖点（必需，每行一个，最多 5 个）
- 补充信息（可选，使用步骤/场景要求等）

### 第三步：选择营销策略

从 7 种营销策略中选择：
- **🎯 通用基础型 (Basic)** - 最通用，适合大多数产品
- **🔥 卖点聚焦型 (Feature Focus)** - 突出核心卖点，适合功能创新产品
- **📊 信息图表型 (Infographic)** - 数据密集展示，适合参数复杂产品
- ** 生活方式型 (Lifestyle)** - 场景化展示，适合家居/服装
- **⚡ 科技感型 (Technical)** - 未来感视觉，适合数码/科技产品
- **💎 高端奢华型 (Premium)** - 精致高级感，适合奢侈品
- **👗 时尚潮流型 (Fashion)** - 时尚视觉，适合服装/配饰

### 第四步：选择复杂度

- **L1 极速版** - 简洁卖点 + 白底 + 简短文字（低成本）
- **L2 标准版** - 平衡质量和成本（推荐）
- **L3 精品版** - 极致详细 + 信息图 + 情绪化场景（高质量）

### 第五步：AI 分析生成策略

1. 点击 **"✨ 一键生成套图策略"**
2. AI 会根据产品信息生成 7 张图片的详细策略
3. 包含：构图、场景、色彩、文案、图标等
4. 可手动调整任何一张图的策略

### 第六步：生成图片

1. 点击 **"🚀 生成 7 张图片"**
2. 等待 AI 逐张生成（实时预览）
3. 生成完成后可下载单张或全部

---

## ️ 部署方案

### 方案一：开发环境（本地使用）

按照上面的"快速开始"步骤即可。

### 方案二：生产环境（团队共享）

#### PM2 部署（推荐）

```bash
# 1. 构建前端
cd frontend
npm install
npm run build

# 2. 安装 PM2
npm install -g pm2

# 3. 配置环境变量
cd ../backend
# 编辑 .env 文件，设置：
# IMAGE_GEN_API_KEY=sk-xxxxx
# NODE_ENV=production

# 4. 启动服务
cd ..
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# 5. 访问
# http://localhost:3001
```

#### Docker 部署

```bash
# 一键启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 方案三：云部署

支持部署到以下平台：
- **Vercel** - 前端 + Serverless 函数
- **Railway** - 一键部署
- **Render** - 免费额度
- **阿里云/腾讯云** - 传统服务器

详见 [DEPLOYMENT.md](./docs/DEPLOYMENT.md)

---

## ⚙️ API 配置说明

本项目使用**两个独立的 API 配置**：

| 用途 | 配置项 | 推荐服务商 | 免费额度 |
|------|--------|------------|----------|
| **图像生成** | `IMAGE_GEN_*` | claudex.me / OpenAI | - |
| **Agent 文本分析** | `AGENT_*` | 智谱 AI / Gemini / Groq | 2000 万 Token / 1500 请求/天 |

### 图像生成 API（必需）

```env
IMAGE_GEN_API_KEY=sk-your-api-key-here
IMAGE_GEN_BASE_URL=https://claudex.me/v1
IMAGE_GENERATION_MODEL=gpt-image-2
```

### Agent 文本分析 API（可选）

用于 AI 智能分析产品、生成套图策略。不配置时，前端仍可手动填写图片策略。

| 服务商 | 免费额度 | 推荐度 | 配置 |
|--------|----------|--------|------|
| **智谱 AI** | 2000 万 Token | ⭐⭐⭐⭐⭐ | `AGENT_BASE_URL=https://open.bigmodel.cn/api/paas/v4/` `AGENT_MODEL=glm-4-flash` |
| **Google Gemini** | 1500 请求/天 | ⭐⭐⭐⭐ | `AGENT_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/` `AGENT_MODEL=gemini-2.0-flash` |
| **Groq** | 14000 请求/天 | ⭐⭐⭐ | `AGENT_BASE_URL=https://api.groq.com/openai/v1` `AGENT_MODEL=llama-3.3-70b-versatile` |
| **DeepSeek** | 新用户赠送 | ⭐⭐⭐⭐ | `AGENT_BASE_URL=https://api.deepseek.com/v1` `AGENT_MODEL=deepseek-chat` |

> 💡 Agent 分析 Token 消耗：L1 ~1000-1500 / L2 ~1500-2500 / L3 ~2500-4000

---

## 📁 项目结构

```
Amazon-image-ai/
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/       # UI 组件
│   │   │   ├── AmazonListingForm.jsx
│   │   │   ├── TemplateSelector.jsx      # 7 种营销策略选择器
│   │   │   ├── AgentAnalyzer.jsx         # AI 分析组件
│   │   │   ├── ProductImageUploader.jsx  # 拖拽上传
│   │   │   ├── TaskGrid.jsx              # 生成任务网格
│   │   │   ── ...
│   │   ├── utils/            # 工具函数
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ── vite.config.js
├── backend/                  # Express 后端
│   ├── routes/
│   │   ├── generate.js       # 图片生成接口
│   │   ├── agent-analyze.js  # AI 分析接口
│   │   ├── upload.js         # 文件上传接口
│   │   └── prompt-preview.js # 策略预览接口
│   ├── utils/
│   │   ├── productModel.js   # 产品模型工具
│   │   ├── upstreamRetry.js  # 上游重试工具
│   │   ├── uploads.js        # 上传工具
│   │   └── visualBlueprints.js # 视觉蓝图
│   ├── config/
│   │   ├── globalRules.js    # 全局规则
│   │   └── visual-templates/ # 视觉模板配置
│   ├── server.js
│   └── package.json
├── docs/                     # 文档
│   ├── ARCHITECTURE.md       # 架构设计
│   ├── DEPLOYMENT.md         # 部署指南
│   └── API.md                # API 说明
├── .gitignore
├── package.json              # 根项目配置
├── start-amazon-image-studio.bat      # Windows 启动脚本
├── start-amazon-image-studio.ps1      # Windows PowerShell 启动逻辑
├── start-amazon-image-studio.sh       # macOS/Linux 启动脚本
├── stop-amazon-image-studio.bat       # Windows 停止脚本
└── README.md
```

---

## 🔧 常见问题

### 1. 安装依赖失败

```bash
# 清除缓存重试
npm cache clean --force
npm ci

# 或使用淘宝镜像
npm config set registry https://registry.npmmirror.com
npm ci
```

### 2. 端口被占用

如果 5173 或 3001 端口被占用：

```bash
# 查看占用端口的进程
# Windows
netstat -ano | findstr :5173

# macOS/Linux
lsof -i :5173

# 杀死进程或修改端口
# 编辑 frontend/vite.config.js 修改 port
```

### 3. API Key 无效

- 确认 API Key 格式正确（`sk-proj-` 或 `sk-` 开头）
- 确认账户有足够余额
- 检查 API Endpoint 是否正确
- 测试网络连接

### 4. 图片生成失败

- 检查 API Key 是否有效（在设置中点击"测试连接"）
- 查看后端日志（终端窗口）
- 确认产品信息填写完整
- 重试或刷新页面

### 5. AI 分析失败

- 检查 `AGENT_API_KEY` 配置（支持智谱 AI/Gemini/Groq/DeepSeek）
- 确认 `AGENT_BASE_URL` 和 `AGENT_MODEL` 正确
- 查看后端日志具体错误信息

---

## 📝 更新日志

### v2.0.0 (2026-06-30)
- ✅ 新增 7 种营销策略库（替代旧版 8 种风格）
- ✅ 新增 3 级复杂度控制（L1/L2/L3）
- ✅ 新增 AI 智能分析功能（一键生成 7 张图策略）
- ✅ 新增拖拽上传功能
- ✅ 新增单图重试功能
- ✅ 优化表单结构为 3 步流程
- ✅ 删除冗余字段和组件

### v1.0.0 (2026-06-05)
- ✅ 初始版本发布
- ✅ Amazon Listing 表单（9 个核心字段）
- ✅ GPT-Image-2 集成
- ✅ 8 种风格选择器
- ✅ 合规检查功能
- ✅ API 配置界面

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

---

## 👨‍💻 作者

**神秘杨**

- GitHub: [@SHENMIYANG](https://github.com/SHENMIYANG)

---

## 🙏 致谢

感谢以下开源项目：
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Express](https://expressjs.com/)
- [OpenAI](https://openai.com/)

---

**⭐ 如果这个项目对你有帮助，请给个 Star！**
