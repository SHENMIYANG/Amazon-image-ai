# Amazon Image AI 🚀

亚马逊电商图片 AI 生成工具 - 基于 GPT-Image-2 自动生成高质量商品主图和 A+ 页面图片

![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)
![React](https://img.shields.io/badge/React-18-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ 核心功能

- 📝 **智能 Listing 表单** - 9 个核心字段，3 分钟完成产品信息录入
- 🎨 **GPT-Image-2 集成** - 自动生成符合亚马逊规范的 7 张主图
- 📊 **A+ 页面生成** - 一键生成 A+ 页面所需的全部图片
- 🔍 **合规检查** - 自动检测图片是否符合亚马逊平台规范
- 🎯 **8 种风格选择** - 简约/商务/科技感/温馨等预设风格
- ⚙️ **API 配置界面** - 支持 OpenAI 及兼容接口，灵活配置

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

**Windows 用户（推荐）**：
```bash
# 双击运行
start-amazon-image-studio.bat

# 或在命令行执行
.\start-amazon-image-studio.bat
```

**macOS / Linux 用户**：
```bash
# 赋予执行权限（首次）
chmod +x start-amazon-image-studio.sh

# 运行
./start-amazon-image-studio.sh
```

**通用方式**：
```bash
npm run dev
```

#### 6. 访问应用

浏览器打开：**http://localhost:5173**

---

## 📖 使用说明

### 第一步：填写产品信息

在左侧表单中填写以下信息（带 * 为必填）：

1. **产品名称** - 例如：Wireless Bluetooth Headphones
2. **所属类目** - 英文填写，例如：Electronics > Headphones
3. **售卖国家** - 选择目标市场（美国/英国/德国等）
4. **尺寸规格** - 例如：10 x 5 x 3 inches, 1.5 lbs
5. **材质/表面工艺** - 例如：ABS Plastic, Matte Finish
6. **图片类型** - 7 张主图 / A+ 页面图 / 两者都要
7. **目标受众** - 例如：Busy professionals, Fitness enthusiasts
8. **核心卖点** - 每行一个卖点，最多 5 个
9. **场景图要求** - 描述期望的场景效果

### 第二步：选择风格

从 8 种预设风格中选择适合你产品的：
- 简约现代
- 商务专业
- 科技感
- 温馨家居
- 自然清新
- 奢华高端
- 运动活力
- 可爱卡通

### 第三步：生成图片

点击 **开始生成图片** 按钮，等待 AI 自动生成 7 张高质量图片。

### 第四步：下载和使用

生成完成后：
- 预览每张图片
- 点击下载按钮保存
- 直接上传到亚马逊 Listing

---

## 🛠️ 部署方案

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
# OPENAI_API_KEY=sk-proj-xxxxx
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

## 📁 项目结构

```
Amazon-image-ai/
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/       # UI 组件
│   │   │   ├── AmazonListingForm.jsx
│   │   │   ├── StyleSelector.jsx
│   │   │   ├── SettingsModal.jsx
│   │   │   └── ...
│   │   ├── utils/            # 工具函数
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/                  # Express 后端
│   ├── routes/
│   │   ├── generate.js       # 图片生成接口
│   │   ├── upload.js         # 文件上传接口
│   │   └── testApiKey.js     # API Key 测试接口
│   ├── server.js
│   └── package.json
├── docs/                     # 文档
│   ├── ARCHITECTURE.md       # 架构设计
│   ├── DEPLOYMENT.md         # 部署指南
│   └── API.md                # API 说明
├── .gitignore
├── package.json              # 根项目配置
├── start-amazon-image-studio.bat      # Windows 启动脚本
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

---

## 📝 更新日志

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
