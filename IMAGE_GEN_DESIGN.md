# 电商图片生成工具 - 技术设计文档

## 核心思路

**纯前端 React + 轻量后端代理**

- 前端：负责所有 UI 交互和状态管理
- 后端：只做一件事——转发请求到 OpenAI 并藏住 API Key

## 关键设计决策

### 7 张 ImagePlan 卡片
- 每张图是一个独立的 ImagePlan
- 运营人员自己填写参数
- 填完后前端根据产品信息 + 图片方案自动拼装 Prompt
- 直接调用生成接口，**完全跳过 AI 策划**

### 与原项目的主要区别
| 原项目 | 新项目 |
|--------|--------|
| 一个大输入框 + AI 策划 | 结构化表单 + 7 张卡片 |
| AI 自动生成方案 | 运营手动填写方案 |
| 适合单人使用 | 更适合团队协作 |

## 技术栈

### 前端
- React 18
- Vite
- TailwindCSS (可选)
- Axios

### 后端
- Node.js
- Express
- CORS
- dotenv

## 项目结构

```
ecommerce-image-gen/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImagePlanCard.jsx    # 单张图片方案卡片
│   │   │   ├── ProductForm.jsx      # 产品信息表单
│   │   │   ├── TaskGrid.jsx         # 任务列表网格
│   │   │   └── GenerateButton.jsx   # 生成按钮
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── server.js
│   ├── routes/
│   │   └── generate.js
│   ├── .env
│   └── package.json
├── .env.example
└── README.md
```

## 数据流

1. 用户填写产品信息（名称、卖点、目标人群等）
2. 用户填写 7 张图的 ImagePlan（场景、构图、色调等）
3. 前端拼装 Prompt：`产品信息 + ImagePlan1-7`
4. 调用后端代理接口 `/api/generate`
5. 后端转发到 OpenAI DALL-E 3 API
6. 返回生成的图片 URL

## API 设计

### POST /api/generate
```json
{
  "product": {
    "name": "产品名称",
    "sellingPoints": ["卖点 1", "卖点 2"],
    "targetAudience": "目标人群"
  },
  "imagePlans": [
    {
      "id": 1,
      "scene": "使用场景",
      "composition": "构图方式",
      "colorTone": "色调",
      "elements": ["元素 1", "元素 2"]
    }
    // ... 共 7 张
  ]
}
```

## 启动命令

```bash
# 前端
cd frontend
npm install
npm run dev

# 后端
cd backend
npm install
npm run dev
```

## 环境变量

```
OPENAI_API_KEY=sk-xxx
BACKEND_PORT=3001
FRONTEND_PORT=5173
```
