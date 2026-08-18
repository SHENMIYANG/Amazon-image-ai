# Amazon Image Studio

## 2026-07 当前版本更新

- 结果图支持“图片反馈对话”：每张生成图可以单独打开聊天窗口，AI 会读取该图的中文策略、英文执行稿、执行保护和上次最终生图 prompt。
- 对话支持真实操作触发：如果运营说“好了，生成图片吧”“按这个重做”，AI 会返回 `generate_ready`，前端会调用现有单张重新生成流程，而不是只做假回复。
- 对话记忆只保存在当前页面当前图片里；刷新页面或换新产品后归零，避免不同产品互相污染。
- 新增后端接口 `POST /api/image-feedback/chat`，模型默认使用 `IMAGE_FEEDBACK_MODEL || AGENT_MODEL || gpt-4o-mini`。

面向亚马逊铺货场景的商品套图生成工具。

这个项目的核心目标不是“直接让模型乱画”，而是把产品图、产品资料、运营要求先整理成可执行策略，再交给 `gpt-image-2` 生成更稳定的 Amazon 主图 / 副图。

## 项目定位

适合这类工作流：

1. 上传产品主图和辅助参考图
2. 填写 Listing、卖点、使用方式、场景补充、国家语言等信息
3. AI 先理解产品，再按你选定的图片类型生成中文策略
4. 运营检查中文策略，必要时手动改
5. 系统保存对应英文执行稿
6. 按单张策略调用生图接口
7. 支持单张重生、补参考图、继续生成、下载结果

它更像一个“商品图策略工作台”，而不是单纯的 Prompt 输入框。

## 当前功能

### 1. 产品素材输入

- 最多上传 `8` 张图片
- 支持设置一张主图作为产品真实性最高依据
- 其余参考图用于补充角度、结构、使用方式、竞品版式、氛围风格
- 上传后通过后端 `/api/upload` 落盘，前端会等待上传资源可访问后再发分析请求

### 2. 商品信息输入

前端统一收集这些信息：

- `listingInfo`
- `additionalInfo`
- `marketplace`
- `imageLanguage`
- `fontPreference`
- `brandColorMode` / `brandColor`
- `complexity`
- `selectedImageTasks`

其中 `listingInfo` 和 `additionalInfo` 是当前项目最核心的业务输入。

### 3. 图片任务规划

当前支持的图片类型：

- 主图 `main`
- 卖点图 `feature`
- 场景图 `scenario`
- 细节图 `detail`
- 尺寸图 `dimensions`
- 步骤图 `steps`
- 对比图 `comparison`
- 包装图 `package`
- 总结图 `summary`

每种类型都可以单独设置张数，系统会根据你实际勾选的任务生成对应数量的策略，不再强制固定 7 张。

### 4. AI 策略生成

`/api/agent-analyze` 会基于：

- 主图
- 辅助参考图
- 产品资料
- 图片任务类型
- 出图复杂度

生成两类结果：

- `productBlueprint`：产品理解层
- `imagePlans[]`：每张图的中文策略 + 英文执行稿

其中：

- 中文 `strategyContent` 是运营可读、可修改的唯一策略正文
- 英文 `promptEn` 是对应这张图的执行稿
- 主图有固定的 Amazon 主图规则，不走自由发挥

### 5. 生图执行

`/api/generate` 的职责是执行，不重新做业务决策。

当前代码已经在往这个方向收敛：

- 主图按固定白底 Amazon 规则执行
- 非主图尽量按当前 `strategyContent / promptEn` 执行
- 支持单张重新生成
- 单张重生时可以补 1 张额外参考图
- 支持 `L1 / L2 / L3` 复杂度
- 分辨率支持 `2K / 4K` 选项

### 6. 英文执行稿同步

项目当前是“双轨策略”：

- 运营看中文策略
- 模型执行英文策略

如果 `agent-analyze` 阶段已经生成了英文稿，后续直接生图不会再重复翻译。

只有这些情况下，前端才会再次请求 `/api/prompt-preview`：

- 某张图的中文策略被手动改过
- 该图 `promptEn` 缺失
- 该图被标记为 `promptDirty`

## 当前工作流

详见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)，这里先给最实用版本：

```text
上传产品图 + 填资料
    ↓
AI 分析产品，生成 productBlueprint 和每张图的中文/英文策略
    ↓
运营查看中文策略
    ↓
如果要改，改单张策略并保存英文执行稿
    ↓
开始生图
    ↓
如果某张不满意，单张重生，可补参考图
```

这个流程是当前项目的主流程，后续改功能也建议尽量围绕这条链路扩展，而不是再回到“超长 Prompt 一把梭”。

## 技术栈

### 前端

- React 18
- Vite 5
- 原生 CSS

### 后端

- Node.js 20+
- Express 4
- Multer
- Sharp
- Axios

### 模型与接口

- 图像生成：`gpt-image-2` 兼容接口
- 策略分析：`AGENT_*` 指向的文本模型接口

## 目录结构

```text
.
├─ frontend/                     # React + Vite 前端
│  ├─ src/
│  │  ├─ components/            # 表单、上传、分析、结果区组件
│  │  ├─ utils/                 # 请求载荷、图片任务、表单解析等
│  │  ├─ App.jsx                # 主页面入口
│  │  └─ main.jsx
│  └─ package.json
├─ backend/                      # Express 后端
│  ├─ routes/
│  │  ├─ auth.js                # 登录和退出
│  │  ├─ members.js             # 成员与角色管理
│  │  ├─ upload.js              # 图片上传
│  │  ├─ agent-analyze.js       # 产品理解 + 策略生成
│  │  ├─ prompt-preview.js      # 单张策略英文执行稿同步
│  │  ├─ generate.js            # 生图执行
│  │  └─ testApiKey.js          # 接口配置测试
│  ├─ utils/
│  ├─ services/auth/            # 密码、会话和权限
│  ├─ prisma/                    # PostgreSQL 数据模型和迁移
│  ├─ server.js
│  └─ package.json
├─ docs/
│  ├─ API.md
│  ├─ ARCHITECTURE.md
│  ├─ DEPLOYMENT.md
│  ├─ GENERATION_RULES.md
│  └─ SERVER_QUICK_DEPLOY.md
├─ ecosystem.config.js
├─ docker-compose.yml
└─ README.md
```

## 本地开发

### 环境要求

- Node.js `>= 20`
- npm `>= 9`

### 安装依赖

```bash
npm ci
cd frontend && npm ci
cd ../backend && npm ci
```

### 启动开发环境

在项目根目录：

```bash
npm run dev
```

默认会同时启动：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`
- 健康检查：`http://localhost:3001/api/health`

### 单独启动

```bash
npm run dev:frontend
npm run dev:backend
```

## 生产启动

### PM2

项目内已经有 `ecosystem.config.js`：

```bash
pm2 start ecosystem.config.js
pm2 restart ecommerce-image-gen
pm2 logs ecommerce-image-gen
```

PM2 配置当前默认：

- 应用名：`ecommerce-image-gen`
- 运行目录：`./backend`
- 端口：`3001`
- 模式：`production`

### Docker

```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## 环境变量

后端主要读取这些变量：

### 图像生成

```env
IMAGE_GEN_API_KEY=
IMAGE_GEN_BASE_URL=
IMAGE_GENERATION_MODEL=gpt-image-2
IMAGE_GEN_TIMEOUT_MS=300000
IMAGE_GEN_QUALITY=high
IMAGE_PROMPT_MAX_CHARS=6500
```

### 策略分析 / 翻译

```env
AGENT_API_KEY=
AGENT_BASE_URL=
AGENT_MODEL=
AGENT_TIMEOUT_MS=180000
```

### 服务运行

```env
NODE_ENV=development
BACKEND_PORT=3001
JSON_BODY_LIMIT=4mb
CORS_ORIGIN=
UPLOAD_RETENTION_HOURS=24
```

### 数据库与登录

启用 PostgreSQL 后，工作台会要求登录。认证和业务数据使用同一个数据库。

```env
DATABASE_URL=postgresql://amazon_image:your_password@127.0.0.1:5432/amazon_image?schema=public
AUTH_ENABLED=true
AUTH_SESSION_DAYS=14
BOOTSTRAP_ADMIN_LOGIN=admin
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-strong-password
BOOTSTRAP_ADMIN_NAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=
```

首次启用前执行：

```bash
cd backend
npm run db:generate
npm run db:migrate:deploy
```

初始管理员只会创建一次。之后从右上角“成员与权限”添加运营、美工和查看者。

- 管理员：成员管理和全部工作台操作
- 运营：上传、策略、生图、聊天和下载
- 美工：全部工作台操作
- 查看者：查看和下载

## 关键代码说明

### 前端

- [frontend/src/App.jsx](./frontend/src/App.jsx)
  - 主状态中心
  - 生图、重生、继续生成、英文稿同步都在这里串起来

- [frontend/src/components/AmazonListingForm.jsx](./frontend/src/components/AmazonListingForm.jsx)
  - 商品输入区
  - 图片任务规划
  - 策略编辑区

- [frontend/src/components/AgentAnalyzer.jsx](./frontend/src/components/AgentAnalyzer.jsx)
  - 上传资源探测
  - 调用 `/api/agent-analyze`

- [frontend/src/components/TaskGrid.jsx](./frontend/src/components/TaskGrid.jsx)
  - 结果区
  - 查看、下载、重生、历史版本等操作

- [frontend/src/utils/imageTasks.js](./frontend/src/utils/imageTasks.js)
  - 图片类型定义
  - 默认任务配置

- [frontend/src/utils/requestPayload.js](./frontend/src/utils/requestPayload.js)
  - 分析请求、生图请求的 payload 组织

### 后端

- [backend/server.js](./backend/server.js)
  - 路由注册
  - JSON 限制
  - 健康检查
  - 上传目录静态托管

- [backend/routes/agent-analyze.js](./backend/routes/agent-analyze.js)
  - 产品理解
  - 主图固定策略
  - 每张图的中文策略和英文执行稿生成

- [backend/routes/generate.js](./backend/routes/generate.js)
  - 生图接口
  - 非主图执行 Prompt 组织
  - 分辨率、复杂度、参考图处理

- [backend/routes/prompt-preview.js](./backend/routes/prompt-preview.js)
  - 单张策略英文执行稿生成

- [backend/routes/upload.js](./backend/routes/upload.js)
  - 上传数量限制
  - 文件大小和格式校验

## 当前代码里的重要约束

### 上传限制

- 最多 `8` 张图片
- 单张最大 `10MB`
- 支持：`jpg / jpeg / png / gif / webp`

### 主图规则

主图是固定规则，不是完全自由策略：

- 纯白背景
- 无文字
- 无额外装饰
- 符合 Amazon 主图规范
- 主图参考优先级最高

### 复杂度

当前支持：

- `L1`：更快、更简洁
- `L2`：标准版，当前 UI 默认值
- `L3`：更强调层级、信息量和质感

复杂度会参与：

- AI 策略生成
- 生图执行

## 已知现实情况

这个项目当前已经比旧版流程清晰很多，但仍然要明确几件事：

1. 参考图越能体现真实结构，策略和生图越稳  
2. 安装类、夹持类、组合套装类产品，对“产品理解”和“参考图质量”要求更高  
3. 英文执行稿和中文策略需要尽量保持一一对应，否则会造成执行偏差  
4. 非主图不应该再让 Generate 层自己做太多“二次创作”决策  

如果后续继续优化，建议优先守住这条原则：

> 策略层负责决策，Generate 层负责执行。

## 常见命令

```bash
# 根目录开发
npm run dev

# 构建前端
npm run build

# 启动后端生产服务
npm run start

# 后端测试脚本
cd backend
npm run test:generation-pipeline
```

## 后续文档建议

如果继续补文档，建议按这三个方向补：

1. `docs/ARCHITECTURE.md`  
   重点写清楚产品理解、策略生成、英文执行稿、生图执行四层关系

2. `docs/API.md`  
   补齐前后端真实请求结构和字段说明

3. `docs/GENERATION_RULES.md`  
   只保留当前有效规则，删掉过期的旧模板描述

---

如果你接下来要继续维护这个项目，建议先把 README 当作“当前真实版本说明书”，不要再把旧时代的 7 套固定模板、旧表单结构、旧策略链路写回来了。
