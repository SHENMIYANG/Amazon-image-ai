# 快速开始指南

## 5 分钟上手

### 第 1 步：下载项目（1 分钟）

**方式 A - Git Clone（推荐）**
```bash
git clone https://github.com/SHENMIYANG/Amazon-image-ai.git
cd Amazon-image-ai
```

**方式 B - 下载 ZIP**
- 点击仓库页面的 **Code** → **Download ZIP**
- 解压到任意目录
- 打开终端进入项目目录

### 第 2 步：安装依赖（2 分钟，仅首次）

```bash
# 一条命令搞定
npm run install:all
```

> 💡 **提示**: 如果下载慢，使用淘宝镜像：
> ```bash
> npm config set registry https://registry.npmmirror.com
> npm run install:all
> ```

### 第 3 步：启动服务（30 秒）

**方式 A - 快速启动（依赖已安装时）**

**Windows 用户**：
```bash
# 双击运行
start.bat
```

**macOS / Linux 用户**：
```bash
./start.sh
```

**方式 B - 完整启动（首次使用或分发给他人的）**

自动检查 Node.js、安装依赖、启动服务：

**Windows 用户**：
```bash
# 双击运行
start-amazon-image-studio.bat
```

**macOS / Linux 用户**：
```bash
chmod +x start-amazon-image-studio.sh
./start-amazon-image-studio.sh
```

看到以下提示表示启动成功：
```
✅ 前端：http://localhost:5173
✅ 后端：http://localhost:3001
```

> 💡 **提示**：
> - `start.bat` / `start.sh` - 快速启动（依赖已安装）
> - `start-amazon-image-studio.bat` / `start-amazon-image-studio.sh` - 完整启动（自动检查环境 + 安装依赖）
> - `stop-amazon-image-studio.bat` - 停止服务（关闭所有 Node 进程）

### 第 4 步：配置 API Key（1 分钟）

1. 浏览器打开 **http://localhost:5173**
2. 点击右上角 **⚙️** 图标
3. 填写配置：
   - **API Endpoint**: `https://api.openai.com/v1`
   - **API Key**: `sk-proj-xxxxxxxxxxxxx`
   - **Model**: `gpt-image-2`
4. 点击 **测试连接**，显示成功即可

> 💡 **没有 API Key？**
> - 访问 https://platform.openai.com 注册
> - 创建 API Key（需要充值至少 $1）
> - 详见 [docs/API.md](./docs/API.md)

### 第 5 步：生成图片（3 分钟）

1. **填写产品信息**（带 * 必填）
   - 产品名称、所属类目、售卖国家
   - 尺寸规格、材质/表面工艺
   - 目标受众、核心卖点（5 点）
   - 场景图要求、图片类型

2. **选择风格**
   - 从 8 种预设风格中选择

3. **点击"开始生成图片"**
   - 等待 2-3 分钟
   - 自动生成 7 张高质量图片

4. **下载和使用**
   - 预览每张图片
   - 点击下载保存
   - 上传到亚马逊 Listing

---

## 完整示例

### 示例产品：无线蓝牙耳机

**填写信息**：
```
产品名称*: Wireless Bluetooth Headphones with Noise Cancelling
所属类目*: Electronics > Headphones
售卖国家*: 美国 (Amazon.com)
尺寸规格*: 7.5 x 6.7 x 3.5 inches, 0.55 lbs
材质/表面工艺*: ABS Plastic, Matte Black Finish
图片类型*: 7 张主图
目标受众*: Busy professionals, commuters, fitness enthusiasts
核心卖点*:
Advanced Active Noise Cancelling
40-Hour Battery Life
Comfortable Over-Ear Design
Built-in Microphone for Calls
Foldable and Portable
场景图要求*: Product on modern desk with laptop and coffee cup, 
natural lighting from window, minimalist workspace style
```

**选择风格**: 科技感

**等待生成**: 约 3 分钟

**结果**: 7 张高质量产品图，可直接上传亚马逊

---

## 常见问题

### Q1: 安装依赖失败？

**A**: 使用淘宝镜像：
```bash
npm config set registry https://registry.npmmirror.com
npm run install:all
```

### Q2: 启动后无法访问？

**A**: 检查端口是否被占用：
```bash
# Windows
netstat -ano | findstr :5173

# macOS/Linux
lsof -i :5173
```

### Q3: API Key 测试失败？

**A**: 
- 确认 Key 格式正确（`sk-proj-` 或 `sk-` 开头）
- 检查账户余额
- 确认网络可访问 OpenAI

### Q4: 图片生成失败？

**A**:
- 检查 API Key 是否有效
- 查看后端日志（终端窗口）
- 确认产品信息填写完整
- 重试或刷新页面

---

## 下一步

- 📖 详细文档：[docs/](./docs/)
- 🏗️ 架构设计：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 🚀 部署指南：[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- 🔑 API 配置：[docs/API.md](./docs/API.md)
- 📝 生成规则：[docs/GENERATION_RULES.md](./docs/GENERATION_RULES.md)

---

## 获取帮助

- 📝 提交 Issue: https://github.com/SHENMIYANG/Amazon-image-ai/issues
- 📧 联系作者：通过 GitHub

---

**祝你使用愉快！** 🎉
